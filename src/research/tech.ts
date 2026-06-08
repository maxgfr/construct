import type { ResearchContext, SourceResult, RawItem } from "../types.js";
import { discover, webFetchUrls } from "./web.js";
import { stackoverflow } from "./stackoverflow.js";

// The `tech` angle: feasibility grounding. For each candidate technology it
//   (a) fetches the project's official documentation (discovered on the web), and
//   (b) mines StackOverflow for the known pitfalls of that technology.
// Emits `docs` + `so` evidence the ADRs and NFRs can cite.
export async function techAngle(ctx: ResearchContext): Promise<SourceResult[]> {
  const techs = ctx.brief.candidateTech.slice(0, 3);
  const ideaKw = ctx.query || ctx.brief.idea;

  // --- docs: official documentation of each candidate technology. ----------
  const docItems: RawItem[] = [];
  const docNotes: string[] = [];
  for (const tech of techs) {
    const q = `${tech} official documentation`;
    const { urls, via, notes } = await discover(q, ctx.webEngine, ctx.perSource);
    docNotes.push(`Docs discovery for "${tech}" via ${via}.`, ...notes);
    if (!urls.length) continue;
    const fetched = await webFetchUrls(urls.slice(0, 1), `${tech} ${ideaKw}`, ctx.perSource, "docs");
    docItems.push(...fetched.items);
    docNotes.push(...fetched.notes);
  }
  if (techs.length === 0) docNotes.push("No candidate technologies in the brief — nothing to ground feasibility against.");

  // --- so: pitfalls of the candidate technologies for this problem. --------
  const soQuery = [techs.join(" "), ideaKw].filter(Boolean).join(" ").trim();
  const soRes: SourceResult = soQuery
    ? await stackoverflow(soQuery, ctx.perSource)
    : { source: "so", items: [], notes: ["No candidate technologies to search StackOverflow for."] };

  return [
    { source: "docs", items: docItems, notes: docNotes },
    soRes,
  ];
}
