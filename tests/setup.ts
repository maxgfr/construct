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

afterAll(() => rmSync(dir, { recursive: true, force: true }));
