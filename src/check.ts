import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import type { Stats } from "node:fs";
import { join, relative, sep } from "node:path";
import { srdManifestPath } from "./srd.js";
import { REQUIRED_NFR } from "./types.js";
import type { CheckResult, SRD, EvidenceItem, CoverageReport, ClaimVerifyResult } from "./types.js";

const REQUIRED_FILES = [
  "00-overview/VISION.md",
  "00-overview/SCOPE.md",
  "requirements/FUNCTIONAL.md",
  "requirements/NON-FUNCTIONAL.md",
  "TRACEABILITY.md",
  "SRD.json",
];

// The 🧠 glyph is ONLY ever renderer-emitted (the open-decision callout), so its
// presence unambiguously means an unresolved decision → hard fail. TODO/TBD/
// FIXME, by contrast, can legitimately appear in a feature title ("Add a TODO
// list") — those are an advisory nudge, never a hard failure.
const DECISION_RE = /🧠/;
const PLACEHOLDER_RE = /\bTODO\b|\bTBD\b|\bFIXME\b/;

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
      let st: Stats;
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
    const data = JSON.parse(readFileSync(path, "utf8")) as unknown;
    // Drop malformed/null elements so a hand-edited dossier never crashes check.
    const evidence = Array.isArray(data)
      ? (data.filter(
          (e) => !!e && typeof e === "object" && typeof (e as { id?: unknown }).id === "string" && typeof (e as { source?: unknown }).source === "string",
        ) as EvidenceItem[])
      : [];
    return { evidence };
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
  // Build-plan risks carry inline [E#] citations too — count them so coverage,
  // dangling and uncited stay accurate.
  srd.buildPlan.forEach((m) =>
    (m.risks ?? []).forEach((r) => {
      const re = /\[(E\d+)\]/g;
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(r))) referenced.add(mm[1]!);
    }),
  );

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

// Renderer-templated phrasings the agent is expected to sharpen during
// authoring. ONLY the renderer emits these exact strings (same reasoning as the
// 🧠-only rule), so flagging them carries zero false positives. Advisory.
const TEMPLATED_THEN_RE = /is persisted and visible to the user$/;
const TEMPLATED_METRIC_RE = /^A measurable target for "/;

// Fold the resolved claim-support record (VERIFY.json, written by `review
// --apply`) into a check result when `--semantic` is requested. Strictly
// additive: it can only ADD a failure (a refuted/unsupported claim), never relax
// the structural gate. Missing VERIFY.json warns (run `review` first), never fails.
function applySemantic(runDir: string, result: CheckResult): void {
  const p = join(runDir, "VERIFY.json");
  if (!existsSync(p)) {
    result.structural.warnings.push("--semantic: no VERIFY.json — run `construct review` then `review --apply <verdicts.json>` first; semantic gate skipped.");
    return;
  }
  try {
    const sem = JSON.parse(readFileSync(p, "utf8")) as ClaimVerifyResult;
    result.semantic = sem;
    if (!sem.ok) result.ok = false;
    if (sem.unadjudicated?.length) {
      result.structural.warnings.push(`${sem.unadjudicated.length} claim(s) not fully adjudicated by review.`);
    }
  } catch (e) {
    result.structural.warnings.push(`--semantic: VERIFY.json is unreadable (${(e as Error).message}).`);
  }
}

// The dual gate. `ok` reflects the hard structural/buildability gate, AND the
// opt-in grounding threshold when the caller passes `minGrounding` (the
// advisory coverage report itself never flips `ok`). With `opts.semantic`, ALSO
// folds in the VERIFY.json claim-support verdicts (fails on a refuted/unsupported
// claim) — additive: plain `check` (no opts) is byte-for-byte unchanged.
export function checkRun(runDir: string, opts: { minGrounding?: number; semantic?: boolean } = {}): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const emptyCoverage: CoverageReport & { citations: string[]; resolved: string[] } = {
    frTotal: 0,
    frGrounded: 0,
    nfrTotal: 0,
    nfrGrounded: 0,
    adrTotal: 0,
    adrGrounded: 0,
    dangling: [],
    uncited: [],
    citations: [],
    resolved: [],
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

  // Unresolved decisions (🧠) hard-fail; stray placeholder words only warn.
  for (const rel of mdFiles(runDir)) {
    const text = readFileSync(join(runDir, rel), "utf8");
    if (DECISION_RE.test(text)) errors.push(`Unresolved decision (🧠) in ${rel} — resolve it before the SRD is complete.`);
    else if (PLACEHOLDER_RE.test(text)) warnings.push(`Possible leftover placeholder (TODO/TBD/FIXME) in ${rel} — confirm it is intentional.`);
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
  // Zero FRs is a HARD failure, not a nudge: the gate certifies a *buildable*
  // SRD, and a document with nothing to build is incomplete by definition. It
  // also keeps the gate consistent — one FR missing acceptance criteria fails,
  // so an SRD missing every FR must fail too (else the SKILL.md "loop until
  // check passes" terminates on an empty scaffold).
  if (srd.functional.length === 0) {
    errors.push("No functional requirements — an SRD must specify at least one. Capture features in the brief (featureWishlist) and re-render.");
  }

  // Advisory enrichment nudges (never fail the gate): point the author at the
  // parts a deterministic render leaves generic.
  const noTrace = srd.functional.filter((fr) => fr.entities.length === 0 && fr.interfaces.length === 0).length;
  if (noTrace) {
    warnings.push(
      `${noTrace} functional requirement(s) have no data/interface traceability — fill DATA-MODEL.md / INTERFACES.md and set FR.entities/interfaces.`,
    );
  }
  if (srd.level === "complex" && srd.architecture.dataModel.length === 0) {
    warnings.push("Data model is empty — a complex SRD should name its core entities.");
  }

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

  // Advisory: criteria/metrics still carrying the renderer's own template
  // phrasing — complete but not yet sharpened into something testable.
  const templatedThen = srd.functional.reduce((n, fr) => n + fr.acceptance.filter((a) => TEMPLATED_THEN_RE.test(a.then)).length, 0);
  if (templatedThen) {
    warnings.push(
      `${templatedThen} acceptance criteria are still renderer-templated — sharpen them into observable, bounded outcomes (see references/acceptance-criteria.md).`,
    );
  }
  const templatedMetrics = srd.nonFunctional.filter((n) => n.metric && TEMPLATED_METRIC_RE.test(n.metric)).length;
  if (templatedMetrics) {
    warnings.push(`${templatedMetrics} NFR metric(s) are still generic placeholders — set measurable targets (see references/acceptance-criteria.md).`);
  }

  // Advisory grounding coverage.
  const { evidence, note } = loadEvidence(runDir);
  if (note) warnings.push(note);
  const coverage = computeCoverage(srd, evidence);
  if (coverage.dangling.length) {
    warnings.push(`Grounding: ${coverage.dangling.length} citation(s) do not resolve to evidence.json: ${coverage.dangling.join(", ")}.`);
  }

  const structuralOk = errors.length === 0;

  // Opt-in grounding gate: a single percentage over every groundable claim.
  // Off by default — the advisory semantics above are untouched without the flag.
  let grounding: CheckResult["grounding"];
  if (opts.minGrounding !== undefined) {
    const total = coverage.frTotal + coverage.nfrTotal + coverage.adrTotal;
    const grounded = coverage.frGrounded + coverage.nfrGrounded + coverage.adrGrounded;
    const actualPct = total === 0 ? 0 : Math.round((grounded / total) * 100);
    grounding = { threshold: opts.minGrounding, actualPct, ok: actualPct >= opts.minGrounding };
  }

  const ok = structuralOk && (grounding?.ok ?? true);
  const result: CheckResult = { ok, structural: { ok: structuralOk, errors, warnings }, coverage, grounding };
  if (opts.semantic) applySemantic(runDir, result);
  return result;
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
  const advisory = r.grounding ? "advisory detail" : "advisory — does not fail the build";
  lines.push(`Grounding coverage (${advisory}):`);
  lines.push(`  functional:     ${c.frGrounded}/${c.frTotal} grounded (${pct(c.frGrounded, c.frTotal)})`);
  lines.push(`  non-functional: ${c.nfrGrounded}/${c.nfrTotal} grounded (${pct(c.nfrGrounded, c.nfrTotal)})`);
  lines.push(`  decisions:      ${c.adrGrounded}/${c.adrTotal} grounded (${pct(c.adrGrounded, c.adrTotal)})`);
  lines.push(`  citations: ${c.citations.length} · resolved: ${c.resolved.length} · dangling: ${c.dangling.length} · uncited evidence: ${c.uncited.length}`);
  if (r.grounding) {
    const g = r.grounding;
    lines.push(``);
    lines.push(`Grounding gate (opt-in --min-grounding ${g.threshold}):`);
    lines.push(
      g.ok
        ? `  ✓ PASS — ${g.actualPct}% of groundable claims are grounded (threshold ${g.threshold}%)`
        : `  ✗ FAIL — ${g.actualPct}% of groundable claims are grounded, below the ${g.threshold}% threshold`,
    );
  }
  if (r.semantic) {
    const s = r.semantic;
    lines.push(``);
    lines.push(`Semantic claim-support gate (--semantic):`);
    lines.push(`  supported ${s.supported} · partial ${s.partial} · refuted ${s.refuted} · unsupported ${s.unsupported}`);
    for (const f of s.failures.slice(0, 8)) lines.push(`  ✗ ${f.claimId} (${f.evidenceId}): ${f.verdict}`);
    lines.push(s.ok ? `  ✓ PASS — every cited claim is supported by its evidence` : `  ✗ FAIL — a claim is refuted or unsupported by its cited evidence`);
  }
  return lines.join("\n");
}
