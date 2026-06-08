import { join } from "node:path";
import type { Angle, ResearchContext, SourceResult, SourceKind, EvidenceItem, DossierMeta } from "../types.js";
import { marketAngle } from "./market.js";
import { ossAngle } from "./oss.js";
import { techAngle } from "./tech.js";
import { semanticRescore } from "./semantic.js";
import { assignIds, writeDossier } from "./dossier.js";
import type { DossierPaths } from "./dossier.js";

type AngleHandler = (ctx: ResearchContext) => Promise<SourceResult[]>;

const HANDLERS: Record<"market" | "oss" | "tech", AngleHandler> = {
  market: marketAngle,
  oss: ossAngle,
  tech: techAngle,
};

const ANGLE_SOURCE: Record<"market" | "oss" | "tech", SourceKind> = {
  market: "market",
  oss: "oss",
  tech: "docs",
};

// Run the selected research angles concurrently (each is independent — web/API/
// clone I/O overlaps), then optionally rescore by semantic similarity. A failing
// angle degrades to an empty result with an honest note, never aborts the run.
export async function runAngles(ctx: ResearchContext): Promise<{ results: SourceResult[]; notes: string[] }> {
  const active = ctx.angles.filter((a): a is "market" | "oss" | "tech" => a !== "semantic");
  const settled = await Promise.all(
    active.map(async (a) => {
      try {
        return await HANDLERS[a](ctx);
      } catch (e) {
        return [{ source: ANGLE_SOURCE[a], items: [], notes: [`${a} angle failed: ${(e as Error).message}`] }];
      }
    }),
  );
  let results = settled.flat();
  const notes: string[] = [];

  if (ctx.semantic || ctx.angles.includes("semantic")) {
    const q = ctx.query || ctx.brief.idea;
    const s = await semanticRescore(results, q);
    results = s.results;
    notes.push(...s.notes);
  }
  return { results, notes };
}

export interface ResearchOutcome {
  dir: string;
  evidence: EvidenceItem[];
  meta: DossierMeta;
  paths: DossierPaths;
}

// Full research run: gather evidence across angles, cap per source, assign
// stable ids, and write the dossier to <runDir>/evidence. `builtAt` is injected
// so the run is deterministic in tests.
export async function runResearch(ctx: ResearchContext, builtAt: string): Promise<ResearchOutcome> {
  const { results, notes } = await runAngles(ctx);
  const capped = results.map((r) => ({
    ...r,
    items: [...r.items].sort((a, b) => b.score - a.score).slice(0, ctx.perSource),
  }));
  const evidence = assignIds(capped);
  const presentSources = [...new Set(evidence.map((e) => e.source))] as SourceKind[];
  const meta: DossierMeta = {
    idea: ctx.brief.idea,
    angles: ctx.angles,
    query: ctx.query || undefined,
    sources: presentSources,
    semantic: ctx.semantic || ctx.angles.includes("semantic"),
    evidenceCount: evidence.length,
    builtAt,
    notes: [...capped.flatMap((r) => r.notes), ...notes],
  };
  const dir = join(ctx.runDir, "evidence");
  const paths = writeDossier(dir, evidence, meta);
  return { dir, evidence, meta, paths };
}
