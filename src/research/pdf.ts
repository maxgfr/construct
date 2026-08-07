// PDF text extraction — public surface.
//
// The implementation now lives in the vendored webindex engine
// (github.com/maxgfr/webindex), pinned in src/vendor/webindex.meta.json. It used
// to live in ./pdf/, in a copy byte-identical to ultrasearch's and ultradoc's
// apart from the environment-variable prefix — and the last three releases of
// all three repos were the same commit typed out three times.

export {
  pdfToText,
  assessPdfText,
  assessExtractedText,
  ocrTools,
  ocrPdf,
  ocrBudgetLeft,
  resetOcrBudget,
  extractPdf,
  enabledExtractors,
  resetPdfLadderCache,
  PDF_EXTRACTORS,
  runWithInput,
  ANYDOC_SPEC,
  PDF_INSPECTOR_SPEC,
  type PdfVerdict,
  type PdfExtraction,
  type PdfExtractorId,
  type PdfLadderOptions,
} from "../engine.js";
