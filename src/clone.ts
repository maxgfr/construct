// Naming a repository, and getting a working tree for it — the vendored
// webindex engine's, entirely.
//
// `resolveRepo` went first, with v1.13: the engine's parses ssh://, git:// and
// file:// URLs, userinfo and ports, all of which the copy here fell through to
// "generic".
//
// `ensureClone` stayed behind for one reason, and it was a good one — it keyed
// clones under THIS repo's /tmp/construct, which the cache commands and the rest
// of this file read, while the engine keyed them under its own root. Adopting
// would have orphaned every checkout on every machine that had ever run
// `construct`, and left `construct cache` reporting an empty cache that was not
// empty. Nothing else differed: the two-attempt retry, the partial-directory
// cleanup and the labelled error message were the same code on both sides.
//
// webindex v1.14.0 takes that directory as part of the brand (`repoDir`, declared
// in src/engine.ts), so the reason is gone and so is the fork.
//
// `cacheRoot` is kept as the name this repo's callers already use; it is the
// engine's `repoCacheRoot`, which now answers /tmp/construct.
export { ensureClone, repoCacheRoot as cacheRoot, resolveRepo } from "./engine.js";
