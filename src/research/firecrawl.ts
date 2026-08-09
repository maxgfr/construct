// The optional self-hosted Firecrawl client — public surface.
//
// The implementation lives in the vendored webindex engine as of v1.14.0. The
// engine's client was already a superset of this one; the reason it was not
// adopted was that this repo's `fetch.ts` consumed it, and `fetch.ts` was itself
// forked — so they had to swap together or not at all. They swapped together.
//
// What the engine's adds, beyond being one copy instead of three:
//
//   - it decides whether the thing answering on :3002 IS Firecrawl. 3002 is a
//     common dev port, so a Vite app squatting it answers 200 and every page
//     extraction then POSTs to something that 404s — while `doctor` cheerfully
//     reports "firecrawl answering". A false positive there is invisible.
//   - the probe is memoised per base rather than per process, so a run pointed
//     at two instances is not served one's verdict for the other.
//   - `/scrape` and `/search` report WHY they produced nothing, which the caller
//     turns into a note instead of a silent hole.
//
// Kept local below: the base override, because this CLI sets it once from a flag
// rather than threading options, and the mid-run "it went away" latch.
import { envName, markFirecrawlDown, firecrawlBase, resetFirecrawlProbeCache } from "../engine.js";

export {
  FIRECRAWL_DEFAULT_BASE,
  firecrawlBase,
  mapScrapeResponse,
  probeFirecrawl,
  scrapeViaFirecrawl,
  searchViaFirecrawl,
  type FirecrawlScrape as ScrapeResult,
} from "../engine.js";

/** The literal `--firecrawl`/env value that turns the layer off entirely. */
export const FIRECRAWL_OFF = "off";

/**
 * Point the client at another instance (`--firecrawl <url>`), process-wide.
 *
 * Written into the environment rather than into a module variable, because that
 * is the channel the engine reads — at CALL time, from every layer, with no
 * options to thread through the angles. `cli.ts` calls this once at startup and
 * the whole run sees it, which is exactly what the module-global here used to do.
 */
export function configureFirecrawl(opts: { base?: string }): void {
  const base = opts.base?.trim();
  if (base) process.env[envName("FIRECRAWL")] = base;
}

/** Forget the memoised probe (tests drive several scenarios per process). */
export function resetFirecrawlProbe(): void {
  resetFirecrawlProbeCache();
}

/**
 * Record that the instance went away mid-run.
 *
 * The probe is deliberately sticky — the whole cost of an absent Firecrawl is
 * meant to be one refused connection. That is right for "it was never there" and
 * wrong for "the container died at page 4 of 40", where every remaining page
 * would otherwise pay the timeout again.
 */
export function firecrawlWentAway(): void {
  const base = firecrawlBase();
  if (base) markFirecrawlDown(base);
}
