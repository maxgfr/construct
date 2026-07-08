import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import type { Stats } from "node:fs";
import { join, relative, sep } from "node:path";
import { reduceVerdicts } from "./review.js";
import { srdManifestPath } from "./srd.js";
import { REQUIRED_NFR, DESIGN_TOKEN_CATEGORIES, DESIGN_TOKENS_SEEDED_BANNER } from "./types.js";
import type { CheckResult, SRD, EvidenceItem, CoverageReport, ClaimVerifyResult } from "./types.js";

// The design-system files render.ts writes when a design system is present.
// `check` requires them only when `srd.design` is set — a light/no-design SRD
// legitimately has none, so they stay out of the unconditional REQUIRED_FILES.
const DESIGN_REQUIRED_FILES = [
  "design/PRINCIPLES.md",
  "design/DESIGN-TOKENS.md",
  "design/design-tokens.json",
  "design/COMPONENTS.md",
  "design/SCREENS.md",
  "design/ACCESSIBILITY.md",
];

const REQUIRED_FILES = [
  "00-overview/VISION.md",
  "00-overview/SCOPE.md",
  "requirements/FUNCTIONAL.md",
  "requirements/NON-FUNCTIONAL.md",
  "TRACEABILITY.md",
  "SRD.json",
];

// The renderer emits an open decision as exactly `> 🧠 **Decide:** <question>`
// (templates.ts). Match that whole callout structure, NOT a bare 🧠 — otherwise a
// user who puts the glyph in a feature title or a design field (which the renderer
// threads verbatim into FUNCTIONAL.md, SCREENS.md, TRACEABILITY.md, design/*)
// would trip a false hard-fail. TODO/TBD/FIXME can also legitimately appear in a
// title ("Add a TODO list") — those stay an advisory nudge, never a hard failure.
const DECISION_RE = /^> 🧠 \*\*Decide:\*\*/m;
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
// the structural gate. FAIL-CLOSED: passing `--semantic` asserts the support
// gate actually engaged, so a missing/unreadable/verdict-less VERIFY.json fails
// the check unless `--allow-unverified` degrades it to the advisory warning.
// The verdict itself is re-reduced from `verdicts[]` on every check — the
// persisted summary is never trusted, so a stale or hand-tampered `ok` can not
// green-light the gate.
function applySemantic(runDir: string, result: CheckResult, allowUnverified: boolean): void {
  const p = join(runDir, "VERIFY.json");
  const skip = (reason: string, hint: string) => {
    if (allowUnverified) {
      result.structural.warnings.push(`--semantic: ${reason} — ${hint}; semantic gate skipped (--allow-unverified).`);
    } else {
      result.semanticError = `${reason} — ${hint}, or pass --allow-unverified to degrade this to a warning.`;
      result.ok = false;
    }
  };
  if (!existsSync(p)) {
    skip("no VERIFY.json", "run `construct review` then `review --apply <verdicts.json>` first");
    return;
  }
  let sem: ClaimVerifyResult;
  try {
    sem = JSON.parse(readFileSync(p, "utf8")) as ClaimVerifyResult;
  } catch (e) {
    skip(`VERIFY.json is unreadable (${(e as Error).message})`, "re-run `review --apply <verdicts.json>` to regenerate it");
    return;
  }
  if (!Array.isArray(sem.verdicts)) {
    skip("VERIFY.json carries no verdicts[] (legacy or hand-edited)", "re-run `review --apply <verdicts.json>` to regenerate it");
    return;
  }
  const reduced = reduceVerdicts(sem.verdicts);
  if (reduced.ok !== sem.ok) {
    result.structural.warnings.push("VERIFY.json's persisted summary disagreed with its verdicts — recomputed at check time.");
  }
  result.semantic = { ...reduced, verdicts: sem.verdicts };
  if (!reduced.ok) result.ok = false;
  if (reduced.unadjudicated.length) {
    result.structural.warnings.push(`${reduced.unadjudicated.length} claim(s) not fully adjudicated by review.`);
  }
}

// Structural validation for the optional design system. Additive: it only runs
// when `srd.design` is present, so a light/no-design SRD is validated exactly as
// before. Mirrors the FR/NFR/ADR rules: references must resolve, the required
// token categories must be present, and the accessibility contract must be real.
function checkDesign(runDir: string, srd: SRD, errors: string[], warnings: string[]): void {
  const ds = srd.design;
  if (!ds) return;

  for (const f of DESIGN_REQUIRED_FILES) {
    if (!existsSync(join(runDir, f))) errors.push(`Missing required design file: ${f} (re-render at --level complex).`);
  }

  const frIds = new Set(srd.functional.map((f) => f.id));
  if (ds.components.length === 0) errors.push("Design system has no components — a complex SRD's design must name its UI components.");
  for (const c of ds.components) {
    for (const id of c.relatedFRs) if (!frIds.has(id)) errors.push(`Component "${c.name}" references unknown requirement "${id}".`);
  }
  for (const s of ds.screens) {
    for (const id of s.relatedFRs) if (!frIds.has(id)) errors.push(`Screen "${s.name}" references unknown requirement "${id}".`);
  }
  for (const fl of ds.flows) {
    for (const id of fl.frIds) if (!frIds.has(id)) errors.push(`User flow "${fl.name}" references unknown requirement "${id}".`);
  }

  const tokenCats = new Set(ds.tokens.map((t) => t.category.toLowerCase()));
  for (const cat of DESIGN_TOKEN_CATEGORIES) {
    if (!tokenCats.has(cat)) errors.push(`Design tokens are missing the required category: ${cat}.`);
  }

  if (!ds.accessibility.standard.trim()) errors.push("Design system has no accessibility target standard.");
  if (ds.accessibility.requirements.length === 0) errors.push("Design system has no accessibility requirements.");
  for (const r of ds.accessibility.requirements) {
    if (!r.acceptance.length) errors.push(`Accessibility requirement ${r.id} has no acceptance criteria.`);
  }

  // Advisory: tokens still carry the renderer's seeded-default banner — complete
  // but not yet tuned to the brand. Renderer-only string → zero false positives.
  const tokenDoc = join(runDir, "design", "DESIGN-TOKENS.md");
  if (existsSync(tokenDoc) && readFileSync(tokenDoc, "utf8").includes(DESIGN_TOKENS_SEEDED_BANNER)) {
    warnings.push("Design tokens are still seeded defaults — replace them with the product's real brand values (see references/design-system-authoring.md).");
  }
}

// Structural validation for the module partition (modules mode). Additive: it
// only runs when `srd.modules` is present, so a plain SRD is validated exactly
// as before. Modules mode is all-or-nothing — every FR must belong to a declared
// module, every declared module must have its rendered PRD, and the dependency
// graph must resolve.
function checkModules(runDir: string, srd: SRD, errors: string[], warnings: string[]): void {
  const mods = srd.modules;
  if (!mods?.length) return;

  const moduleIds = new Set(mods.map((m) => m.id));
  if (!existsSync(join(runDir, "prd", "README.md"))) {
    errors.push(`Missing required module-PRD index: prd/README.md (re-render).`);
  }
  for (const m of mods) {
    if (!existsSync(join(runDir, "prd", m.id, "PRD.md"))) {
      errors.push(`Missing required module PRD: prd/${m.id}/PRD.md (re-render).`);
    }
    for (const dep of m.dependsOn) {
      if (!moduleIds.has(dep)) errors.push(`module "${m.id}" depends on unknown module "${dep}".`);
    }
    if (!srd.functional.some((f) => f.module === m.id)) {
      warnings.push(`module "${m.id}" has no requirements — its PRD is empty (assign features or drop the module).`);
    }
  }
  for (const fr of srd.functional) {
    if (!fr.module) errors.push(`${fr.id} has no module — modules mode is all-or-nothing (assign every feature to a module).`);
    else if (!moduleIds.has(fr.module)) errors.push(`${fr.id} references unknown module "${fr.module}".`);
  }
}

// The dual gate. `ok` reflects the hard structural/buildability gate, AND the
// opt-in grounding threshold when the caller passes `minGrounding` (the
// advisory coverage report itself never flips `ok`). With `opts.semantic`, ALSO
// folds in the VERIFY.json claim-support verdicts (fails on a refuted/unsupported
// claim) — additive: plain `check` (no opts) is byte-for-byte unchanged.
export function checkRun(runDir: string, opts: { minGrounding?: number; semantic?: boolean; allowUnverified?: boolean } = {}): CheckResult {
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

  // Design system (only when present) — additive structural gate.
  checkDesign(runDir, srd, errors, warnings);

  // Module partition (only when present) — additive structural gate.
  checkModules(runDir, srd, errors, warnings);

  // Criteria/metrics still carrying the renderer's own template phrasing —
  // complete but not yet sharpened into something testable. A complex SRD
  // certifies build-readiness, so surviving templates HARD-FAIL there; at
  // light they stay an advisory nudge.
  const templatedThen = srd.functional.reduce((n, fr) => n + fr.acceptance.filter((a) => TEMPLATED_THEN_RE.test(a.then)).length, 0);
  if (templatedThen) {
    const msg = `${templatedThen} acceptance criteria are still renderer-templated — sharpen them into observable, bounded outcomes (see references/acceptance-criteria.md).`;
    if (srd.level === "complex") errors.push(msg);
    else warnings.push(msg);
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
  if (opts.semantic) {
    applySemantic(runDir, result, opts.allowUnverified ?? false);
  } else if (coverage.resolved.length > 0) {
    // Citations exist but the support gate never engaged — surface it loudly
    // (advisory): a citation proves nothing until the review adjudicates it.
    const citedClaims = coverage.frGrounded + coverage.nfrGrounded + coverage.adrGrounded;
    result.semanticSkipped = { citedClaims, verifyExists: existsSync(join(runDir, "VERIFY.json")) };
  }
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
  if (r.semanticSkipped) {
    const s = r.semanticSkipped;
    lines.push(``);
    lines.push(`Semantic gate: SKIPPED`);
    lines.push(`  ⚠ ${s.citedClaims} cited claim(s) were never adversarially verified — a citation`);
    lines.push(
      s.verifyExists
        ? `    proves nothing until reviewed. A VERIFY.json exists — re-run with --semantic to gate on it.`
        : `    proves nothing until reviewed. Run \`construct review --out <run>\`, adjudicate the`,
    );
    if (!s.verifyExists) lines.push(`    worklist, then \`construct check --semantic\`.`);
  }
  if (r.semanticError) {
    lines.push(``);
    lines.push(`Semantic claim-support gate (--semantic):`);
    lines.push(`  ✗ FAIL — ${r.semanticError}`);
  }
  if (r.semantic) {
    const s = r.semantic;
    lines.push(``);
    lines.push(`Semantic claim-support gate (--semantic):`);
    lines.push(`  supported ${s.supported} · partial ${s.partial} · refuted ${s.refuted} · unsupported ${s.unsupported}`);
    for (const f of s.failures.slice(0, 8)) lines.push(`  ✗ ${f.claimId} (${f.evidenceId}): ${f.verdict}`);
    lines.push(
      !s.ok
        ? `  ✗ FAIL — a claim is refuted or unsupported by its cited evidence`
        : s.unadjudicated?.length
          ? `  ✓ PASS — no refuted/unsupported claims (${s.unadjudicated.length} still unadjudicated)`
          : `  ✓ PASS — every cited claim is supported by its evidence`,
    );
  }
  return lines.join("\n");
}
