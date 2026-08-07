// Office-document text extraction — public surface.
//
// The implementation now lives in the vendored webindex engine
// (github.com/maxgfr/webindex), pinned in src/vendor/webindex.meta.json.

export {
  docFormatForUrl,
  docFormatForContentType,
  DOC_EXTENSIONS,
  extractDocument,
  enabledDocExtractors,
  resetDocLadderCache,
  DOC_EXTRACTORS,
  type DocFormat,
  type DocExtraction,
  type DocExtractorId,
  type DocLadderOptions,
} from "../engine.js";
