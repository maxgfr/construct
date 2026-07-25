// The on-disk page cache.
//
// It exists because the skill's own loop is repetitive by design: every fold-in
// re-runs `research`, which rebuilds the dossier from scratch. Without a cache
// that meant re-downloading every page the run had already read. The rules that
// matter are all about honesty under failure — a cache that silently serves the
// wrong thing, or silently serves nothing, is worse than none.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheDir, clean, configureCache, cacheOptions, isFresh, read, revalidationHeaders, stats, touch, write } from "../src/research/cache.js";

let dir: string;
let prevDir: string | undefined;
let prevTtl: string | undefined;

beforeEach(() => {
  prevDir = process.env.CONSTRUCT_CACHE_DIR;
  prevTtl = process.env.CONSTRUCT_CACHE_TTL_HOURS;
  dir = mkdtempSync(join(tmpdir(), "construct-cache-"));
  process.env.CONSTRUCT_CACHE_DIR = dir;
  configureCache({ refresh: false, offline: false });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (prevDir === undefined) delete process.env.CONSTRUCT_CACHE_DIR;
  else process.env.CONSTRUCT_CACHE_DIR = prevDir;
  if (prevTtl === undefined) delete process.env.CONSTRUCT_CACHE_TTL_HOURS;
  else process.env.CONSTRUCT_CACHE_TTL_HOURS = prevTtl;
});

const meta = { status: 200, contentType: "text/html", etag: 'W/"abc"', lastModified: "Wed, 01 Jul 2026 00:00:00 GMT" };

describe("round-trip", () => {
  it("stores and returns a body with its validators", () => {
    write("https://a.example/page", meta, "<html>hello</html>");
    const got = read("https://a.example/page");
    expect(got?.body).toBe("<html>hello</html>");
    expect(got?.entry.etag).toBe('W/"abc"');
    expect(got?.entry.contentType).toBe("text/html");
  });

  it("keys entries by URL, never mixing two pages up", () => {
    write("https://a.example/one", meta, "ONE");
    write("https://a.example/two", meta, "TWO");
    expect(read("https://a.example/one")?.body).toBe("ONE");
    expect(read("https://a.example/two")?.body).toBe("TWO");
  });

  it("reports a miss for an unknown URL", () => {
    expect(read("https://nothing.example")).toBeNull();
  });

  it("honours CONSTRUCT_CACHE_DIR", () => {
    expect(cacheDir()).toBe(dir);
  });
});

describe("freshness", () => {
  it("treats an entry inside the TTL as fresh and outside it as stale", () => {
    process.env.CONSTRUCT_CACHE_TTL_HOURS = "1";
    write("https://ttl.example", meta, "body", 1_000_000);
    const entry = read("https://ttl.example")!.entry;
    expect(isFresh(entry, 1_000_000 + 30 * 60_000)).toBe(true); // +30 min
    expect(isFresh(entry, 1_000_000 + 2 * 3600_000)).toBe(false); // +2 h
  });

  it("offers conditional headers so revalidating a stale entry costs no body", () => {
    write("https://cond.example", meta, "body");
    const h = revalidationHeaders(read("https://cond.example")!.entry);
    expect(h["if-none-match"]).toBe('W/"abc"');
    expect(h["if-modified-since"]).toBe("Wed, 01 Jul 2026 00:00:00 GMT");
  });

  it("omits conditional headers when the origin gave no validators", () => {
    write("https://bare.example", { status: 200, contentType: "text/html" }, "body");
    expect(revalidationHeaders(read("https://bare.example")!.entry)).toEqual({});
  });

  it("touch refreshes the timestamp without rewriting the body", () => {
    write("https://touch.example", meta, "ORIGINAL", 1_000);
    touch("https://touch.example", 9_000_000);
    const got = read("https://touch.example")!;
    expect(got.entry.fetchedAt).toBe(9_000_000);
    expect(got.body).toBe("ORIGINAL");
  });
});

describe("corruption is a miss, never an error", () => {
  it("returns null for an unreadable metadata file", () => {
    write("https://bad.example", meta, "body");
    const metaFile = readdirSync(dir).find((f) => f.endsWith(".json"))!;
    writeFileSync(join(dir, metaFile), "}not json{");
    // A mangled cache entry must not be able to fail a research run.
    expect(read("https://bad.example")).toBeNull();
  });

  it("returns null when the body file went missing", () => {
    write("https://half.example", meta, "body");
    const bodyFile = readdirSync(dir).find((f) => f.endsWith(".body"))!;
    rmSync(join(dir, bodyFile));
    expect(read("https://half.example")).toBeNull();
  });
});

describe("stats and clean", () => {
  it("counts fresh and stale entries separately", () => {
    process.env.CONSTRUCT_CACHE_TTL_HOURS = "1";
    write("https://fresh.example", meta, "a");
    write("https://stale.example", meta, "b", 1_000);
    const s = stats();
    expect(s.entries).toBe(2);
    expect(s.fresh).toBe(1);
    expect(s.stale).toBe(1);
    expect(s.bytes).toBeGreaterThan(0);
  });

  it("clean() drops only stale entries", () => {
    process.env.CONSTRUCT_CACHE_TTL_HOURS = "1";
    write("https://keep.example", meta, "a");
    write("https://drop.example", meta, "b", 1_000);
    expect(clean(false)).toBe(1);
    expect(read("https://keep.example")).not.toBeNull();
    expect(read("https://drop.example")).toBeNull();
  });

  it("clean(all) empties the cache, bodies included", () => {
    write("https://one.example", meta, "a");
    write("https://two.example", meta, "b");
    expect(clean(true)).toBe(2);
    expect(readdirSync(dir)).toEqual([]);
  });

  it("reports an empty cache without inventing a directory", () => {
    process.env.CONSTRUCT_CACHE_DIR = join(dir, "does-not-exist");
    const s = stats();
    expect(s.entries).toBe(0);
    expect(existsSync(s.dir)).toBe(false);
  });
});

describe("modes", () => {
  it("exposes the configured refresh/offline flags", () => {
    configureCache({ refresh: true });
    expect(cacheOptions()).toEqual({ refresh: true, offline: false });
    configureCache({ offline: true });
    expect(cacheOptions()).toEqual({ refresh: true, offline: true });
  });
});
