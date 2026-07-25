import { join } from "node:path";
import type { ResearchContext, SourceResult, SourceKind, EvidenceItem, DossierMeta } from "../types.js";
import { marketAngle } from "./market.js";
import { ossAngle } from "./oss.js";
import { techAngle } from "./tech.js";
import { semanticRescore } from "./semantic.js";
import { assignIds, fingerprint, loadLedger, writeDossier } from "./dossier.js";
import type { DossierPaths } from "./dossier.js";
import { timeAngle, type AngleTiming } from "./metrics.js";

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
// Each angle runs inside its own metrics store so its wall-clock and network
// cost are attributable even though the angles overlap.
export async function runAngles(ctx: ResearchContext): Promise<{ results: SourceResult[]; notes: string[]; timings: AngleTiming[] }> {
  const active = ctx.angles.filter((a): a is "market" | "oss" | "tech" => a !== "semantic");
  const timings: AngleTiming[] = [];
  const settled = await Promise.all(
    active.map((a) =>
      timeAngle(a, timings, async () => {
        try {
          return await HANDLERS[a](ctx);
        } catch (e) {
          return [{ source: ANGLE_SOURCE[a], items: [], notes: [`${a} angle failed: ${(e as Error).message}`] }];
        }
      }),
    ),
  );
  let results = settled.flat();
  const notes: string[] = [];

  if (ctx.semantic || ctx.angles.includes("semantic")) {
    const q = ctx.query || ctx.brief.idea;
    const s = await timeAngle("semantic", timings, () => semanticRescore(results, q));
    results = s.results;
    notes.push(...s.notes);
  }
  return { results, notes, timings };
}

/**
 * Trim one source's evidence to the per-source budget.
 *
 * Two rules, both learned the hard way:
 *  - **Pinned items are never dropped.** A pin is a URL the operator proved
 *    useful and asked for by name; discarding it would undo the fold-in that
 *    added it. Pins can therefore push a source over its budget — deliberately.
 *  - **No silent cuts.** Whatever the budget drops is counted in a note, so a
 *    thin dossier reads as a thin dossier rather than as "that's all there was".
 */
export function capSource(r: SourceResult, perSource: number): SourceResult {
  const pinned = r.items.filter((i) => i.meta?.pinned);
  const rest = [...r.items.filter((i) => !i.meta?.pinned)].sort((a, b) => b.score - a.score);
  const room = Math.max(0, perSource - pinned.length);
  const kept = [...pinned, ...rest.slice(0, room)];
  const dropped = rest.length - Math.min(rest.length, room);
  const notes = [...r.notes];
  if (dropped > 0) {
    notes.push(
      `${r.source}: ${dropped} lower-scored item(s) dropped by the per-source budget (--per-source ${perSource}${pinned.length ? `, ${pinned.length} slot(s) held by pinned URLs` : ""}). Raise --per-source to keep more.`,
    );
  }
  return { ...r, items: kept, notes };
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
  const { results, notes, timings } = await runAngles(ctx);
  const capped = results.map((r) => capSource(r, ctx.perSource));
  // Name the evidence from the run's existing ledger, so a re-run that pins new
  // URLs leaves every already-cited item on the id the SRD already quotes.
  const dir = join(ctx.runDir, "evidence");
  const ledger = loadLedger(dir);
  const evidence = assignIds(capped, ledger);
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
    timings,
    fingerprint: fingerprint(evidence),
  };
  const paths = writeDossier(dir, evidence, meta, ledger);
  return { dir, evidence, meta, paths };
}
