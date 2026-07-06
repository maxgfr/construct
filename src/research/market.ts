import type { RawItem, ResearchContext, SourceResult } from "../types.js";
import { discover, webFetchUrls } from "./web.js";

// The `market` angle: discover competitor / market pages on the open web
// (keyless: SearXNG → DuckDuckGo → WebSearch hint) and ground excerpts from
// them. This is how the SRD's positioning and competitive landscape rest on
// real signal rather than the model's memory.
export async function marketAngle(ctx: ResearchContext): Promise<SourceResult[]> {
  const b = ctx.brief;
  const query = ctx.query || [b.idea, b.competitors.join(" "), "competitors alternatives market"].filter(Boolean).join(" ").trim();
  const items: RawItem[] = [];
  const notes: string[] = [];

  // Pinned pages (`research --url`): the caller named these explicitly, so fetch
  // them ALL and keep them ahead of anything discovery finds. This is how drill
  // findings are folded into the dossier deterministically — discovery alone
  // cannot be relied on to re-surface a page a drill already proved useful.
  const pinned = ctx.marketUrls ?? [];
  // Excerpt against the brief's individual feature texts as well as the market
  // query: a help-centre page documents ONE mechanic, and the window that best
  // covers a single feature is the excerpt the grounding matcher can actually
  // use. Applies to discovery too (same rationale).
  const questions = [query, ...b.featureWishlist.map((f) => `${f.title} ${f.notes ?? ""}`.trim())].filter(Boolean);
  if (pinned.length) {
    const f = await webFetchUrls(pinned, questions.length ? questions : pinned.join(" "), ctx.perSource, "market", true);
    items.push(...f.items.slice(0, ctx.perSource));
    notes.push(`Pinned ${pinned.length} market URL(s) via --url.`, ...f.notes);
  }

  if (!query) {
    if (items.length) return [{ source: "market", items, notes }];
    return [{ source: "market", items: [], notes: ["No idea/competitors to search the market for."] }];
  }

  // Fill the remaining per-source budget from open-web discovery.
  const budget = ctx.perSource - items.length;
  if (budget > 0) {
    const { urls, via, notes: discoveryNotes } = await discover(query, ctx.webEngine, budget);
    if (urls.length === 0) {
      notes.push(`Market discovery via ${via}.`, ...discoveryNotes);
    } else {
      const fetched = await webFetchUrls(urls, questions, budget, "market");
      items.push(...fetched.items);
      notes.push(`Market discovery via ${via} for "${query}".`, ...discoveryNotes, ...fetched.notes);
    }
  }

  return [{ source: "market", items, notes }];
}
