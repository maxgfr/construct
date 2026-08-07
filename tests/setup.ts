// Global test setup.
//
// The HTTP cache defaults to ~/.cache/construct/http. Without this, the suite
// would both READ the developer's real cache (making tests pass or fail
// depending on what they happened to have browsed) and WRITE into it. Point it
// at a throwaway directory per run instead.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "construct-test-cache-"));
process.env.CONSTRUCT_CACHE_DIR = dir;

// The Firecrawl extraction layer probes http://localhost:3002 by default. A
// developer who happens to have the `extract` profile running would otherwise
// get a different extractor — and different fetch call counts — than CI. Off by
// default; the cases that exercise it opt in explicitly.
process.env.CONSTRUCT_FIRECRAWL = "off";

// The PDF extractor ladder shells out to npx (pdf-inspector) and pdftotext. In a
// test that would mean network access, ~90s timeouts, and results that depend on
// which tools the developer happens to have installed — the opposite of an
// offline, deterministic suite. Pin it to the built-in reader; the cases that
// exercise other rungs pass `engines` themselves.
process.env.CONSTRUCT_PDF_ENGINE = "native";

// The office-document ladder shells out to npx (anydoc) too, and unlike the PDF
// one it has no built-in last rung to pin it to — so `none` disables it. The
// tests that exercise a rung pass `engines` themselves. This also keeps the
// default honest: an office document nothing can read must REFUSE.
process.env.CONSTRUCT_DOC_ENGINE = "none";

afterAll(() => rmSync(dir, { recursive: true, force: true }));
