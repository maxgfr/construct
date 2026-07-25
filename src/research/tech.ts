import type { ResearchContext, SourceResult, RawItem } from "../types.js";
import { SO_CONCURRENCY } from "../config.js";
import { rankedKeywords } from "../util.js";
import { discover, webFetchUrls } from "./web.js";
import { pool } from "./pool.js";
import { stackoverflow, soTagFor } from "./stackoverflow.js";

// The `tech` angle: feasibility grounding. For each candidate technology it
//   (a) fetches the project's official documentation (discovered on the web), and
//   (b) mines StackOverflow for the known pitfalls of that technology.
// Emits `docs` + `so` evidence the ADRs and NFRs can cite.
export async function techAngle(ctx: ResearchContext): Promise<SourceResult[]> {
  // Bound the run to the first few technologies; surface the cap honestly rather
  // than silently dropping the rest of the user's candidateTech list.
  const allTechs = ctx.brief.candidateTech;
  const techs = allTechs.slice(0, ctx.maxTech);
  const ideaKw = ctx.query || ctx.brief.idea;

  // --- docs: official documentation of each candidate technology. ----------
  const docItems: RawItem[] = [];
  const docNotes: string[] = [];
  if (allTechs.length > techs.length) {
    docNotes.push(
      `Only the first ${techs.length} of ${allTechs.length} candidate technologies were grounded (--max-tech ${ctx.maxTech}); skipped: ${allTechs.slice(techs.length).join(", ")}. Raise --max-tech, or drill them with \`construct tech --out <run> --q "<tech>"\`.`,
    );
  }
  // User-named docs pages (--docs-url) skip web discovery entirely: fetch ALL
  // of them (never budget-trimmed, same contract as `web --url`).
  if (ctx.docsUrls?.length) {
    const direct = await webFetchUrls(ctx.docsUrls, ideaKw, ctx.perSource, "docs", true, ctx.concurrency);
    // Same contract as market pins: an operator-named docs page survives the
    // per-source cap (see registry.ts), because dropping it would silently undo
    // the fold-in that pinned it.
    docItems.push(...direct.items.map((it) => ({ ...it, meta: { ...(it.meta ?? {}), pinned: true } })));
    docNotes.push(`Grounded ${ctx.docsUrls.length} docs URL(s) passed via --docs-url.`, ...direct.notes);
  }
  // One independent discover→fetch chain per technology; run them concurrently
  // and fold in declaration order so the dossier stays deterministic.
  const perTech = await pool(techs, ctx.concurrency, async (tech) => {
    const q = `${tech} official documentation`;
    const { urls, via, notes } = await discover(q, ctx.webEngine, ctx.perSource);
    const out = { items: [] as RawItem[], notes: [`Docs discovery for "${tech}" via ${via}.`, ...notes] };
    if (!urls.length) return out;
    const fetched = await webFetchUrls(urls.slice(0, 1), `${tech} ${ideaKw}`, ctx.perSource, "docs", false, ctx.concurrency);
    out.items = fetched.items;
    out.notes.push(...fetched.notes);
    return out;
  });
  for (const r of perTech) {
    docItems.push(...r.items);
    docNotes.push(...r.notes);
  }
  if (techs.length === 0 && !ctx.docsUrls?.length) docNotes.push("No candidate technologies in the brief — nothing to ground feasibility against.");

  // --- so: pitfalls of each candidate technology, one focused query per tech.
  // (A single combined "<all techs> <whole idea>" query over-constrains to zero.)
  const topKw = rankedKeywords(ideaKw)[0] ?? "";
  const soItems: RawItem[] = [];
  const soNotes: string[] = [];
  const seen = new Set<string>();
  const per = Math.max(2, Math.ceil(ctx.perSource / Math.max(1, techs.length)));
  // Deliberately serial (SO_CONCURRENCY = 1): the anonymous StackExchange API is
  // rate-limited to roughly one request a minute, so overlapping these queries
  // would trade latency for throttling.
  const perTechSo = await pool(techs, SO_CONCURRENCY, (tech) =>
    // Scope the lookup to the tech's StackOverflow tag so a per-candidate query
    // stays on-topic (with an untagged retry inside stackoverflow if the tag
    // yields nothing).
    stackoverflow(`${tech} ${topKw}`.trim(), per, { tag: soTagFor(tech) }),
  );
  for (const r of perTechSo) {
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
