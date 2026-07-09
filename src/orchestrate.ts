import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { analyzeRun } from "./analyze.js";
import { loadBrief } from "./brief.js";
import { ADR_LENSES, agentContracts, phaseWorkflowScript, runbookMd } from "./orchestrate-templates.js";
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

/** Small worklists don't amortize a fan-out — orchestrate says so and nudges --eco. */
export const SMALL_WORKLIST = 3;
/** One subagent per batch of at most this many worklist units (build/adr-judges use 1). */
export const BATCH_SIZE = 8;

export interface PhaseInfo {
  name: PhaseName;
  ready: boolean;
  /** Absolute path of the file-backed state this phase fans out over. */
  worklist: string;
  items: number;
  /**
   * The injected fan-out units: gap+drill lines for research, claimId::evidenceId
   * keys for claim-review, the run's ADR ids for adr-judges (the emitted fan-out
   * is the 3 lenses over ONE of them), ready task ids for build.
   */
  ids: string[];
  /** The engine command that produces the worklist when it is missing. */
  prerequisite: string;
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

// The research fan-out units: one line per `analyze` gap, carrying the gap AND
// its drill command (rewritten onto the absolute engine path). Reuses analyzeRun
// itself — analyze prints its report instead of persisting it, so orchestrate
// derives the gaps from the same internal function rather than duplicating the
// matcher logic. analyzeRun emits exactly one drill suggestion per gap, in this
// same order (features → competitors → tech → seeds).
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

export function listPhases(runDir: string, engineAbs: string): PhaseInfo[] {
  const run = resolve(runDir);

  const gaps = researchUnits(run, engineAbs);

  const todoPath = join(run, "VERIFY.todo.json");
  let pairKeys: string[] | null = null;
  if (existsSync(todoPath)) {
    try {
      const todo = JSON.parse(readFileSync(todoPath, "utf8")) as { pairs?: ClaimEvidencePair[] };
      if (todo && Array.isArray(todo.pairs)) {
        pairKeys = todo.pairs
          .filter((p) => !!p && typeof p.claimId === "string" && typeof p.evidenceId === "string")
          .map((p) => `${p.claimId}::${p.evidenceId}`);
      }
    } catch {
      /* unreadable worklist = not ready */
    }
  }

  const srd = loadSrd(run);
  const adrIds = srd && Array.isArray(srd.architecture?.adrs) ? srd.architecture.adrs.map((a) => a.id) : [];

  const plan = loadPlan(run);
  const frontier = plan ? readyFrontier(plan).frontier : null;

  const renderCmd = `node ${engineAbs} render --out ${run} --level complex`;
  return [
    {
      name: "research",
      ready: gaps !== null,
      worklist: join(run, "evidence", "evidence.json"),
      items: gaps?.length ?? 0,
      ids: gaps ?? [],
      prerequisite: `node ${engineAbs} research --out ${run}`,
    },
    {
      name: "claim-review",
      ready: pairKeys !== null,
      worklist: todoPath,
      items: pairKeys?.length ?? 0,
      ids: pairKeys ?? [],
      prerequisite: `node ${engineAbs} review --out ${run}`,
    },
    {
      name: "adr-judges",
      ready: adrIds.length > 0,
      worklist: srdManifestPath(run),
      items: adrIds.length,
      ids: adrIds,
      prerequisite: renderCmd,
    },
    {
      name: "build",
      ready: frontier !== null,
      worklist: join(run, "BUILD-PLAN.json"),
      items: frontier?.length ?? 0,
      ids: frontier ?? [],
      prerequisite: renderCmd,
    },
  ];
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

export interface OrchestrateOptions {
  /** Emit only this phase (exit 2 if its worklist does not exist yet). */
  phase?: string;
  /** The contested ADR to panel — required with `--phase adr-judges`. */
  adr?: string;
  /** Emit only the RUNBOOK + contracts (the explicit low-token sequential path). */
  eco?: boolean;
}

export interface OrchestrateResult {
  exitCode: number;
  written: string[];
  notices: string[];
  errors: string[];
  phases: PhaseInfo[];
}

const err = (exitCode: number, errors: string[], phases: PhaseInfo[]): OrchestrateResult => ({ exitCode, written: [], notices: [], errors, phases });

export function orchestrateRun(runDir: string, engineAbs: string, opts: OrchestrateOptions = {}): OrchestrateResult {
  const run = resolve(runDir);
  if (!existsSync(run)) {
    return err(2, [`run dir not found: ${run}`], []);
  }
  const phases = listPhases(run, engineAbs);
  const adrPhase = phases.find((p) => p.name === "adr-judges")!;

  const notices: string[] = [];
  // The judge panel is opt-in (token-expensive, ONE contested ADR at a time —
  // references/orchestration.md Pattern 3 + budget guidance), so the default
  // emission covers the three worklist-driven fan-outs and names the flag.
  let selected = phases.filter((p) => p.ready && p.name !== "adr-judges");
  let adrPayload: AdrPanelPayload | undefined;

  if (opts.phase !== undefined) {
    const ph = phases.find((p) => p.name === opts.phase);
    if (!ph) {
      return err(2, [`unknown phase "${opts.phase}" — expected one of: ${PHASES.join(", ")}.`], phases);
    }
    if (!ph.ready) {
      return err(2, [`phase "${ph.name}" is not ready — its worklist ${ph.worklist} is missing or unreadable. Produce it first: ${ph.prerequisite}`], phases);
    }
    if (ph.name === "adr-judges") {
      const available = `this run's ADRs: ${ph.ids.join(", ")}`;
      if (!opts.adr) {
        return err(
          2,
          [
            `phase "adr-judges" panels ONE contested ADR — pass --adr <id> (${available}). Reserve it for a genuinely contested, hard-to-reverse decision (references/orchestration.md Pattern 3).`,
          ],
          phases,
        );
      }
      if (!ph.ids.includes(opts.adr)) {
        return err(2, [`ADR "${opts.adr}" not found — ${available}.`], phases);
      }
      adrPayload = adrPanelPayload(run, opts.adr) ?? undefined;
      if (!adrPayload) return err(2, [`ADR "${opts.adr}" could not be loaded from ${ph.worklist}.`], phases);
    }
    selected = [ph];
  } else if (adrPhase.ready) {
    notices.push(
      `phase "adr-judges": not emitted by default (a 3-lens panel over ONE contested ADR) — emit it explicitly: orchestrate --out ${run} --phase adr-judges --adr <id> (this run's ADRs: ${adrPhase.ids.join(", ")}).`,
    );
  }

  const orchDir = join(run, "orchestration");
  const agentsDir = join(orchDir, "agents");
  mkdirSync(join(orchDir, "out"), { recursive: true });
  mkdirSync(agentsDir, { recursive: true });

  const written: string[] = [];

  // Contracts: every role, every call (idempotent overwrite) — they double as the
  // RUNBOOK's self-pass checklists, so eco mode needs them too.
  let idea = "";
  try {
    idea = loadBrief(run).idea;
  } catch {
    /* no brief yet — the contract says so */
  }
  for (const [name, content] of Object.entries(agentContracts(run, engineAbs, idea))) {
    const p = join(agentsDir, `${name}.md`);
    writeFileSync(p, content);
    written.push(p);
  }

  if (!opts.eco) {
    for (const ph of selected) {
      // adr-judges fans out over the 3 lenses of the ONE chosen ADR; the other
      // phases fan out over their worklist units.
      const units = ph.name === "adr-judges" ? [...ADR_LENSES] : ph.ids;
      if (units.length === 0) {
        notices.push(`phase "${ph.name}": worklist is empty — nothing to orchestrate.`);
        continue;
      }
      if (ph.name !== "adr-judges" && units.length <= SMALL_WORKLIST) {
        notices.push(`phase "${ph.name}": only ${units.length} unit(s) — the sequential --eco path is equivalent and cheaper.`);
      }
      const p = join(orchDir, `${ph.name}.workflow.mjs`);
      writeFileSync(p, phaseWorkflowScript(ph, run, engineAbs, units, adrPayload));
      written.push(p);
    }
  }

  const rb = join(orchDir, "RUNBOOK.md");
  writeFileSync(rb, runbookMd(phases, run, engineAbs));
  written.push(rb);

  return { exitCode: 0, written, notices, errors: [], phases };
}
