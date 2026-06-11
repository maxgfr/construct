import type { ResearchContext, SourceResult, RawItem } from "../types.js";
import { rankedKeywords } from "../util.js";
import { discover, webFetchUrls } from "./web.js";
import { stackoverflow } from "./stackoverflow.js";

// The `tech` angle: feasibility grounding. For each candidate technology it
//   (a) fetches the project's official documentation (discovered on the web), and
//   (b) mines StackOverflow for the known pitfalls of that technology.
// Emits `docs` + `so` evidence the ADRs and NFRs can cite.
export async function techAngle(ctx: ResearchContext): Promise<SourceResult[]> {
  // Bound the run to the first few technologies; surface the cap honestly rather
  // than silently dropping the rest of the user's candidateTech list.
  const allTechs = ctx.brief.candidateTech;
  const techs = allTechs.slice(0, 3);
  const ideaKw = ctx.query || ctx.brief.idea;

  // --- docs: official documentation of each candidate technology. ----------
  const docItems: RawItem[] = [];
  const docNotes: string[] = [];
  if (allTechs.length > techs.length) {
    docNotes.push(
      `Only the first ${techs.length} of ${allTechs.length} candidate technologies were grounded; skipped: ${allTechs.slice(techs.length).join(", ")}. Drill them with \`construct tech --out <run> --q "<tech>"\`.`,
    );
  }
  // User-named docs pages (--docs-url) skip web discovery entirely: fetch ALL
  // of them (never budget-trimmed, same contract as `web --url`).
  if (ctx.docsUrls?.length) {
    const direct = await webFetchUrls(ctx.docsUrls, ideaKw, ctx.perSource, "docs", true);
    docItems.push(...direct.items);
    docNotes.push(`Grounded ${ctx.docsUrls.length} docs URL(s) passed via --docs-url.`, ...direct.notes);
  }
  for (const tech of techs) {
    const q = `${tech} official documentation`;
    const { urls, via, notes } = await discover(q, ctx.webEngine, ctx.perSource);
    docNotes.push(`Docs discovery for "${tech}" via ${via}.`, ...notes);
    if (!urls.length) continue;
    const fetched = await webFetchUrls(urls.slice(0, 1), `${tech} ${ideaKw}`, ctx.perSource, "docs");
    docItems.push(...fetched.items);
    docNotes.push(...fetched.notes);
  }
  if (techs.length === 0 && !ctx.docsUrls?.length) docNotes.push("No candidate technologies in the brief — nothing to ground feasibility against.");

  // --- so: pitfalls of each candidate technology, one focused query per tech.
  // (A single combined "<all techs> <whole idea>" query over-constrains to zero.)
  const topKw = rankedKeywords(ideaKw)[0] ?? "";
  const soItems: RawItem[] = [];
  const soNotes: string[] = [];
  const seen = new Set<string>();
  const per = Math.max(2, Math.ceil(ctx.perSource / Math.max(1, techs.length)));
  for (const tech of techs) {
    const q = `${tech} ${topKw}`.trim();
    const r = await stackoverflow(q, per);
    for (const it of r.items) {
      if (!seen.has(it.ref)) {
        seen.add(it.ref);
        soItems.push(it);
      }
    }
    soNotes.push(...r.notes);
  }
  if (techs.length === 0) soNotes.push("No candidate technologies to search StackOverflow for.");

  return [
    { source: "docs", items: docItems, notes: docNotes },
    { source: "so", items: soItems, notes: soNotes },
  ];
}
