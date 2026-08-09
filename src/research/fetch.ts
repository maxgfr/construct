import type { EvidenceItem } from "../types.js";
import { excerptWindows } from "../engine.js";

type RawItem = Omit<EvidenceItem, "id">;

// HTTP and extraction — public surface.
//
// The implementation lives in the vendored webindex engine as of v1.14.0. This
// file stays as the import path the research angles already use, and keeps the
// one function that is genuinely this skill's: turning a page into EVIDENCE.
//
// The fetch stack was the largest fork in this repo and the last to go, because
// the divergence was real rather than accidental. It has been resolved in the
// engine's favour on every point, and each of those is a behaviour change worth
// naming:
//
//   - bodies are decoded per the response's own charset. A Windows-1252 page
//     used to arrive with every accented character replaced by U+FFFD, get
//     cached that way, and be quoted into requirements that way.
//   - the byte cap now caps the DOWNLOAD. This copy called `arrayBuffer()` and
//     then `.subarray(0, max)`, which allocates the whole response before
//     trimming it — a cap that only applies after the bytes are in memory is
//     not a cap. An oversized `Content-Length` is refused before a byte is read.
//   - extraction narrows to the main content region before stripping tags, so a
//     sidebar, a related-links rail and a cookie dialog stop landing in the
//     evidence snippet.
//   - the entity table is roughly ten times larger, including the Latin-1
//     accented letters that are pervasive in non-English sources.
//   - a PDF is recognised from a `/pdf/<id>` route, not only a `.pdf` suffix —
//     which is every arXiv paper this tool has ever fetched.
//
// Two things this repo's copy had that the engine did not, and now does: the
// polite identifying User-Agent with a one-shot browser retry when a host
// refuses it (`defaultUa: "contact"`, declared in src/engine.ts), and the
// per-request byte counter that attributes traffic to the concurrent angle that
// issued it (`onFetch`, same place).
//
// `fetchAndExtract` is the plain one-shot; `cachedFetchAndExtract` is the one
// this pipeline wants — see the call in research/web.ts, which passes the cache
// and the consent-stripping explicitly rather than hiding them in a wrapper.
export {
  PDF_URL_RE,
  cachedFetchAndExtract,
  fetchAndExtract,
  htmlToText,
  httpGet,
  httpJson,
  metaDescriptionOf,
  stripConsentBoilerplate,
  type HttpResult,
} from "../engine.js";

/**
 * Turn fetched page text into ranked evidence excerpts around the question's
 * keywords. Returned as `docs` evidence (the external official documentation).
 *
 * The SCANNING half — score lines, widen the best into windows, keep them from
 * overlapping — is `excerptWindows` in the engine, shared with the other skills
 * that were each doing it slightly differently. What stays here is the part that
 * is this product's and could not be shared: what an excerpt IS.
 *
 * Adopting the engine's scanner changed one thing on purpose. Lines used to be
 * scored with a raw lowercase `includes`, so "Générateur" did not match
 * "generateur" and "parseQuery" did not match "query"; they are now scored
 * through the accent-folding, subtoken-aware matcher. More lines match, and the
 * ones that match are the right ones.
 */
export function excerptsFromText(
  text: string,
  url: string,
  title: string,
  source: EvidenceItem["source"],
  question: string | string[],
  perSource: number,
): RawItem[] {
  // At most 2 excerpts per document, so the per-source budget spans several
  // distinct pages rather than many slices of one.
  const perDoc = Math.min(2, Math.max(1, perSource));
  return excerptWindows(text, question, { perDoc }).map((w, i) => ({
    source,
    // Disambiguate the second+ excerpt of one page by its line range, so two
    // excerpts of the same URL don't render identical titles.
    title: i === 0 ? title : `${title} (lines ${w.start + 1}–${w.end})`,
    ref: url,
    location: `${url}#~${w.start + 1}`,
    score: Number((w.score + 1).toFixed(3)),
    snippet: w.snippet,
    url,
    // score 0 means no line matched the question — this is the top-of-page
    // fallback, likely boilerplate. Flag it so review/analyze down-weight it.
    ...(w.score === 0 ? { meta: { lowSignal: true } } : {}),
  }));
}
