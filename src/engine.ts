// The vendored webindex engine, configured for this skill.
//
// Everything in src/ reaches the engine through THIS module, never through
// src/vendor/webindex-engine.mjs directly. You cannot obtain an engine function
// without first importing the module that configures it, so there is no
// ordering hazard to remember and no entry point that can forget.
//
// The engine reads `${envPrefix}_*` at call time, so CONSTRUCT_FIRECRAWL,
// CONSTRUCT_PDF_ENGINE, CONSTRUCT_NO_NPX and the rest keep working exactly as
// they did when this code lived here. `contactUrl` goes into the polite
// User-Agent rate-limited APIs see — it must identify construct, not the shared
// engine underneath.
//
// (codeindex is vendored too, but it has no configuration and is imported
// directly where needed.)
//
// The five fields below the identity are what let this repo stop forking the
// engine. Each one replaced a private copy of an engine module that existed for
// exactly one missing knob — see scripts/engine-forks.json in the history.
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { CACHE_TTL_HOURS, SH_DEFAULT_TIMEOUT_MS } from "./config.js";
import { recordFetch } from "./research/metrics.js";
import { VERSION } from "./types.js";
import { configure } from "./vendor/webindex-engine.mjs";

configure({
  name: "construct",
  envPrefix: "CONSTRUCT",
  cli: "construct",
  contactUrl: "https://github.com/maxgfr/construct",
  // The real release, not the engine's generic "1.x". A maintainer reading their
  // logs to decide whether to throttle a client has to be able to tell one
  // construct release from another — and a fixed version from the one that was
  // hammering them.
  version: VERSION,

  // Where clones already live. Declared rather than accepted as the engine's
  // default because moving them would orphan every checkout on every machine
  // that has run `construct` before, and leave the cache commands reporting an
  // empty cache that is not empty.
  repoDir: join(tmpdir(), "construct"),

  // Likewise for the page cache: `~/.cache/construct/http` is where entries
  // already are. CONSTRUCT_CACHE_DIR still overrides it, as it always did.
  cacheDir: join(homedir(), ".cache", "construct", "http"),

  // A week, not the engine's day. A competitor page or a docs page stays
  // materially the same for about that long, and the skill's fold-in loop
  // re-runs the same research constantly — the whole point of the cache.
  cacheTtlMs: CACHE_TTL_HOURS * 3600_000,

  // Identify ourselves. This tool reads other people's sites at some volume, and
  // a UA that says who is calling and where to complain is the difference
  // between being throttled politely and being blocked. The engine retries once
  // as a browser when a host refuses the honest one, which is the same
  // concession this repo's own fetch layer made.
  defaultUa: "contact",

  // Retrieval instrumentation. The research angles run concurrently, so a plain
  // before/after byte count cannot attribute a request to the angle that issued
  // it — `recordFetch` puts it in the right AsyncLocalStorage counter. Without
  // this seam there was no way to adopt the engine's httpGet and keep counting.
  onFetch: (bytes, cached) => recordFetch(bytes, cached),
});

// Shell commands here are git clones and `gh` calls on large repositories, not
// `rev-parse`. Declared through the environment because the engine reads its
// tunables at call time, and this is the value the literal in config.ts had.
process.env.CONSTRUCT_SH_TIMEOUT_MS ??= String(SH_DEFAULT_TIMEOUT_MS);

export * from "./vendor/webindex-engine.mjs";
