// On-disk HTTP cache for retrieved pages.
//
// The skill's loop is explicitly repetitive: analyze the gaps, drill, then
// "fold findings in with a single research re-run that PINS the proven URLs".
// A research run rebuilds the dossier from scratch, so every one of those
// re-runs re-downloaded every page it had already read. The baseline run pulled
// 1.9 MB across 13 requests and spent 17 s doing it, almost all of it in page
// fetches — and the second run would have paid exactly the same price for
// exactly the same bytes.
//
// So: cache page bodies by URL, revalidate with ETag / Last-Modified once the
// entry goes stale, and let `--refresh` bypass it and `--offline` require it.
// Entries are split in two files (metadata + raw body) so a multi-megabyte page
// is never JSON-escaped through a parse/stringify round-trip.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CACHE_TTL_HOURS } from "../config.js";

// Which extractor produced the stored body. This is part of the cache KEY in
// spirit (not in the filename): the same URL yields very different text through
// the built-in regex stripper and through Firecrawl's main-content markdown, so
// an entry written by one must never be served to the other — otherwise a stale
// native body shadows Firecrawl for the whole TTL (a week, by default).
// A sidecar written before this field existed is `native` by construction.
export type Extractor = "native" | "firecrawl";

export interface CacheEntry {
  url: string;
  status: number;
  contentType: string;
  extractor?: Extractor;
  etag?: string;
  lastModified?: string;
  fetchedAt: number; // epoch ms
}

/** The extractor an entry was written by; absent (pre-3.2 sidecar) = native. */
export function extractorOf(entry: CacheEntry): Extractor {
  return entry.extractor === "firecrawl" ? "firecrawl" : "native";
}

export interface CacheOptions {
  /** Ignore any stored entry and re-fetch (still writes the fresh result). */
  refresh: boolean;
  /** Never touch the network: serve from cache or fail with an honest note. */
  offline: boolean;
}

let options: CacheOptions = { refresh: false, offline: false };

export function configureCache(opts: Partial<CacheOptions>): void {
  options = { ...options, ...opts };
}

export function cacheOptions(): CacheOptions {
  return { ...options };
}

export function cacheDir(): string {
  const override = process.env.CONSTRUCT_CACHE_DIR?.trim();
  if (override) return override;
  return join(homedir(), ".cache", "construct", "http");
}

function ttlMs(): number {
  const raw = Number(process.env.CONSTRUCT_CACHE_TTL_HOURS);
  const hours = Number.isFinite(raw) && raw >= 0 ? raw : CACHE_TTL_HOURS;
  return hours * 3600_000;
}

function keyFor(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 32);
}

function paths(url: string): { meta: string; body: string } {
  const k = keyFor(url);
  const dir = cacheDir();
  return { meta: join(dir, `${k}.json`), body: join(dir, `${k}.body`) };
}

/** The stored entry for `url`, or null when absent/unreadable. */
export function read(url: string): { entry: CacheEntry; body: string } | null {
  const { meta, body } = paths(url);
  if (!existsSync(meta) || !existsSync(body)) return null;
  try {
    const entry = JSON.parse(readFileSync(meta, "utf8")) as CacheEntry;
    if (typeof entry?.fetchedAt !== "number") return null;
    return { entry, body: readFileSync(body, "utf8") };
  } catch {
    // A half-written or hand-mangled entry is a cache miss, never an error:
    // the cache is an optimisation and must not be able to fail a run.
    return null;
  }
}

/** Is this entry still within the TTL? */
export function isFresh(entry: CacheEntry, now: number = Date.now()): boolean {
  return now - entry.fetchedAt < ttlMs();
}

export function write(url: string, entry: Omit<CacheEntry, "url" | "fetchedAt">, body: string, now: number = Date.now()): void {
  try {
    mkdirSync(cacheDir(), { recursive: true });
    const p = paths(url);
    writeFileSync(p.body, body);
    writeFileSync(p.meta, JSON.stringify({ url, fetchedAt: now, ...entry }, null, 2));
  } catch {
    // Out of disk, read-only home, sandboxed CI — degrade to no caching rather
    // than failing the research run.
  }
}

/** Refresh an entry's timestamp after a 304, without rewriting the body. */
export function touch(url: string, now: number = Date.now()): void {
  const cur = read(url);
  if (!cur) return;
  // Carry every stored field over rather than listing them: a field that goes
  // missing here (as `extractor` would) silently changes what the entry means.
  const { url: _url, fetchedAt: _fetchedAt, ...rest } = cur.entry;
  write(url, rest, cur.body, now);
}

/** Conditional-request headers for a stale entry, so a 304 costs no body. */
export function revalidationHeaders(entry: CacheEntry): Record<string, string> {
  const h: Record<string, string> = {};
  if (entry.etag) h["if-none-match"] = entry.etag;
  if (entry.lastModified) h["if-modified-since"] = entry.lastModified;
  return h;
}

export interface CacheStats {
  dir: string;
  entries: number;
  bytes: number;
  fresh: number;
  stale: number;
  ttlHours: number;
  oldest?: string;
  newest?: string;
}

export function stats(now: number = Date.now()): CacheStats {
  const dir = cacheDir();
  const out: CacheStats = { dir, entries: 0, bytes: 0, fresh: 0, stale: 0, ttlHours: ttlMs() / 3600_000 };
  if (!existsSync(dir)) return out;
  let oldest = Number.POSITIVE_INFINITY;
  let newest = 0;
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    try {
      out.bytes += statSync(abs).size;
    } catch {
      continue;
    }
    if (!name.endsWith(".json")) continue;
    try {
      const entry = JSON.parse(readFileSync(abs, "utf8")) as CacheEntry;
      out.entries++;
      if (isFresh(entry, now)) out.fresh++;
      else out.stale++;
      if (entry.fetchedAt < oldest) oldest = entry.fetchedAt;
      if (entry.fetchedAt > newest) newest = entry.fetchedAt;
    } catch {
      /* not an entry */
    }
  }
  if (out.entries) {
    out.oldest = new Date(oldest).toISOString();
    out.newest = new Date(newest).toISOString();
  }
  return out;
}

/** Remove stale entries, or everything with `all`. Returns how many went. */
export function clean(all: boolean, now: number = Date.now()): number {
  const dir = cacheDir();
  if (!existsSync(dir)) return 0;
  let removed = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const meta = join(dir, name);
    let drop = all;
    if (!drop) {
      try {
        drop = !isFresh(JSON.parse(readFileSync(meta, "utf8")) as CacheEntry, now);
      } catch {
        drop = true; // unreadable entries are worth dropping either way
      }
    }
    if (!drop) continue;
    rmSync(meta, { force: true });
    rmSync(join(dir, name.replace(/\.json$/, ".body")), { force: true });
    removed++;
  }
  return removed;
}
