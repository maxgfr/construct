// Running a local command now comes from the vendored webindex engine.
//
// Adopted with v1.14.0. The copy that was here differed in three ways and each
// of them turned out to be a defect rather than a policy:
//
//   - `status: number | null`. The engine always reports a number — 127 for a
//     binary that is not there, 124 for one it killed — so a caller printing
//     "exit ${status}" can no longer print "exit null".
//   - `shAsync` on `execFile`, which buffers both pipes and reports a timeout as
//     an error with no exit code. The engine's spawns, drains stderr so a full
//     pipe cannot deadlock the child, and SIGKILLs on timeout.
//   - the 120s default, which is genuinely this repo's — its shell calls are
//     clones of large repositories. It is declared in src/engine.ts instead of
//     being hardcoded here.
//
// `missing` is now optional rather than always present. The one caller that
// reads it (`src/clone.ts`) tests it for truth, which is unchanged.
export { type ShResult, sh, shAsync, have } from "./engine.js";

// Pull the meaningful keywords out of a natural-language question: lowercase,
// split on non-word chars, drop stopwords and very short tokens, dedupe. Used
// to drive lexical search and symbol ranking deterministically (no LLM).
// Keyword extraction now comes from the vendored webindex engine. Its tokeniser
// is Unicode-aware where this copy was ASCII-only, so an accented term survives
// as one keyword instead of splitting at the accent — and its stopword list
// covers French question scaffolding, which this product is written in.
// Adopted with webindex v1.13: `slugify` was one of three copies that disagreed
// about length and normalisation — which for an on-disk cache key means one
// repository under three different names.
export { keywords, rankedKeywords, isStopword, slugify } from "./engine.js";
