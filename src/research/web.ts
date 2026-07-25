import type { RawItem, SourceKind, WebEngine } from "../types.js";
import { SEARXNG_TIMEOUT_MS, DDG_TIMEOUT_MS, FETCH_CONCURRENCY } from "../config.js";
import { httpGet, fetchAndExtract, excerptsFromText } from "./fetch.js";
import { pool } from "./pool.js";

const SEARXNG_BASE = process.env.CONSTRUCT_SEARXNG || "http://localhost:8888";

// Discovery via a LOCAL SearXNG instance (keyless, self-hosted, brought up by
// `construct semantic up`). Returns null when unreachable so we fall through.
async function viaSearxng(query: string, n: number): Promise<string[] | null> {
  const url = `${SEARXNG_BASE.replace(/\/$/, "")}/search?q=${encodeURIComponent(query)}&format=json`;
  // Local instance: a refused connection won't heal in 300ms — don't retry.
  const r = await httpGet(url, { accept: "application/json", timeoutMs: SEARXNG_TIMEOUT_MS, retries: 0 });
  if (!r.ok) return null;
  try {
    const data = JSON.parse(r.body);
    const urls = (data.results ?? []).map((x: any) => x.url).filter(Boolean);
    return urls.slice(0, n);
  } catch {
    return null;
  }
}

// Discovery by scraping the DuckDuckGo HTML endpoint (keyless, no Docker). DDG
// wraps result links through a redirector carrying the real URL in `uddg`.
async function viaDuckDuckGo(query: string, n: number): Promise<string[] | null> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const r = await httpGet(url, { accept: "text/html", timeoutMs: DDG_TIMEOUT_MS });
  if (!r.ok || !r.body) return null;
  const urls: string[] = [];
  // Match any result anchor regardless of attribute order, then pull href out
  // separately — HTML attribute order is arbitrary, so a single class-before-href
  // pattern silently breaks if DDG reorders them.
  const tagRe = /<a\b[^>]*\bresult__a\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(r.body)) && urls.length < n) {
    const href0 = /\bhref="([^"]+)"/.exec(m[0]);
    if (!href0) continue;
    let href = href0[1]!;
    const uddg = /[?&]uddg=([^&]+)/.exec(href);
    if (uddg) {
      try {
        href = decodeURIComponent(uddg[1]!);
      } catch {
        /* keep raw */
      }
    }
    if (/^https?:\/\//.test(href) && !/duckduckgo\.com/.test(href)) urls.push(href);
  }
  return urls.length ? urls : null;
}

// Resolve candidate URLs for a query under the chosen engine policy. `auto`
// tries SearXNG, then DuckDuckGo. The `claude` engine (and the all-failed case)
// returns no URLs and signals the model to use its built-in WebSearch and feed
// URLs back via `construct research --url` (the drill commands only print —
// `research --url` is what pins the pages into the dossier).
// A local SearXNG that refused one connection will refuse the next: probing it
// again for every query bought nothing and cost a round-trip each time (five per
// run, once per discovery call). Remember the verdict for the process.
let searxngDown = false;

/** Forget the memoized reachability verdict (tests drive several scenarios). */
export function resetDiscoveryProbes(): void {
  searxngDown = false;
}

export async function discover(query: string, engine: WebEngine, n: number): Promise<{ urls: string[]; via: string; notes: string[] }> {
  const notes: string[] = [];
  if (engine === "searxng" || engine === "auto") {
    // null = unreachable/parse failure; [] = reachable but zero results. Once
    // it is unreachable, stay off it — but keep reporting it when the user
    // pinned that engine explicitly, or the failure would go unexplained.
    const s = searxngDown ? null : await viaSearxng(query, n);
    if (s === null) searxngDown = true;
    if (s?.length) return { urls: s, via: "searxng", notes };
    if (engine === "searxng") {
      notes.push(s === null ? `SearXNG unreachable at ${SEARXNG_BASE}. Run \`construct semantic up\`.` : "SearXNG returned no results.");
    }
  }
  if (engine === "ddg" || engine === "auto") {
    const d = await viaDuckDuckGo(query, n);
    if (d?.length) return { urls: d, via: "duckduckgo", notes };
    if (engine === "ddg") notes.push("DuckDuckGo returned no results.");
  }
  if (engine === "claude" || engine === "auto") {
    notes.push(
      "No keyless engine returned results. Use your built-in WebSearch to find URLs, " +
        "then ground them with `construct research --out <run> --url <url,...>` " +
        "(the `web` drill only prints — `research --url` is what persists them to the dossier).",
    );
  }
  return { urls: [], via: "none", notes };
}

// Fetch a set of URLs and turn each into grounded evidence of the given source
// kind. Shared by the market angle and the `construct web --url` drill-down.
export async function webFetchUrls(
  urls: string[],
  question: string | string[],
  perSource: number,
  source: SourceKind = "market",
  fetchAll = false,
  concurrency: number = FETCH_CONCURRENCY,
): Promise<{ items: RawItem[]; notes: string[] }> {
  const items: RawItem[] = [];
  const notes: string[] = [];
  // Discovery shares the per-source budget across pages; but URLs the user named
  // explicitly (fetchAll) must all be fetched, never silently dropped.
  const toFetch = fetchAll ? urls : urls.slice(0, Math.max(1, Math.ceil(perSource / 2)));

  // Fetch concurrently, fold in order. Pages are independent; fetching them one
  // at a time made page latency additive and dominated the whole run.
  const fetched = await pool(toFetch, concurrency, async (url) => {
    try {
      return { url, ...(await fetchAndExtract(url)) };
    } catch (e) {
      // One unreachable page must never abort the angle.
      return { url, text: "", note: `Could not fetch ${url}: ${(e as Error).message}` };
    }
  });

  for (const { url, text, note, metaDescription } of fetched) {
    if (note) notes.push(note);
    if (!text) continue;
    const ex = excerptsFromText(text, url, `${labelFor(source)} — ${url}`, source, question, perSource);
    if (ex.length) {
      // A low-signal excerpt (no line matched the question — the top-of-page
      // fallback, often a banner) is replaced by the page's own meta
      // description when one exists; a cleaner low-signal snippet to adjudicate.
      for (const item of ex) {
        if (item.meta?.lowSignal && metaDescription) item.snippet = metaDescription;
      }
      items.push(...ex);
    } else {
      items.push({
        source,
        title: `${labelFor(source)} — ${url}`,
        ref: url,
        location: url,
        score: 0,
        snippet: metaDescription ?? text.slice(0, 800),
        url,
        meta: { lowSignal: true },
      });
    }
  }
  return { items, notes };
}

function labelFor(source: SourceKind): string {
  return source === "docs" ? "Docs" : source === "oss" ? "OSS" : "Web";
}
