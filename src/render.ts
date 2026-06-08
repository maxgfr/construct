import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { buildSRD, srdManifestPath } from "./srd.js";
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
  const srd = buildSRD(brief, evidence, { level: opts.level, generatedAt: opts.generatedAt });
  const files: string[] = [];
  const out = opts.out;

  writeFile(out, "00-overview/VISION.md", renderVision(srd), files);
  writeFile(out, "00-overview/SCOPE.md", renderScope(srd), files);
  writeFile(out, "requirements/FUNCTIONAL.md", renderFunctional(srd), files);
  writeFile(out, "requirements/NON-FUNCTIONAL.md", renderNonFunctional(srd), files);
  writeFile(out, "architecture/SYSTEM-CONTEXT.md", renderSystemContext(srd), files);
  writeFile(out, "architecture/DATA-MODEL.md", renderDataModel(srd), files);
  writeFile(out, "architecture/INTERFACES.md", renderInterfaces(srd), files);
  for (const adr of srd.architecture.adrs) {
    writeFile(out, `architecture/decisions/${adr.id}-${slugTitle(adr.title)}.md`, renderADR(adr), files);
  }
  writeFile(out, "competitive/LANDSCAPE.md", renderLandscape(srd), files);
  writeFile(out, "BUILD-PLAN.md", renderBuildPlan(srd), files);
  writeFile(out, "TRACEABILITY.md", renderTraceability(srd), files);

  // Machine-readable manifest (what `check` re-reads).
  writeFileSync(srdManifestPath(out), JSON.stringify(srd, null, 2) + "\n");
  files.push("SRD.json");

  if (opts.merge) {
    writeFile(out, "SRD.md", renderMergeBundle(srd), files);
  }

  return { dir: out, files, srd };
}
