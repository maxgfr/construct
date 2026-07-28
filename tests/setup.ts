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

afterAll(() => rmSync(dir, { recursive: true, force: true }));
