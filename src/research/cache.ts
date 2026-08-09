// The on-disk page cache — public surface.
//
// The implementation lives in the vendored webindex engine as of v1.14.0. The
// module stays as the import path `cli.ts` and the MCP handlers already use.
//
// This was the last fork with a real argument, and it was a good one. The
// engine's cache had grown ETag revalidation, stats and eviction by v1.13, so
// "the engine's cache has to catch up first" had expired — but the copy here
// still split an entry into a metadata file and a raw body file, so a
// multi-megabyte page never went through a JSON.parse/stringify round-trip,
// while the engine stored one JSON blob. That is a storage decision, and it was
// the right one: the engine now splits entries the same way, and reads the old
// single-blob shape so nobody's warm cache is thrown away on upgrade.
//
// What went with it: `read`, `write`, `touch` and `extractorOf`, the hand-rolled
// composition this repo's fetch layer used to drive. The engine's
// `cachedFetchAndExtract` is that composition, including the parts this copy
// never had — a namespace per extractor, and a stale copy served with a dated
// note when the origin is down.
//
// `configureCache` and `cacheOptions` keep their names here because that is what
// `cli.ts` calls them; upstream they are `setCacheMode` and `cacheMode`.
export {
  cacheClean as clean,
  cacheDir,
  cacheMode as cacheOptions,
  cacheStats as stats,
  isCacheFresh as isFresh,
  revalidationHeaders,
  setCacheMode as configureCache,
  type CacheEntry,
  type CacheMode as CacheOptions,
  type CacheStats,
} from "../engine.js";
