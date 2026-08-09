// The on-disk page cache — this repo's WIRING of it.
//
// The cache exists because the skill's own loop is repetitive by design: every
// fold-in re-runs `research`, which rebuilds the dossier from scratch. Without a
// cache that meant re-downloading every page the run had already read.
//
// The storage itself moved into the vendored engine with webindex v1.14.0,
// taking its tests with it: the round-trip, the validators and conditional
// headers, corruption-is-a-miss, eviction, and the metadata/body split that was
// the reason this repo kept its own copy for so long are all pinned in
// webindex's suite, against the code that implements them.
//
// What is left to assert here is what the engine cannot know and this repo
// decides: WHERE entries go, HOW LONG they stay fresh, and that the CLI's
// switches still reach the layer.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { cacheDir, clean, configureCache, cacheOptions, stats } from "../src/research/cache.js";

let prevDir: string | undefined;

beforeEach(() => {
  prevDir = process.env.CONSTRUCT_CACHE_DIR;
  configureCache({ refresh: false, offline: false });
});

afterEach(() => {
  if (prevDir === undefined) delete process.env.CONSTRUCT_CACHE_DIR;
  else process.env.CONSTRUCT_CACHE_DIR = prevDir;
  configureCache({ refresh: false, offline: false });
});

describe("where entries live", () => {
  it("defaults to ~/.cache/construct/http, where they already are", () => {
    delete process.env.CONSTRUCT_CACHE_DIR;
    // Declared as the brand's cacheDir in src/engine.ts. Adopting the engine's
    // cache must not relocate a directory users already have.
    expect(cacheDir()).toBe(join(homedir(), ".cache", "construct", "http"));
  });

  it("honours CONSTRUCT_CACHE_DIR", () => {
    const dir = mkdtempSync(join(tmpdir(), "construct-cache-"));
    try {
      process.env.CONSTRUCT_CACHE_DIR = dir;
      expect(cacheDir()).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("how long a page stays fresh", () => {
  it("keeps the week this repo chose, not the engine's day", () => {
    const dir = mkdtempSync(join(tmpdir(), "construct-cache-"));
    try {
      process.env.CONSTRUCT_CACHE_DIR = dir;
      // A competitor page or a docs page stays materially the same for about a
      // week, and the fold-in loop re-reads them constantly. 24h would make the
      // second run of a two-day investigation pay full price again.
      expect(stats().ttlMs).toBe(168 * 3600_000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the CLI's switches reach the layer", () => {
  it("exposes the configured refresh/offline flags", () => {
    configureCache({ refresh: true });
    expect(cacheOptions()).toEqual({ refresh: true, offline: false });
    configureCache({ offline: true });
    expect(cacheOptions()).toEqual({ refresh: true, offline: true });
  });

  it("reports an empty cache without inventing a directory", () => {
    const dir = join(tmpdir(), `construct-cache-absent-${process.pid}`);
    process.env.CONSTRUCT_CACHE_DIR = dir;
    expect(stats()).toMatchObject({ dir, entries: 0, bytes: 0 });
    expect(clean(true)).toBe(0);
  });
});
