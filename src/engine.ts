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
import { configure } from "./vendor/webindex-engine.mjs";

configure({
  name: "construct",
  envPrefix: "CONSTRUCT",
  cli: "construct",
  contactUrl: "https://github.com/maxgfr/construct",
});

export * from "./vendor/webindex-engine.mjs";
