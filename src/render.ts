import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { buildSRD, srdManifestPath } from "./srd.js";
import { derivePlan, mergePlan, loadPlan, writePlan } from "./plan.js";
import {
  renderVision,
  renderScope,
  renderFunctional,
  renderNonFunctional,
  renderSystemContext,
  renderDataModel,
  renderInterfaces,
  renderADR,
  renderLandscape,
  renderBuildPlan,
  renderTraceability,
  renderMergeBundle,
  renderFeaturePRD,
  renderPRDIndex,
  renderModulePRD,
  renderModulePrdIndex,
  renderDesignPrinciples,
  renderDesignTokens,
  renderDesignTokensJson,
  renderComponents,
  renderScreens,
  renderAccessibility,
  slugTitle,
} from "./templates.js";
import type { Brief, EvidenceItem, Level, SRD } from "./types.js";

export interface RenderResult {
  dir: string;
  files: string[];
  srd: SRD;
}

export interface RenderOptions {
  level: Level;
  out: string;
  merge: boolean;
  generatedAt: string;
  // The design-system subtree renders at `complex` unless opted out. Light never
  // renders it. Default false (off) when unset.
  noDesign?: boolean;
  // Also emit requirements/prd/ — one standalone PRD per FR + an index. Default
  // false (off) when unset.
  prd?: boolean;
}

function writeFile(out: string, rel: string, content: string, files: string[]): void {
  const abs = join(out, rel);
  mkdirSync(dirname(abs), { recursive: true });
  // Normalise to a trailing newline so files are diff-clean and golden-stable.
  writeFileSync(abs, content.endsWith("\n") ? content : content + "\n");
  files.push(rel);
}

// Deterministically render the SRD tree from a brief + the evidence dossier.
// Offline and pure apart from the filesystem write — same inputs (and the same
// injected generatedAt) produce byte-identical output.
export function renderSRD(brief: Brief, evidence: EvidenceItem[], opts: RenderOptions): RenderResult {
  // Design renders at complex unless opted out; light never renders it.
  const wantDesign = opts.level === "complex" && !opts.noDesign;
  const srd = buildSRD(brief, evidence, { level: opts.level, generatedAt: opts.generatedAt, design: wantDesign });
  const files: string[] = [];
  const out = opts.out;

  // ADR filenames are id-derived and can change between renders (e.g. when a
  // self-host ADR is added, the data ADR shifts 0002→0003). Clear the directory
  // first so a re-render never leaves a stale, duplicate-numbered orphan behind.
  rmSync(join(out, "architecture", "decisions"), { recursive: true, force: true });
  // The design/ subtree can toggle off (light level or --no-design). Clear it
  // first so a re-render never leaves an orphaned design/ behind — the same
  // hygiene as the decisions dir and the stale SRD.md below.
  rmSync(join(out, "design"), { recursive: true, force: true });
  // Same for the module-PRD tree: module ids can change between renders and the
  // brief can stop declaring modules altogether.
  rmSync(join(out, "prd"), { recursive: true, force: true });

  writeFile(out, "00-overview/VISION.md", renderVision(srd), files);
  writeFile(out, "00-overview/SCOPE.md", renderScope(srd), files);
  writeFile(out, "requirements/FUNCTIONAL.md", renderFunctional(srd), files);
  // PRD filenames are id+title-derived and the subtree can toggle off. Clear it
  // first — same hygiene as the decisions and design dirs — so a re-render never
  // leaves a stale per-feature PRD behind.
  rmSync(join(out, "requirements", "prd"), { recursive: true, force: true });
  if (opts.prd) {
    for (const fr of srd.functional) {
      writeFile(out, `requirements/prd/PRD-${fr.id}-${slugTitle(fr.title)}.md`, renderFeaturePRD(fr, srd), files);
    }
    writeFile(out, "requirements/prd/README.md", renderPRDIndex(srd), files);
  }
  writeFile(out, "requirements/NON-FUNCTIONAL.md", renderNonFunctional(srd), files);
  writeFile(out, "architecture/SYSTEM-CONTEXT.md", renderSystemContext(srd), files);
  writeFile(out, "architecture/DATA-MODEL.md", renderDataModel(srd), files);
  writeFile(out, "architecture/INTERFACES.md", renderInterfaces(srd), files);
  for (const adr of srd.architecture.adrs) {
    writeFile(out, `architecture/decisions/${adr.id}-${slugTitle(adr.title)}.md`, renderADR(adr), files);
  }
  writeFile(out, "competitive/LANDSCAPE.md", renderLandscape(srd), files);
  writeFile(out, "BUILD-PLAN.md", renderBuildPlan(srd), files);
  // Machine-readable build plan. Merge preserves the building agent's progress
  // (status, artifacts, tests, verify commands) across re-renders.
  writePlan(out, mergePlan(loadPlan(out), derivePlan(srd)));
  files.push("BUILD-PLAN.json");
  writeFile(out, "TRACEABILITY.md", renderTraceability(srd), files);

  // Module PRDs (modules mode): one PRD per declared module + an index. The
  // full FR blocks live here — FUNCTIONAL.md is the cross-module index.
  if (srd.modules?.length) {
    for (const m of srd.modules) {
      writeFile(out, `prd/${m.id}/PRD.md`, renderModulePRD(srd, m), files);
    }
    writeFile(out, "prd/README.md", renderModulePrdIndex(srd), files);
  }

  // Design system (complex, not opted out): the design/ subtree + a
  // machine-readable token twin (mirrors SRD.json / BUILD-PLAN.json).
  if (srd.design) {
    writeFile(out, "design/PRINCIPLES.md", renderDesignPrinciples(srd.design), files);
    writeFile(out, "design/DESIGN-TOKENS.md", renderDesignTokens(srd.design), files);
    writeFile(out, "design/design-tokens.json", renderDesignTokensJson(srd.design), files);
    writeFile(out, "design/COMPONENTS.md", renderComponents(srd.design), files);
    writeFile(out, "design/SCREENS.md", renderScreens(srd.design), files);
    writeFile(out, "design/ACCESSIBILITY.md", renderAccessibility(srd.design), files);
  }

  // Machine-readable manifest (what `check` re-reads).
  writeFileSync(srdManifestPath(out), JSON.stringify(srd, null, 2) + "\n");
  files.push("SRD.json");

  if (opts.merge) {
    writeFile(out, "SRD.md", renderMergeBundle(srd), files);
  } else {
    // A prior `--merge` run may have left an SRD.md behind. Drop it on a
    // non-merge re-render — same hygiene as the decisions dir above — so the
    // tree stays the single source of truth and `check` never validates a stale
    // bundle (e.g. an old 🧠 the current render already resolved).
    rmSync(join(out, "SRD.md"), { force: true });
  }

  return { dir: out, files, srd };
}
