import type { ResearchContext, SourceResult } from "../types.js";
import { discover, webFetchUrls } from "./web.js";

// The `market` angle: discover competitor / market pages on the open web
// (keyless: SearXNG → DuckDuckGo → WebSearch hint) and ground excerpts from
// them. This is how the SRD's positioning and competitive landscape rest on
// real signal rather than the model's memory.
export async function marketAngle(ctx: ResearchContext): Promise<SourceResult[]> {
  const b = ctx.brief;
  const query =
    ctx.query ||
    [b.idea, b.competitors.join(" "), "competitors alternatives market"].filter(Boolean).join(" ").trim();
  if (!query) return [{ source: "market", items: [], notes: ["No idea/competitors to search the market for."] }];

  const { urls, via, notes } = await discover(query, ctx.webEngine, ctx.perSource);
  if (urls.length === 0) {
    return [{ source: "market", items: [], notes: [`Market discovery via ${via}.`, ...notes] }];
  }
  const fetched = await webFetchUrls(urls, query, ctx.perSource, "market");
  return [
    {
      source: "market",
      items: fetched.items,
      notes: [`Market discovery via ${via} for "${query}".`, ...notes, ...fetched.notes],
    },
  ];
}
