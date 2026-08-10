import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { analyzeRun } from "./analyze.js";
import { loadBrief } from "./brief.js";
import {
  listPhases as engineListPhases,
  orchestrateRun as engineOrchestrateRun,
  type OrchestrateOptions as EngineOrchestrateOptions,
  type OrchestrateResult as EngineOrchestrateResult,
  type PhaseDefinition,
  type PhaseInfo,
} from "./engine.js";
import {
  ADR_JUDGE_SCHEMA,
  ADR_LENSES,
  agentContracts,
  BUILDER_SCHEMA,
  CLAIM_REVIEW_SCHEMA,
  RESEARCH_SCHEMA,
  runbookPreamble,
} from "./orchestrate-templates.js";
import { loadPlan, readyFrontier } from "./plan.js";
import { srdManifestPath } from "./srd.js";
import type { ADR, ClaimEvidencePair, EvidenceItem, SRD } from "./types.js";

// ---------------------------------------------------------------------------
// `construct orchestrate` — emit the run's multi-agent orchestration from its
// CURRENT file-backed state (per-phase workflow scripts + dispatch contracts +
// a sequential RUNBOOK), so a subagent-capable harness fans the judgment work
// out while the main agent stays the sole writer. It mechanises the fan-out
// patterns of references/orchestration.md: Pattern 1 (research, one researcher
// per `analyze` gap), Pattern 4 (claim-review, one skeptic per claim↔evidence
// pair), Pattern 3 (adr-judges, the fixed 3-lens panel over ONE contested
// ADR), Pattern 5 (build, one worktree-isolated builder per ready task).
// Pattern 2 (adversarial review), the interview and the brainstorm are
// deliberately NOT emitted — they are single-role by design.
// Per-phase emission is deliberate: each worklist only exists after its engine
// step (`research`, `review`, `render`), so a whole-pipeline script could only
// carry placeholders — exactly what the check gates exist to prevent.
// ---------------------------------------------------------------------------

export const PHASES = ["research", "claim-review", "adr-judges", "build"] as const;
export type PhaseName = (typeof PHASES)[number];

function researchUnits(runDir: string, engineAbs: string): string[] | null {
  if (!existsSync(join(runDir, "brief.json")) || !existsSync(join(runDir, "evidence", "evidence.json"))) return null;
  try {
    const r = analyzeRun(runDir);
    const labels = [
      ...r.ungroundedFeatures.map((f) => `feature (${f.priority}): "${f.title}" has no matchable evidence`),
      ...r.unmatchedCompetitors.map((c) => `competitor: "${c}" never surfaced in market evidence`),
      ...r.unmatchedTech.map((t) => `tech: "${t}" has no docs/StackOverflow grounding`),
      ...r.unminedSeeds.map((s) => `oss seed: ${s} yielded no mined evidence`),
    ];
    return labels.map((label, i) => {
      const drill = r.suggestions[i]?.replace(/^construct /, `node ${engineAbs} `);
      return drill ? `${label} → drill: ${drill}` : label;
    });
  } catch {
    return null; // unreadable brief = not ready
  }
}

/** The ADR + cited-evidence snippets pasted into the adr-judges workflow (Pattern 3: no run-folder access). */
export interface AdrPanelPayload {
  adr: ADR;
  evidence: { id: string; source: string; ref: string; digest: string }[];
}

function loadSrd(runDir: string): SRD | null {
  const manifest = srdManifestPath(runDir);
  if (!existsSync(manifest)) return null;
  try {
    const srd = JSON.parse(readFileSync(manifest, "utf8")) as SRD;
    return srd && typeof srd === "object" ? srd : null;
  } catch {
    return null;
  }
}

function loadDossier(runDir: string): EvidenceItem[] {
  const path = join(runDir, "evidence", "evidence.json");
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return Array.isArray(data)
      ? (data.filter(
          (e) => !!e && typeof e === "object" && typeof (e as { id?: unknown }).id === "string" && typeof (e as { source?: unknown }).source === "string",
        ) as EvidenceItem[])
      : [];
  } catch {
    return [];
  }
}

/** The four fan-outs, declared. The engine owns the emission; these own the run. */
const RESEARCH: PhaseDefinition<unknown> = {
  name: "research",
  worklist: join("evidence", "evidence.json"),
  // Units are not a field of one file: they come from ANALYSING the whole run,
  // and each id carries its own drill command — which is why the engine hands
  // `ids` the run and the engine path (webindex v1.16.0).
  ids: (_parsed, run, engineAbs) => researchUnits(run, engineAbs) ?? undefined,
  prerequisite: (run, engineAbs) => `node ${engineAbs} research --out ${run}`,
  role: "researcher",
  title: "Research fan-out",
  schema: RESEARCH_SCHEMA,
  batchSize: 8,
  description: (n) => `Research the ${n} evidence gap(s) construct analyze found (fan-out; the orchestrator folds URLs into ONE pinned research re-run)`,
  applyHint: (run, engineAbs) => [
    `node ${engineAbs} research --out ${run} --angles market,oss,tech --url <u1,u2,...> [--docs-url <d,...>]`,
    `node ${engineAbs} analyze --out ${run}`,
  ],
};

const CLAIM_REVIEW: PhaseDefinition<{ pairs?: ClaimEvidencePair[] }> = {
  name: "claim-review",
  worklist: "VERIFY.todo.json",
  ids: (todo) =>
    Array.isArray(todo?.pairs)
      ? todo.pairs.filter((p) => !!p && typeof p.claimId === "string" && typeof p.evidenceId === "string").map((p) => `${p.claimId}::${p.evidenceId}`)
      : undefined,
  prerequisite: (run, engineAbs) => `node ${engineAbs} review --out ${run}`,
  role: "claim-reviewer",
  title: "Claim review",
  schema: CLAIM_REVIEW_SCHEMA,
  batchSize: 8,
  description: (n) =>
    `Adversarially verify the ${n} claim↔evidence pair(s) of a construct SRD (skeptic fan-out; the orchestrator folds the verdicts and gates)`,
  applyHint: (run, engineAbs) => [`node ${engineAbs} review --apply verdicts.json --out ${run}`, `node ${engineAbs} check --out ${run} --semantic`],
};

const ADR_JUDGES: PhaseDefinition<SRD> = {
  name: "adr-judges",
  worklist: join("srd", "manifest.json"),
  ids: (_parsed, run) => {
    const srd = loadSrd(run);
    const ids = srd && Array.isArray(srd.architecture?.adrs) ? srd.architecture.adrs.map((a) => a.id) : [];
    return ids.length ? ids : undefined;
  },
  prerequisite: (run, engineAbs) => `node ${engineAbs} render --out ${run} --level complex`,
  role: "adr-judge",
  title: "Judge panel",
  schema: ADR_JUDGE_SCHEMA,
  batchSize: 1,
  description: () => "Judge ONE contested ADR through the 3-lens panel (feasibility / operations & cost / user value); majority reduce",
  applyHint: (run, engineAbs) => [`node ${engineAbs} render --out ${run} --from-srd`],
};

const BUILD: PhaseDefinition<unknown> = {
  name: "build",
  worklist: "BUILD-PLAN.json",
  ids: (_parsed, run) => {
    const plan = loadPlan(run);
    return plan ? readyFrontier(plan).frontier : undefined;
  },
  prerequisite: (run, engineAbs) => `node ${engineAbs} render --out ${run} --level complex`,
  role: "builder",
  title: "Build frontier",
  schema: BUILDER_SCHEMA,
  batchSize: 1,
  description: (n) => `Build the ${n} ready BUILD-PLAN task(s) of this milestone frontier — one TDD builder per task, each in its own git worktree`,
  // Builders WRITE. Without their own worktree every one of them lands in the
  // same checkout and they overwrite each other's work.
  agentOpts: " isolation: 'worktree',",
  collapseFloor: () => 1,
  applyHint: (run, engineAbs) => [`node ${engineAbs} verify --out ${run}`],
};

// biome-ignore lint/suspicious/noExplicitAny: four differently-typed worklists in one table, which is the real shape
export const PHASE_DEFS = [RESEARCH, CLAIM_REVIEW, ADR_JUDGES, BUILD] as any as PhaseDefinition<unknown>[];

/** This run's phases, resolved. A binder over the engine, not a second resolver. */
export function listPhasesFor(runDir: string, engineAbs: string) {
  return engineListPhases(runDir, engineAbs, PHASE_DEFS);
}

// Pattern 3 pastes its inputs into the branches (a judge must not need the run
// folder): the ADR verbatim + each cited [E#] item's snippet, capped like the
// review digests so one huge snippet can't blow the prompt up.
function adrPanelPayload(runDir: string, adrId: string): AdrPanelPayload | null {
  const srd = loadSrd(runDir);
  const adr = srd?.architecture?.adrs?.find((a) => a.id === adrId);
  if (!adr) return null;
  const byId = new Map(loadDossier(runDir).map((e) => [e.id, e] as const));
  const evidence = [...new Set(adr.evidence)]
    .map((id) => byId.get(id))
    .filter((e): e is EvidenceItem => !!e)
    .map((e) => ({ id: e.id, source: e.source, ref: e.ref, digest: (e.snippet || e.title || e.ref).slice(0, 600) }));
  return { adr, evidence };
}

/** construct's own option on top of the engine's: the contested ADR to panel. */
export interface AdrOption {
  adr?: string;
}

/**
 * Emit this run's orchestration.
 *
 * A binder, not a fork: the engine owns resolving worklists, batching, the
 * Workflow scripts and the runbook; what stays here is construct's own policy —
 * the judge panel is opt-in, panels exactly ONE contested ADR, and is handed
 * its decision and evidence as injected constants so a judge never opens the
 * run folder it is judging.
 */
export function emitOrchestration(runDir: string, engineAbs: string, opts: EngineOrchestrateOptions & AdrOption = {}): EngineOrchestrateResult {
  const run = resolve(runDir);
  const phases = listPhasesFor(run, engineAbs);
  const adrPhase = phases.find((p: PhaseInfo) => p.name === "adr-judges");
  const err = (errors: string[]): EngineOrchestrateResult => ({ exitCode: 2, written: [], notices: [], errors, phases });

  let idea = "";
  try {
    idea = loadBrief(run).idea;
  } catch {
    /* no brief yet — the contract says so */
  }
  const contracts = (r: string, e: string) => agentContracts(r, e, idea);

  // The judge panel is token-expensive and deliberately one-at-a-time
  // (references/orchestration.md Pattern 3), so it is never part of the default
  // emission — the notice names the flag instead.
  if (opts.phase === undefined) {
    const notices: string[] = [];
    if (adrPhase?.ready) {
      notices.push(
        `phase "adr-judges": not emitted by default (a 3-lens panel over ONE contested ADR) — emit it explicitly: orchestrate --out ${run} --phase adr-judges --adr <id> (this run's ADRs: ${adrPhase.ids.join(", ")}).`,
      );
    }
    const res = engineOrchestrateRun(
      run,
      engineAbs,
      PHASE_DEFS.filter((d: PhaseDefinition<unknown>) => d.name !== "adr-judges"),
      contracts,
      { ...opts, runbookPreamble: runbookPreamble(phases, run, engineAbs) },
    );
    return { ...res, notices: [...notices, ...res.notices], phases };
  }

  if (opts.phase === "adr-judges") {
    const ph = adrPhase;
    if (!ph?.ready) return err([`phase "adr-judges" is not ready — render the SRD first: node ${engineAbs} render --out ${run} --level complex`]);
    const available = `this run's ADRs: ${ph.ids.join(", ")}`;
    if (!opts.adr) {
      return err([
        `phase "adr-judges" panels ONE contested ADR — pass --adr <id> (${available}). Reserve it for a genuinely contested, hard-to-reverse decision (references/orchestration.md Pattern 3).`,
      ]);
    }
    if (!ph.ids.includes(opts.adr)) return err([`ADR "${opts.adr}" not found — ${available}.`]);
    const payload = adrPanelPayload(run, opts.adr);
    if (!payload) return err([`ADR "${opts.adr}" could not be loaded from ${ph.worklist}.`]);
    // The lenses are the fan-out units for a panel, not the ADR ids.
    const panel: PhaseDefinition<unknown> = { ...ADR_JUDGES, ids: () => [...ADR_LENSES], collapseFloor: () => 1 } as PhaseDefinition<unknown>;
    return engineOrchestrateRun(run, engineAbs, [panel], contracts, {
      ...opts,
      runbookPreamble: runbookPreamble(phases, run, engineAbs),
      constants: { ADR: payload.adr, EVIDENCE: payload.evidence },
    });
  }

  return engineOrchestrateRun(run, engineAbs, PHASE_DEFS, contracts, { ...opts, runbookPreamble: runbookPreamble(phases, run, engineAbs) });
}

// The runner, the resolver and their types are the engine's. Re-exported so
// every existing `from "./orchestrate.js"` keeps resolving.
export { BATCH_SIZE, listPhases, orchestrateRun, SMALL_WORKLIST, type OrchestrateOptions, type OrchestrateResult, type PhaseInfo } from "./engine.js";
