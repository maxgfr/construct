import type { EvidenceItem } from "../types.js";
import { keywords as extractKeywords } from "../util.js";
import { HTTP_GET_TIMEOUT_MS, HTTP_JSON_TIMEOUT_MS, RETRY_AFTER_CAP_MS, RETRY_BASE_DELAY_MS, RETRY_JITTER_MS } from "../config.js";

type RawItem = Omit<EvidenceItem, "id">;

const UA = "construct/0.x (+https://github.com/maxgfr/construct)";
// A recent desktop-browser UA, used ONLY as a fallback when the polite bot UA is
// blocked (some sites 403/429 unknown agents). Off the default to stay honest.
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface HttpResult {
  ok: boolean;
  status: number;
  body: string;
  contentType: string;
  error?: string;
  retryAfter?: string; // raw Retry-After header, when the server sent one
}

// A failure worth one more try: the network hiccuped (status 0), the server
// errored (5xx), or we were rate-limited (429). Other 4xx are deterministic —
// retrying a 403/404 just hammers the host.
function transient(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

// Minimal HTTP GET on top of Node's built-in fetch (Node ≥18) — no
// dependencies. Times out, sends a UA, and caps the body so a huge page can't
// blow up memory. `headers` overrides/extends the defaults (e.g. a browser UA).
// Transient failures (network error, 5xx, 429) are retried `retries` times with
// exponential backoff + jitter, honouring a parseable Retry-After on 429.
// `sleep` is injectable so tests don't wait. (fetchAndExtract layers its own
// one-shot browser-UA fallback on 403/429 — only the 429 path stacks with this,
// which is acceptable: a rate-limited host gets the backoff it asked for.)
export async function httpGet(
  url: string,
  opts: {
    timeoutMs?: number;
    accept?: string;
    maxBytes?: number;
    headers?: Record<string, string>;
    retries?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<HttpResult> {
  const retries = opts.retries ?? 1;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last: HttpResult = { ok: false, status: 0, body: "", contentType: "", error: "unreached" };
  for (let attempt = 0; attempt <= retries; attempt++) {
    last = await httpGetOnce(url, opts);
    if (last.ok || !transient(last.status)) return last;
    if (attempt === retries) break;
    const retryAfterS = Number(last.retryAfter);
    const delay =
      last.status === 429 && Number.isFinite(retryAfterS) && retryAfterS > 0
        ? Math.min(retryAfterS * 1000, RETRY_AFTER_CAP_MS)
        : RETRY_BASE_DELAY_MS * 2 ** attempt + Math.random() * RETRY_JITTER_MS;
    await sleep(delay);
  }
  return last;
}

async function httpGetOnce(
  url: string,
  opts: { timeoutMs?: number; accept?: string; maxBytes?: number; headers?: Record<string, string> },
): Promise<HttpResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? HTTP_GET_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: opts.accept ?? "*/*", ...(opts.headers ?? {}) },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const max = opts.maxBytes ?? 4 * 1024 * 1024;
    return {
      ok: res.ok,
      status: res.status,
      body: buf.subarray(0, max).toString("utf8"),
      contentType: res.headers.get("content-type") ?? "",
      retryAfter: res.headers.get("retry-after") ?? undefined,
    };
  } catch (e) {
    return { ok: false, status: 0, body: "", contentType: "", error: (e as Error).message };
  } finally {
    clearTimeout(t);
  }
}

// JSON request/response helper for the local vector backend (Qdrant / Ollama).
// Returns parsed JSON or an error; never throws. Local-only, keyless.
export async function httpJson(
  method: string,
  url: string,
  body?: unknown,
  opts: { timeoutMs?: number } = {},
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? HTTP_JSON_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: { "content-type": "application/json", accept: "application/json", "user-agent": UA },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = text;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: undefined, error: (e as Error).message };
  } finally {
    clearTimeout(t);
  }
}

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  copy: "©",
};

// Extract readable text from an HTML page. Zero-dep and intentionally simple:
// drop script/style/head/nav/footer, turn block tags into newlines, strip the
// rest, decode common entities (once — no double-decode), collapse whitespace.
// Good enough to ground an answer in the prose of a docs page without a DOM lib.
export function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<(script|style|noscript|head|nav|footer|svg)[\s\S]*?<\/\1>/gi, " ");
  // Break on closing AND opening block tags (so unclosed <li>/<td>/<tr> still
  // land on their own line) plus <br>/<hr>.
  s = s.replace(/<\/(p|div|section|article|li|tr|td|th|ul|ol|h[1-6]|pre|blockquote)>/gi, "\n");
  s = s.replace(/<(p|div|section|article|li|tr|td|th|ul|ol|h[1-6]|pre|blockquote|table)\b[^>]*>/gi, "\n");
  s = s.replace(/<(br|hr)\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  // Single non-rescanning pass: hex + decimal + named, each decoded exactly once
  // (so '&amp;lt;' stays '&lt;' instead of collapsing to '<').
  s = s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|mdash|ndash|hellip|copy);/gi, (m, g: string) => {
    if (g[0] === "#") {
      const n = g[1] === "x" || g[1] === "X" ? parseInt(g.slice(2), 16) : Number(g.slice(1));
      try {
        return Number.isFinite(n) ? String.fromCodePoint(n) : " ";
      } catch {
        return " ";
      }
    }
    return NAMED[g.toLowerCase()] ?? m;
  });
  s = s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

// Consent/cookie-banner boilerplate that survives htmlToText (it lives in body
// <div>/<dialog>, not <nav>/<footer>) and, on a low-keyword page, gets captured
// as the "excerpt". Drop a line when it hits ≥2 distinct patterns, or 1 pattern
// on a short line (a standalone "Accept all cookies" button).
const CONSENT_PATTERNS = [
  /\bcookies?\b/i,
  /\bconsent\b/i,
  /\bgdpr\b/i,
  /\bccpa\b/i,
  /accept all\b/i,
  /reject all\b/i,
  /manage (?:preferences|choices|cookies|settings)/i,
  /privacy (?:policy|preferences|choices)/i,
  /tracking technolog/i,
  /advertising partners/i,
  /legitimate interest/i,
];

// Strip consent-banner lines from extracted text. Deterministic and
// conservative — real prose that merely mentions "cookies" once in a long
// sentence is kept.
export function stripConsentBoilerplate(text: string): { text: string; dropped: number } {
  let dropped = 0;
  const kept = text.split("\n").filter((line) => {
    const hits = CONSENT_PATTERNS.reduce((n, re) => n + (re.test(line) ? 1 : 0), 0);
    const isBanner = hits >= 2 || (hits === 1 && line.trim().length < 120);
    if (isBanner) dropped++;
    return !isBanner;
  });
  return { text: kept.join("\n"), dropped };
}

// Pull the page's meta description (or og:description) from raw HTML before
// htmlToText strips <head> — a useful low-signal fallback when no line of the
// body matches the question.
function metaDescriptionOf(html: string): string | undefined {
  const m =
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i.exec(html) ||
    /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']description["']/i.exec(html) ||
    /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["']/i.exec(html);
  const d = m?.[1]?.replace(/\s+/g, " ").trim();
  return d || undefined;
}

// Fetch a URL and return its readable text (HTML stripped to prose). Used by
// the external-docs and web sources. Also returns the page's meta description
// (when present) as a low-signal fallback for pinned pages whose body doesn't
// match the question.
export async function fetchAndExtract(url: string): Promise<{ text: string; note?: string; metaDescription?: string }> {
  let res = await httpGet(url, { accept: "text/html,text/plain,*/*" });
  // Some sites block the polite bot UA — retry once as a browser before giving up.
  if (!res.ok && (res.status === 403 || res.status === 429)) {
    res = await httpGet(url, {
      accept: "text/html,application/xhtml+xml,*/*",
      headers: { "user-agent": BROWSER_UA, "accept-language": "en-US,en;q=0.9" },
    });
  }
  if (!res.ok) {
    return { text: "", note: `Could not fetch ${url} (status ${res.status}${res.error ? ", " + res.error : ""}).` };
  }
  const isHtml = /html/i.test(res.contentType) || /^\s*</.test(res.body);
  const metaDescription = isHtml ? metaDescriptionOf(res.body) : undefined;
  const rawText = isHtml ? htmlToText(res.body) : res.body;
  const text = isHtml ? stripConsentBoilerplate(rawText).text : rawText;
  return { text, ...(metaDescription ? { metaDescription } : {}) };
}

// Turn fetched page text into ranked evidence excerpts around the question's
// keywords. Returned as `docs` evidence (the external official documentation).
// Accepts several questions: each line is scored by its BEST single-question
// coverage, so a page can be excerpted around the one claim it actually
// supports instead of a diluted union of all of them.
export function excerptsFromText(
  text: string,
  url: string,
  title: string,
  source: EvidenceItem["source"],
  question: string | string[],
  perSource: number,
): RawItem[] {
  const lines = text.split("\n");
  const questions = (Array.isArray(question) ? question : [question]).filter((q) => q.trim());
  const kwSets = questions.map((q) => extractKeywords(q).map((k) => k.toLowerCase()));
  const hits: { idx: number; cov: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const low = lines[i]!.toLowerCase();
    let cov = 0;
    for (const kws of kwSets) {
      let c = 0;
      for (const kw of kws) if (low.includes(kw)) c++;
      // Normalise by the question's size so a long question cannot win on raw
      // count alone; scale keeps scores comparable with the single-question path.
      if (kws.length && c > cov) cov = c;
    }
    if (cov > 0) hits.push({ idx: i, cov });
  }
  hits.sort((a, b) => b.cov - a.cov || a.idx - b.idx);

  const items: RawItem[] = [];
  const ranges: { start: number; end: number }[] = [];
  const take = hits.length ? hits : [{ idx: 0, cov: 0 }];
  // At most 2 excerpts per document, so the per-source budget spans several
  // distinct pages rather than many slices of one.
  const perDoc = Math.min(2, Math.max(1, perSource));
  for (const h of take) {
    if (items.length >= perDoc) break;
    const start = Math.max(0, h.idx - 3);
    const end = Math.min(lines.length, h.idx + 12);
    // Skip a hit whose window overlaps one we already emitted (block-index
    // bucketing alone let near-duplicate excerpts straddle a boundary).
    if (ranges.some((r) => start < r.end && end > r.start)) continue;
    ranges.push({ start, end });
    const snippet = lines.slice(start, end).join("\n").slice(0, 1500);
    if (!snippet.trim()) continue;
    items.push({
      source,
      // Disambiguate the second+ excerpt of one page by its line range, so two
      // excerpts of the same URL don't render identical titles.
      title: items.length === 0 ? title : `${title} (lines ${start + 1}–${end})`,
      ref: url,
      location: `${url}#~${start + 1}`,
      score: Number((h.cov + 1).toFixed(3)),
      snippet,
      url,
      // cov=0 means no line matched the question — this is the top-of-page
      // fallback, likely boilerplate. Flag it so review/analyze down-weight it.
      ...(h.cov === 0 ? { meta: { lowSignal: true } } : {}),
    });
  }
  return items;
}
