import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { srdManifestPath } from "./srd.js";
import type { CheckResult, SRD, EvidenceItem, CoverageReport, Level } from "./types.js";

const REQUIRED_NFR: Record<Level, string[]> = {
  light: ["performance", "security", "reliability"],
  complex: ["performance", "security", "reliability", "usability", "observability", "cost"],
};

const REQUIRED_FILES = [
  "00-overview/VISION.md",
  "00-overview/SCOPE.md",
  "requirements/FUNCTIONAL.md",
  "requirements/NON-FUNCTIONAL.md",
  "TRACEABILITY.md",
  "SRD.json",
];

// Markers that mean "unfinished": the 🧠 open-decision callout and the usual
// placeholder words. Their presence in a rendered section fails the hard gate.
const PLACEHOLDER_RE = /🧠|\bTODO\b|\bTBD\b|\bFIXME\b/;

const EVIDENCE_TOKEN_RE = /\[(E\d+)\](?!\()/g;

// Recursively list rendered .md files under a run dir, excluding the evidence
// dossier (its snippets legitimately contain arbitrary source text).
function mdFiles(runDir: string): string[] {
  const out: string[] = [];
  const stack = [runDir];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const abs = join(dir, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      const rel = relative(runDir, abs).split(sep).join("/");
      if (st.isDirectory()) {
        if (rel === "evidence" || name === ".construct") continue;
        stack.push(abs);
      } else if (name.endsWith(".md")) {
        out.push(rel);
      }
    }
  }
  return out.sort();
}

function loadEvidence(runDir: string): { evidence: EvidenceItem[]; note?: string } {
  const path = join(runDir, "evidence", "evidence.json");
  if (!existsSync(path)) {
    return { evidence: [], note: `No evidence/evidence.json — grounding coverage is 0 (run \`construct research\` to ground the SRD).` };
  }
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as EvidenceItem[];
    return { evidence: Array.isArray(data) ? data : [] };
  } catch (e) {
    return { evidence: [], note: `evidence.json unreadable: ${(e as Error).message}` };
  }
}

// Compute the advisory grounding coverage from the SRD model, cross-checked
// against the run's evidence ids. Never fails the build — informational only.
function computeCoverage(srd: SRD, evidence: EvidenceItem[]): CoverageReport & { citations: string[]; resolved: string[] } {
  const ids = new Set(evidence.map((e) => e.id));
  const referenced = new Set<string>();
  const note = (arr: string[]) => arr.forEach((id) => referenced.add(id));
  srd.functional.forEach((f) => note(f.rationaleEvidence));
  srd.nonFunctional.forEach((n) => note(n.rationaleEvidence));
  srd.architecture.adrs.forEach((a) => note(a.evidence));
  srd.competitive.competitors.forEach((c) => note(c.evidence));
  srd.competitive.oss.forEach((o) => note(o.evidence));

  const grounded = (arr: string[]) => arr.some((id) => ids.has(id));
  const frGrounded = srd.functional.filter((f) => grounded(f.rationaleEvidence)).length;
  const nfrGrounded = srd.nonFunctional.filter((n) => grounded(n.rationaleEvidence)).length;
  const adrGrounded = srd.architecture.adrs.filter((a) => grounded(a.evidence)).length;

  const citations = [...referenced].sort();
  const dangling = citations.filter((id) => !ids.has(id));
  const resolved = citations.filter((id) => ids.has(id));
  const uncited = evidence.map((e) => e.id).filter((id) => !referenced.has(id));

  return {
    frTotal: srd.functional.length,
    frGrounded,
    nfrTotal: srd.nonFunctional.length,
    nfrGrounded,
    adrTotal: srd.architecture.adrs.length,
    adrGrounded,
    dangling,
    uncited,
    citations,
    resolved,
  };
}

// The dual gate. `ok` reflects ONLY the hard structural/buildability gate; the
// grounding coverage is advisory and never flips `ok`.
export function checkRun(runDir: string): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const emptyCoverage: CoverageReport & { citations: string[]; resolved: string[] } = {
    frTotal: 0, frGrounded: 0, nfrTotal: 0, nfrGrounded: 0, adrTotal: 0, adrGrounded: 0,
    dangling: [], uncited: [], citations: [], resolved: [],
  };

  // Required files.
  for (const f of REQUIRED_FILES) {
    if (!existsSync(join(runDir, f))) errors.push(`Missing required file: ${f} (run \`construct render --out ${runDir}\`).`);
  }

  const manifest = srdManifestPath(runDir);
  if (!existsSync(manifest)) {
    errors.push(`No SRD.json in ${runDir} — render the SRD first.`);
    return { ok: false, structural: { ok: false, errors, warnings }, coverage: emptyCoverage };
  }
  let srd: SRD;
  try {
    srd = JSON.parse(readFileSync(manifest, "utf8")) as SRD;
  } catch (e) {
    errors.push(`SRD.json is unreadable: ${(e as Error).message}`);
    return { ok: false, structural: { ok: false, errors, warnings }, coverage: emptyCoverage };
  }

  // Leftover placeholders / open decisions in rendered sections.
  for (const rel of mdFiles(runDir)) {
    const text = readFileSync(join(runDir, rel), "utf8");
    if (PLACEHOLDER_RE.test(text)) errors.push(`Unresolved placeholder/decision (🧠/TODO/TBD) in ${rel}.`);
  }
  if (srd.openQuestions.length) {
    errors.push(`${srd.openQuestions.length} open decision(s) unresolved in the brief — resolve them (into ADRs/requirements) before the SRD is complete.`);
  }

  // Reference closure: collect declared names/ids.
  const entityNames = new Set(srd.architecture.dataModel.map((e) => e.name));
  const interfaceNames = new Set(srd.architecture.interfaces.map((i) => i.name));
  const nfrIds = new Set(srd.nonFunctional.map((n) => n.id));

  // Functional requirements: acceptance + reference closure.
  for (const fr of srd.functional) {
    if (!fr.acceptance.length) errors.push(`${fr.id} has no acceptance criteria.`);
    for (const e of fr.entities) if (!entityNames.has(e)) errors.push(`${fr.id} references unknown entity "${e}".`);
    for (const i of fr.interfaces) if (!interfaceNames.has(i)) errors.push(`${fr.id} references unknown interface "${i}".`);
    for (const n of fr.nfrs) if (!nfrIds.has(n)) errors.push(`${fr.id} references unknown NFR "${n}".`);
  }
  if (srd.functional.length === 0) warnings.push("No functional requirements — the SRD has nothing to build.");

  // Required NFR categories for the level.
  const presentCats = new Set(srd.nonFunctional.map((n) => n.category.toLowerCase()));
  for (const cat of REQUIRED_NFR[srd.level]) {
    if (!presentCats.has(cat)) errors.push(`Missing required NFR category for level "${srd.level}": ${cat}.`);
  }

  // ADRs well-formed.
  for (const a of srd.architecture.adrs) {
    if (!a.context.trim() || !a.decision.trim() || !a.consequences.trim()) {
      errors.push(`ADR ${a.id} ("${a.title}") is missing context/decision/consequences.`);
    }
    if (a.status !== "proposed" && a.status !== "accepted") {
      errors.push(`ADR ${a.id} has invalid status "${a.status}".`);
    }
  }

  // Advisory grounding coverage.
  const { evidence, note } = loadEvidence(runDir);
  if (note) warnings.push(note);
  const coverage = computeCoverage(srd, evidence);
  if (coverage.dangling.length) {
    warnings.push(`Grounding: ${coverage.dangling.length} citation(s) do not resolve to evidence.json: ${coverage.dangling.join(", ")}.`);
  }

  const ok = errors.length === 0;
  return { ok, structural: { ok, errors, warnings }, coverage };
}

function pct(part: number, total: number): string {
  if (total === 0) return "n/a";
  return `${Math.round((part / total) * 100)}%`;
}

export function formatCheckReport(r: CheckResult, runDir: string): string {
  const lines: string[] = [];
  lines.push(`construct check: ${runDir}`);
  lines.push(``);
  lines.push(`Structural gate (hard):`);
  for (const e of r.structural.errors) lines.push(`  ✗ ${e}`);
  for (const w of r.structural.warnings) lines.push(`  ⚠ ${w}`);
  lines.push(r.structural.ok ? `  ✓ SRD is structurally complete` : `  ✗ SRD is NOT structurally complete`);
  lines.push(``);
  const c = r.coverage;
  lines.push(`Grounding coverage (advisory — does not fail the build):`);
  lines.push(`  functional:     ${c.frGrounded}/${c.frTotal} grounded (${pct(c.frGrounded, c.frTotal)})`);
  lines.push(`  non-functional: ${c.nfrGrounded}/${c.nfrTotal} grounded (${pct(c.nfrGrounded, c.nfrTotal)})`);
  lines.push(`  decisions:      ${c.adrGrounded}/${c.adrTotal} grounded (${pct(c.adrGrounded, c.adrTotal)})`);
  lines.push(`  citations: ${c.citations.length} · resolved: ${c.resolved.length} · dangling: ${c.dangling.length} · uncited evidence: ${c.uncited.length}`);
  return lines.join("\n");
}
