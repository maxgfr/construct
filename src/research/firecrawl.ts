// Self-hosted Firecrawl client — the optional content-CLEANING layer.
//
// The built-in extractor (`fetch.ts::htmlToText`) is a regex stripper: it drops
// script/style/nav/footer, turns block tags into newlines and hopes the rest is
// prose. It has no main-content detection, so a page's sidebar, cookie dialog
// and related-links rail all land in the evidence snippet — and a JS-rendered
// page yields nothing at all, because the prose is never in the HTML.
//
// Firecrawl fetches the page with a real browser and returns main-content
// markdown. Run locally (`construct firecrawl up`) it is fully KEYLESS:
// `USE_DB_AUTHENTICATION=false` disables auth, so no Authorization header is
// sent. `construct firecrawl up` brings it up; when it is not running every
// path here returns null and the caller keeps the built-in extractor.
//
// Design notes:
// - Single `/scrape` calls with `maxAge` (Firecrawl's own page cache) — never
//   `/batch/scrape`, which is an async job + polling protocol whose complexity
//   buys nothing for one page at a time.
// - Reachability is probed ONCE per process and remembered. A container that
//   is not there refuses the next connection too; probing per page would cost a
//   round-trip for every URL of every angle.
// - Nothing here throws. A failure is `null`, and the caller degrades to the
//   built-in path with a note — the same contract as every other retrieval.
import { CACHE_TTL_HOURS, FIRECRAWL_PAGE_TIMEOUT_MS, FIRECRAWL_PROBE_TIMEOUT_MS, FIRECRAWL_SCRAPE_TIMEOUT_MS, FIRECRAWL_SEARCH_TIMEOUT_MS } from "../config.js";
import { httpGet, httpJson } from "./fetch.js";

/** The literal `--firecrawl`/env value that turns the layer off entirely. */
export const FIRECRAWL_OFF = "off";

const DEFAULT_BASE = "http://localhost:3002";

let baseOverride: string | undefined;

/** Point the client at another instance (`--firecrawl <url>`), process-wide. */
export function configureFirecrawl(opts: { base?: string }): void {
  baseOverride = opts.base?.trim() || undefined;
}

/**
 * Where Firecrawl lives: `--firecrawl <url>` > `CONSTRUCT_FIRECRAWL` >
 * `http://localhost:3002`. Returns null when the layer is disabled — the value
 * `off` in either place, which is the documented way to force the built-in
 * extractor without stopping the container.
 */
export function firecrawlBase(): string | null {
  const raw = (baseOverride ?? process.env.CONSTRUCT_FIRECRAWL ?? DEFAULT_BASE).trim();
  if (!raw || raw.toLowerCase() === FIRECRAWL_OFF) return null;
  return raw.replace(/\/$/, "");
}

// Self-hosted Firecrawl needs no key. This exists only so the same client can
// be pointed at Firecrawl Cloud (or a proxied instance) without a second
// implementation.
function authHeaders(): Record<string, string> {
  const key = process.env.CONSTRUCT_FIRECRAWL_KEY?.trim();
  return key ? { authorization: `Bearer ${key}` } : {};
}

// --- process-global latches --------------------------------------------------
// `up` mirrors web.ts's `searxngDown`: one probe, remembered for the process.
let up: boolean | null = null;
// The API version this instance serves. 2.10.5 serves /v2; older ones only /v1.
let prefix: string | null = null;

/** Forget the memoized probe + API version (tests drive several scenarios). */
export function resetFirecrawlProbe(): void {
  up = null;
  prefix = null;
}

/**
 * Is Firecrawl reachable? `GET /` answers `{"message":"Firecrawl API"}` with a
 * 200, so ANY HTTP response proves something is listening; only a refused
 * connection or a timeout (status 0) means down. Memoised, never throws.
 */
export async function probeFirecrawl(): Promise<boolean> {
  if (up !== null) return up;
  const base = firecrawlBase();
  if (!base) {
    up = false;
    return up;
  }
  // A local instance that refused one connection will refuse the next — don't
  // retry, and don't wait long.
  const r = await httpGet(`${base}/`, { timeoutMs: FIRECRAWL_PROBE_TIMEOUT_MS, retries: 0, accept: "application/json" });
  up = r.status !== 0;
  return up;
}

export interface ScrapeResult {
  markdown: string;
  title?: string;
  sourceURL?: string;
  statusCode?: number;
}

/**
 * PURE: a `/scrape` response body -> the fields we keep, or null.
 *
 * Null on `{success:false}`, a missing `data`, or markdown that is empty /
 * whitespace — "Firecrawl answered but produced no content" must degrade to the
 * built-in extractor exactly like "Firecrawl is not running", never to an empty
 * page. Exported for the unit test, which drives it with a recorded response.
 */
export function mapScrapeResponse(json: unknown): ScrapeResult | null {
  if (!json || typeof json !== "object") return null;
  const body = json as { success?: unknown; data?: unknown };
  if (body.success === false) return null;
  const data = body.data;
  if (!data || typeof data !== "object") return null;
  const d = data as { markdown?: unknown; metadata?: unknown };
  const markdown = typeof d.markdown === "string" ? d.markdown : "";
  if (!markdown.trim()) return null;
  const meta = (d.metadata && typeof d.metadata === "object" ? d.metadata : {}) as {
    title?: unknown;
    sourceURL?: unknown;
    url?: unknown;
    statusCode?: unknown;
  };
  const title = typeof meta.title === "string" && meta.title.trim() ? meta.title.trim() : undefined;
  const sourceURL = typeof meta.sourceURL === "string" ? meta.sourceURL : typeof meta.url === "string" ? meta.url : undefined;
  const statusCode = typeof meta.statusCode === "number" ? meta.statusCode : undefined;
  return { markdown, ...(title ? { title } : {}), ...(sourceURL ? { sourceURL } : {}), ...(statusCode !== undefined ? { statusCode } : {}) };
}

// POST to `{base}{prefix}{path}`, resolving the API version on the first call:
// try /v2, fall back to /v1 on a 404, then remember the winner. Never throws.
async function post(path: string, body: unknown, timeoutMs: number): Promise<{ ok: boolean; status: number; data: any } | null> {
  const base = firecrawlBase();
  if (!base) return null;
  const headers = authHeaders();
  const candidates = prefix ? [prefix] : ["/v2", "/v1"];
  let last: { ok: boolean; status: number; data: any } | null = null;
  for (const p of candidates) {
    const r = await httpJson("POST", `${base}${p}${path}`, body, { timeoutMs, headers });
    last = { ok: r.ok, status: r.status, data: r.data };
    // A 404 on /v2 means this build only serves /v1 — anything else (including a
    // 500) is this version's real answer, so stop and keep the prefix.
    if (r.status === 404 && p === "/v2" && candidates.length > 1) continue;
    prefix = p;
    return last;
  }
  return last;
}

/**
 * Clean one page through Firecrawl. Returns null when the layer is off, the
 * instance is unreachable, the request fails, or the response carries no
 * markdown — the caller then uses the built-in extractor.
 *
 * `maxAge` lets Firecrawl answer from its OWN cache for the same window the
 * on-disk page cache uses, so a re-run (which the skill's fold-in loop does
 * constantly) does not re-drive a browser for a page nothing changed on.
 */
export async function scrapeViaFirecrawl(url: string, opts: { maxAgeMs?: number; timeoutMs?: number } = {}): Promise<ScrapeResult | null> {
  if (!(await probeFirecrawl())) return null;
  const r = await post(
    "/scrape",
    {
      url,
      formats: ["markdown"],
      onlyMainContent: true,
      blockAds: true,
      removeBase64Images: true,
      maxAge: opts.maxAgeMs ?? CACHE_TTL_HOURS * 3600_000,
      timeout: opts.timeoutMs ?? FIRECRAWL_PAGE_TIMEOUT_MS,
    },
    FIRECRAWL_SCRAPE_TIMEOUT_MS,
  );
  if (!r) return null;
  // A refused/aborted request (status 0) means the instance went away mid-run:
  // flip the latch so the remaining pages of this run don't each pay the wait.
  if (r.status === 0) up = false;
  if (!r.ok) return null;
  return mapScrapeResponse(r.data);
}

/**
 * Discovery through Firecrawl's `/search`, which is keyless too: it cascades
 * Fire-Engine -> SearXNG (`SEARXNG_ENDPOINT`) -> DuckDuckGo internally. Returns
 * a URL list, `[]` when reachable but empty, and null when unusable — the same
 * three-way contract as `web.ts::viaSearxng`, so `discover` can tell "no
 * results" from "no instance".
 */
export async function searchViaFirecrawl(query: string, n: number): Promise<string[] | null> {
  if (!(await probeFirecrawl())) return null;
  const r = await post("/search", { query, limit: n, sources: ["web"] }, FIRECRAWL_SEARCH_TIMEOUT_MS);
  if (!r) return null;
  if (r.status === 0) up = false;
  if (!r.ok || !r.data || typeof r.data !== "object") return null;
  const data = (r.data as { success?: unknown; data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const web = (data as { web?: unknown }).web;
  if (!Array.isArray(web)) return null;
  const urls = web.map((x) => (x && typeof x === "object" ? (x as { url?: unknown }).url : undefined)).filter((u): u is string => typeof u === "string" && !!u);
  return urls.slice(0, n);
}
