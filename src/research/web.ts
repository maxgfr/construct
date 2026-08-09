import type { RawItem, SourceKind, WebEngine } from "../types.js";
import { SEARXNG_TIMEOUT_MS, DDG_TIMEOUT_MS, FETCH_CONCURRENCY } from "../config.js";
import { httpGet, cachedFetchAndExtract, excerptsFromText } from "./fetch.js";
import { firecrawlBase, resetFirecrawlProbe, searchViaFirecrawl } from "./firecrawl.js";
import { pool } from "./pool.js";

const SEARXNG_BASE = process.env.CONSTRUCT_SEARXNG || "http://localhost:8888";

// Discovery via a LOCAL SearXNG instance (keyless, self-hosted, brought up by
// `construct semantic up`). Returns null when unreachable so we fall through.
// SearXNG answers 200 with an EMPTY result list when its own upstreams have
// throttled it, naming them in `unresponsive_engines` rather than failing. Those
// names are carried out so a rate-limited instance is not reported as a query
// with no hits — the first is transient and worth retrying, the second is not.
let searxngThrottled: string[] = [];

async function viaSearxng(query: string, n: number): Promise<string[] | null> {
  const url = `${SEARXNG_BASE.replace(/\/$/, "")}/search?q=${encodeURIComponent(query)}&format=json`;
  // Local instance: a refused connection won't heal in 300ms — don't retry.
  const r = await httpGet(url, { accept: "application/json", timeoutMs: SEARXNG_TIMEOUT_MS, retries: 0 });
  if (!r.ok) return null;
  try {
    const data = JSON.parse(r.body);
    // `[["brave","Suspended: too many requests"],["duckduckgo","CAPTCHA"],…]`
    searxngThrottled = (Array.isArray(data.unresponsive_engines) ? data.unresponsive_engines : [])
      .map((u: any) => (Array.isArray(u) ? (u[1] ? `${u[0]} (${u[1]})` : String(u[0])) : String(u)))
      .filter(Boolean);
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
// Same one-way latch for Firecrawl's /search. It is only ever consulted when the
// caller pinned `--web-engine firecrawl`, but a pinned engine is still queried
// once per angle — and an absent container answers the same way every time.
let firecrawlDown = false;

/** Forget the memoized reachability verdicts (tests drive several scenarios). */
export function resetDiscoveryProbes(): void {
  searxngDown = false;
  firecrawlDown = false;
  resetFirecrawlProbe();
}

export async function discover(query: string, engine: WebEngine, n: number): Promise<{ urls: string[]; via: string; notes: string[] }> {
  const notes: string[] = [];
  // EXPLICIT ONLY — deliberately absent from the `auto` cascade. Firecrawl's
  // /search is keyless (it delegates to SearXNG internally), but it rides on the
  // heavy `extract` profile; probing it in `auto` would make the default path pay
  // for a container almost nobody has running.
  if (engine === "firecrawl") {
    // The engine's client answers `{ hits }` or `{ why }` rather than a bare
    // list-or-null, so "reachable but empty" and "not reachable" stop being the
    // same value — and the reason it gives is better than the one guessed here.
    const attempt = firecrawlDown ? undefined : await searchViaFirecrawl(query, n);
    const f = attempt?.hits ? attempt.hits.map((h) => h.url).slice(0, n) : null;
    if (f === null) firecrawlDown = true;
    if (f?.length) return { urls: f, via: "firecrawl", notes };
    const base = firecrawlBase();
    notes.push(
      f !== null
        ? "Firecrawl search returned no results."
        : base
          ? `Firecrawl unreachable at ${base}. Run \`construct firecrawl up\`.`
          : "Firecrawl is disabled (--firecrawl off / CONSTRUCT_FIRECRAWL=off); nothing to query.",
    );
  }
  if (engine === "searxng" || engine === "auto") {
    // null = unreachable/parse failure; [] = reachable but zero results. Once
    // it is unreachable, stay off it — but keep reporting it when the user
    // pinned that engine explicitly, or the failure would go unexplained.
    const s = searxngDown ? null : await viaSearxng(query, n);
    if (s === null) searxngDown = true;
    if (s?.length) return { urls: s, via: "searxng", notes };
    if (engine === "searxng") {
      notes.push(
        s === null
          ? `SearXNG unreachable at ${SEARXNG_BASE}. Run \`construct semantic up\`.`
          : searxngThrottled.length
            ? `SearXNG returned no results — its upstream engines are throttling this instance, which is transient: ${searxngThrottled.join(", ")}. Retry in a few minutes.`
            : "SearXNG returned no results.",
      );
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
      // The cache is not optional here and neither is consent-stripping: this
      // skill's loop re-runs the same research constantly, and a banner line is
      // exactly what gets picked as the excerpt on a low-keyword page. Both are
      // passed explicitly rather than hidden in a wrapper, so the one call site
      // that fetches pages says what it is asking for.
      return { url, metaDescription: undefined, ...(await cachedFetchAndExtract(url, { stripConsent: true }, true)) };
    } catch (e) {
      // One unreachable page must never abort the angle.
      return { url, text: "", note: `Could not fetch ${url}: ${(e as Error).message}`, metaDescription: undefined };
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
