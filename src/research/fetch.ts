import type { EvidenceItem } from "../types.js";
import { keywords as extractKeywords } from "../util.js";

type RawItem = Omit<EvidenceItem, "id">;

const UA = "construct/0.x (+https://github.com/maxgfr/construct)";

export interface HttpResult {
  ok: boolean;
  status: number;
  body: string;
  contentType: string;
  error?: string;
}

// Minimal HTTP GET on top of Node's built-in fetch (Node ≥18) — no
// dependencies. Times out, sends a UA, and caps the body so a huge page can't
// blow up memory.
export async function httpGet(
  url: string,
  opts: { timeoutMs?: number; accept?: string; maxBytes?: number } = {},
): Promise<HttpResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: opts.accept ?? "*/*" },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const max = opts.maxBytes ?? 4 * 1024 * 1024;
    return {
      ok: res.ok,
      status: res.status,
      body: buf.subarray(0, max).toString("utf8"),
      contentType: res.headers.get("content-type") ?? "",
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
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: { "content-type": "application/json", accept: "application/json", "user-agent": UA },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = undefined;
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

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'",
  "&nbsp;": " ", "&mdash;": "—", "&ndash;": "–", "&hellip;": "…", "&copy;": "©",
};

// Extract readable text from an HTML page. Zero-dep and intentionally simple:
// drop script/style/head/nav/footer, turn block tags into newlines, strip the
// rest, decode common entities, collapse whitespace. Good enough to ground an
// answer in the prose of a docs page without pulling in a DOM library.
export function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<(script|style|noscript|head|nav|footer|svg)[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<\/(p|div|section|article|li|tr|h[1-6]|pre|blockquote|br)>/gi, "\n");
  s = s.replace(/<(br|hr)\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&#(\d+);/g, (_m, n) => {
    try {
      return String.fromCodePoint(Number(n));
    } catch {
      return " ";
    }
  });
  for (const [k, v] of Object.entries(ENTITIES)) s = s.split(k).join(v);
  s = s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

// Fetch a URL and return its readable text (HTML stripped to prose). Used by
// the external-docs and web sources.
export async function fetchAndExtract(url: string): Promise<{ text: string; note?: string }> {
  const res = await httpGet(url, { accept: "text/html,text/plain,*/*" });
  if (!res.ok) {
    return { text: "", note: `Could not fetch ${url} (status ${res.status}${res.error ? ", " + res.error : ""}).` };
  }
  const isHtml = /html/i.test(res.contentType) || /^\s*</.test(res.body);
  const text = isHtml ? htmlToText(res.body) : res.body;
  return { text };
}

// Turn fetched page text into ranked evidence excerpts around the question's
// keywords. Returned as `docs` evidence (the external official documentation).
export function excerptsFromText(
  text: string,
  url: string,
  title: string,
  source: EvidenceItem["source"],
  question: string,
  perSource: number,
): RawItem[] {
  const lines = text.split("\n");
  const kws = extractKeywords(question).map((k) => k.toLowerCase());
  const hits: { idx: number; cov: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const low = lines[i]!.toLowerCase();
    let cov = 0;
    for (const kw of kws) if (low.includes(kw)) cov++;
    if (cov > 0) hits.push({ idx: i, cov });
  }
  hits.sort((a, b) => b.cov - a.cov || a.idx - b.idx);

  const items: RawItem[] = [];
  const seen = new Set<number>();
  const take = hits.length ? hits : [{ idx: 0, cov: 0 }];
  // At most 2 excerpts per document, so the per-source budget spans several
  // distinct pages rather than many slices of one.
  const perDoc = Math.min(2, Math.max(1, perSource));
  for (const h of take) {
    if (items.length >= perDoc) break;
    const block = Math.floor(h.idx / 12);
    if (seen.has(block)) continue;
    seen.add(block);
    const start = Math.max(0, h.idx - 3);
    const end = Math.min(lines.length, h.idx + 12);
    const snippet = lines.slice(start, end).join("\n").slice(0, 1500);
    if (!snippet.trim()) continue;
    items.push({
      source,
      title,
      ref: url,
      location: `${url}#~${start + 1}`,
      score: Number((h.cov + 1).toFixed(3)),
      snippet,
      url,
    });
  }
  return items;
}
