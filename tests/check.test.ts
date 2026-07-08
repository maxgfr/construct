import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderSRD } from "../src/render.js";
import { checkRun, formatCheckReport } from "../src/check.js";
import { srdManifestPath } from "../src/srd.js";
import { DESIGN_TOKENS_SEEDED_BANNER } from "../src/types.js";
import type { Brief, CheckResult, EvidenceItem, SRD, Level } from "../src/types.js";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const brief = JSON.parse(readFileSync(join(FIX, "sample-brief.json"), "utf8")) as Brief;
const evidence = JSON.parse(readFileSync(join(FIX, "sample-evidence.json"), "utf8")) as EvidenceItem[];

const dirs: string[] = [];
function renderRun(opts: { level?: Level; briefOverride?: Partial<Brief>; withEvidence?: boolean } = {}): string {
  const out = mkdtempSync(join(tmpdir(), "construct-check-"));
  dirs.push(out);
  if (opts.withEvidence !== false) {
    mkdirSync(join(out, "evidence"), { recursive: true });
    writeFileSync(join(out, "evidence", "evidence.json"), JSON.stringify(evidence));
  }
  renderSRD({ ...brief, ...opts.briefOverride }, evidence, {
    level: opts.level ?? "complex",
    out,
    merge: false,
    generatedAt: "T",
  });
  return out;
}
function mutateSRD(dir: string, fn: (srd: SRD) => void): void {
  const srd = JSON.parse(readFileSync(srdManifestPath(dir), "utf8")) as SRD;
  fn(srd);
  writeFileSync(srdManifestPath(dir), JSON.stringify(srd, null, 2));
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("checkRun — hard structural gate", () => {
  it("passes a complete rendered SRD (light and complex)", () => {
    expect(checkRun(renderRun({ level: "light" })).ok).toBe(true);
    expect(checkRun(renderRun({ level: "complex" })).ok).toBe(true);
  });

  it("fails on an unresolved open decision (🧠)", () => {
    const r = checkRun(renderRun({ briefOverride: { openQuestions: ["Pick a license model"] } }));
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/🧠|open decision/i);
  });

  it("fails when a functional requirement has no acceptance criteria", () => {
    const dir = renderRun();
    mutateSRD(dir, (s) => (s.functional[0]!.acceptance = []));
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/FR-001 has no acceptance/);
  });

  it("fails on a dangling entity reference", () => {
    const dir = renderRun();
    mutateSRD(dir, (s) => (s.functional[0]!.entities = ["Ghost"]));
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/unknown entity "Ghost"/);
  });

  it("fails on a malformed ADR", () => {
    const dir = renderRun();
    mutateSRD(dir, (s) => (s.architecture.adrs[0]!.context = ""));
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/missing context\/decision\/consequences/);
  });

  it("fails on a missing required NFR category for the level", () => {
    const dir = renderRun({ level: "complex" });
    mutateSRD(dir, (s) => (s.nonFunctional = s.nonFunctional.filter((n) => n.category.toLowerCase() !== "usability")));
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/Missing required NFR category.*usability/);
  });

  it("fails when the SRD has no functional requirements (nothing to build)", () => {
    const r = checkRun(renderRun({ briefOverride: { featureWishlist: [] } }));
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/no functional requirements/i);
  });
});

describe("checkRun — modules mode", () => {
  const modulesBrief = JSON.parse(readFileSync(join(FIX, "sample-brief-modules.json"), "utf8")) as Brief;
  const modulesRun = () => renderRun({ briefOverride: modulesBrief });

  it("passes a complete modules-mode render", () => {
    const r = checkRun(modulesRun());
    expect(r.structural.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("fails when a module's PRD file is missing", () => {
    const dir = modulesRun();
    rmSync(join(dir, "prd", "capture"), { recursive: true, force: true });
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/Missing required module PRD: prd\/capture\/PRD\.md/);
  });

  it("fails when the PRD index is missing", () => {
    const dir = modulesRun();
    rmSync(join(dir, "prd", "README.md"), { force: true });
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/prd\/README\.md/);
  });

  it("fails an FR without a module (modules mode is all-or-nothing)", () => {
    const dir = modulesRun();
    mutateSRD(dir, (s) => delete s.functional[0]!.module);
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/FR-001 has no module/);
  });

  it("fails an FR whose module is not declared", () => {
    const dir = modulesRun();
    mutateSRD(dir, (s) => (s.functional[0]!.module = "ghost"));
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/FR-001 references unknown module "ghost"/);
  });

  it("fails a module dependsOn that names no declared module", () => {
    const dir = modulesRun();
    mutateSRD(dir, (s) => (s.modules![1]!.dependsOn = ["ghost"]));
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/module "search" depends on unknown module "ghost"/);
  });

  it("warns (not fails) on a module with no requirements", () => {
    const dir = modulesRun();
    mutateSRD(dir, (s) => s.modules!.push({ id: "empty-one", name: "Empty", frIds: [], dependsOn: [] }));
    // the PRD file for the new module doesn't exist — that IS an error; create it
    // so only the zero-FR warning remains under test
    mkdirSync(join(dir, "prd", "empty-one"), { recursive: true });
    writeFileSync(join(dir, "prd", "empty-one", "PRD.md"), "# PRD — Empty\n");
    const r = checkRun(dir);
    expect(r.ok).toBe(true);
    expect(r.structural.warnings.join(" ")).toMatch(/module "empty-one" has no requirements/);
  });
});

describe("checkRun — advisory grounding (never fails the build)", () => {
  it("reports coverage and dangling citations as warnings, not errors", () => {
    const dir = renderRun();
    mutateSRD(dir, (s) => (s.functional[0]!.rationaleEvidence = ["E99"]));
    const r = checkRun(dir);
    expect(r.ok).toBe(true); // structural gate still passes
    expect(r.coverage.dangling).toContain("E99");
    expect(r.structural.warnings.join(" ")).toMatch(/do not resolve to evidence/);
  });

  it("computes grounded counts and uncited evidence", () => {
    const r = checkRun(renderRun({ level: "complex" }));
    expect(r.coverage.frTotal).toBe(brief.featureWishlist.length);
    expect(r.coverage.frGrounded).toBeGreaterThan(0);
    expect(r.coverage.resolved.length).toBeGreaterThan(0);
  });

  it("notes missing evidence.json without failing the structural gate", () => {
    const dir = renderRun({ withEvidence: false });
    const r = checkRun(dir);
    expect(r.ok).toBe(true);
    expect(r.structural.warnings.join(" ")).toMatch(/No evidence\/evidence\.json/);
  });

  it("does not crash on a null element in evidence.json", () => {
    const dir = renderRun();
    writeFileSync(join(dir, "evidence", "evidence.json"), JSON.stringify([null, evidence[0]]));
    expect(() => checkRun(dir)).not.toThrow();
    expect(checkRun(dir).ok).toBe(true);
  });
});

describe("checkRun — opt-in grounding threshold (--min-grounding)", () => {
  it("never gates without the option, regardless of coverage", () => {
    const dir = renderRun();
    mutateSRD(dir, (s) => {
      s.functional.forEach((f) => (f.rationaleEvidence = []));
      s.nonFunctional.forEach((n) => (n.rationaleEvidence = []));
      s.architecture.adrs.forEach((a) => (a.evidence = []));
    });
    const r = checkRun(dir);
    expect(r.ok).toBe(true);
    expect(r.grounding).toBeUndefined();
  });

  it("fails below the threshold and passes above it, without touching structural.ok", () => {
    const dir = renderRun();
    const strict = checkRun(dir, { minGrounding: 100 });
    expect(strict.grounding!.threshold).toBe(100);
    expect(strict.grounding!.ok).toBe(false); // fixture is only partially grounded
    expect(strict.ok).toBe(false);
    expect(strict.structural.ok).toBe(true); // structural semantics unchanged

    const lax = checkRun(dir, { minGrounding: 10 });
    expect(lax.grounding!.ok).toBe(true);
    expect(lax.ok).toBe(true);
  });

  it("reports the actual percentage over all groundable claims", () => {
    const r = checkRun(renderRun(), { minGrounding: 50 });
    const c = r.coverage;
    const expected = Math.round(((c.frGrounded + c.nfrGrounded + c.adrGrounded) / (c.frTotal + c.nfrTotal + c.adrTotal)) * 100);
    expect(r.grounding!.actualPct).toBe(expected);
  });
});

describe("checkRun — renderer-templated criteria gate", () => {
  it("passes the fixture cleanly — every feature note carries a concrete outcome", () => {
    const r = checkRun(renderRun());
    expect(r.ok).toBe(true);
    expect(r.structural.errors.join(" ")).not.toMatch(/renderer-templated/);
    expect(r.structural.warnings.join(" ")).not.toMatch(/renderer-templated/);
  });

  it("fails at complex when an acceptance criterion still carries the renderer template", () => {
    const dir = renderRun(); // renderRun defaults to complex
    mutateSRD(dir, (s) => (s.functional[0]!.acceptance[0]!.then = 'the result of "save an article" is persisted and visible to the user'));
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/renderer-templated/);
    expect(r.structural.errors.join(" ")).toMatch(/acceptance-criteria\.md/);
  });

  it("stays an advisory warning at light", () => {
    const dir = renderRun({ level: "light" });
    mutateSRD(dir, (s) => (s.functional[0]!.acceptance[0]!.then = 'the result of "save an article" is persisted and visible to the user'));
    const r = checkRun(dir);
    expect(r.ok).toBe(true);
    expect(r.structural.warnings.join(" ")).toMatch(/renderer-templated/);
  });

  it("stays silent once every criterion is sharpened", () => {
    const dir = renderRun();
    mutateSRD(dir, (s) => s.functional.forEach((f) => f.acceptance.forEach((a) => (a.then = "the article appears in the reading list within 2 seconds"))));
    const r = checkRun(dir);
    expect(r.structural.warnings.join(" ")).not.toMatch(/renderer-templated/);
    expect(r.structural.errors.join(" ")).not.toMatch(/renderer-templated/);
  });
});

describe("checkRun — design system gate", () => {
  it("passes the seeded design at complex and reports no design errors at light", () => {
    expect(checkRun(renderRun({ level: "complex" })).structural.ok).toBe(true);
    const light = checkRun(renderRun({ level: "light" }));
    expect(light.structural.ok).toBe(true);
    expect(light.structural.errors.join(" ")).not.toMatch(/design/i);
  });

  it("fails when a component references an unknown requirement", () => {
    const dir = renderRun({ level: "complex" });
    mutateSRD(dir, (s) => (s.design!.components[0]!.relatedFRs = ["FR-999"]));
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/references unknown requirement "FR-999"/);
  });

  it("fails when a required design-token category is missing", () => {
    const dir = renderRun({ level: "complex" });
    mutateSRD(dir, (s) => (s.design!.tokens = s.design!.tokens.filter((t) => t.category !== "motion")));
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/missing the required category: motion/);
  });

  it("fails when the component inventory is empty", () => {
    const dir = renderRun({ level: "complex" });
    mutateSRD(dir, (s) => (s.design!.components = []));
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/no components/i);
  });

  it("fails on a missing accessibility standard or an a11y requirement without criteria", () => {
    const dir = renderRun({ level: "complex" });
    mutateSRD(dir, (s) => {
      s.design!.accessibility.standard = "";
      s.design!.accessibility.requirements[0]!.acceptance = [];
    });
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/no accessibility target standard/);
    expect(r.structural.errors.join(" ")).toMatch(/A11Y-001 has no acceptance criteria/);
  });

  it("fails when a rendered design file is missing", () => {
    const dir = renderRun({ level: "complex" });
    rmSync(join(dir, "design", "COMPONENTS.md"));
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/Missing required design file: design\/COMPONENTS\.md/);
  });

  it("warns (advisory) while the tokens are still seeded defaults", () => {
    const r = checkRun(renderRun({ level: "complex" }));
    expect(r.ok).toBe(true);
    expect(r.structural.warnings.join(" ")).toMatch(/seeded defaults/i);
  });

  it("stays silent on the seeded-defaults advisory once the banner is replaced", () => {
    const dir = renderRun({ level: "complex" });
    const tokenDoc = join(dir, "design", "DESIGN-TOKENS.md");
    writeFileSync(tokenDoc, readFileSync(tokenDoc, "utf8").replace(DESIGN_TOKENS_SEEDED_BANNER, "Brand-tuned tokens."));
    expect(checkRun(dir).structural.warnings.join(" ")).not.toMatch(/seeded defaults/i);
  });

  it("fails when a screen or a user flow references an unknown requirement", () => {
    const sdir = renderRun({ level: "complex" });
    mutateSRD(sdir, (s) => (s.design!.screens[0]!.relatedFRs = ["FR-999"]));
    expect(checkRun(sdir).structural.errors.join(" ")).toMatch(/Screen ".*" references unknown requirement "FR-999"/);

    const fdir = renderRun({ level: "complex" });
    mutateSRD(fdir, (s) => (s.design!.flows[0]!.frIds = ["FR-999"]));
    expect(checkRun(fdir).structural.errors.join(" ")).toMatch(/User flow ".*" references unknown requirement "FR-999"/);
  });

  it("fails when the design system has no accessibility requirements", () => {
    const dir = renderRun({ level: "complex" });
    mutateSRD(dir, (s) => (s.design!.accessibility.requirements = []));
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/no accessibility requirements/);
  });
});

describe("checkRun — manifest & content edge cases", () => {
  it("fails cleanly when SRD.json is absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "construct-check-nosrd-"));
    dirs.push(dir);
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/No SRD\.json/);
  });

  it("fails when SRD.json is unreadable", () => {
    const dir = renderRun();
    writeFileSync(srdManifestPath(dir), "}not json{");
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/SRD\.json is unreadable/);
  });

  it("fails on an ADR with an invalid status", () => {
    const dir = renderRun();
    mutateSRD(dir, (s) => ((s.architecture.adrs[0]! as { status: string }).status = "bogus"));
    expect(checkRun(dir).structural.errors.join(" ")).toMatch(/invalid status "bogus"/);
  });

  it("warns when an NFR metric is still the renderer's generic placeholder", () => {
    const dir = renderRun();
    mutateSRD(dir, (s) => (s.nonFunctional[0]!.metric = 'A measurable target for "x" is agreed and tracked.'));
    expect(checkRun(dir).structural.warnings.join(" ")).toMatch(/generic placeholders/);
  });

  it("notes an unreadable evidence.json without failing the structural gate", () => {
    const dir = renderRun();
    writeFileSync(join(dir, "evidence", "evidence.json"), "{ broken ][");
    const r = checkRun(dir);
    expect(r.ok).toBe(true);
    expect(r.structural.warnings.join(" ")).toMatch(/unreadable/);
  });
});

describe("checkRun — semantic-skip warning (cited claims without --semantic)", () => {
  it("reports the skipped semantic gate when the SRD carries resolved citations", () => {
    const dir = renderRun(); // sample brief + evidence → citations resolve
    const r = checkRun(dir);
    expect(r.coverage.resolved.length).toBeGreaterThan(0); // precondition
    expect(r.semanticSkipped).toBeDefined();
    expect(r.semanticSkipped!.citedClaims).toBeGreaterThan(0);
    expect(r.ok).toBe(true); // never gates
    const report = formatCheckReport(r, dir);
    expect(report).toMatch(/Semantic gate: SKIPPED/);
    expect(report).toMatch(/never .*verified|not .*verified/i);
    expect(report).toContain("construct review");
  });

  it("stays silent when there are no citations to verify", () => {
    const dir = renderRun({ withEvidence: false, briefOverride: { competitors: [], ossSeeds: [] } });
    const r = checkRun(dir);
    expect(r.coverage.resolved.length).toBe(0);
    expect(r.semanticSkipped).toBeUndefined();
    expect(formatCheckReport(r, dir)).not.toMatch(/Semantic gate: SKIPPED/);
  });

  it("stays silent when --semantic engages the gate", () => {
    const dir = renderRun();
    const r = checkRun(dir, { semantic: true, allowUnverified: true });
    expect(r.semanticSkipped).toBeUndefined();
  });

  it("points at VERIFY.json when one already exists", () => {
    const dir = renderRun();
    writeFileSync(join(dir, "VERIFY.json"), JSON.stringify({ ok: true, verdicts: [] }));
    const r = checkRun(dir);
    expect(r.semanticSkipped?.verifyExists).toBe(true);
    expect(formatCheckReport(r, dir)).toMatch(/--semantic/);
  });
});

describe("checkRun --semantic composition edge cases", () => {
  // A verdict pair as `review --apply` persists it (verdict: null = unadjudicated).
  const pair = (claimId: string, verdict: string | null) => ({
    claimId,
    kind: "FR",
    claim: `${claimId} claim`,
    evidenceId: "E1",
    source: "oss",
    digest: "d",
    verdict,
    note: "",
  });

  it("folds in unadjudicated claims from VERIFY.json's verdicts[] as a warning (still passes)", () => {
    const dir = renderRun();
    writeFileSync(
      join(dir, "VERIFY.json"),
      JSON.stringify({
        ok: true,
        pairs: 2,
        adjudicated: 1,
        supported: 1,
        partial: 0,
        refuted: 0,
        unsupported: 0,
        failures: [],
        unadjudicated: ["FR-002"],
        verdicts: [pair("FR-001", "supported"), pair("FR-002", null)],
      }),
    );
    const r = checkRun(dir, { semantic: true });
    expect(r.semantic?.ok).toBe(true);
    expect(r.structural.warnings.join(" ")).toMatch(/not fully adjudicated/);
  });

  it("fails closed when VERIFY.json is unreadable; --allow-unverified degrades to the warning", () => {
    const dir = renderRun();
    writeFileSync(join(dir, "VERIFY.json"), "}broken{");
    const strict = checkRun(dir, { semantic: true });
    expect(strict.ok).toBe(false);
    expect(strict.semanticError).toMatch(/VERIFY\.json is unreadable/);
    const lax = checkRun(dir, { semantic: true, allowUnverified: true });
    expect(lax.semanticError).toBeUndefined();
    expect(lax.structural.warnings.join(" ")).toMatch(/VERIFY\.json is unreadable/);
  });
});

describe("formatCheckReport", () => {
  it("renders the grounding gate + semantic gate sections; pct is n/a for a zero total", () => {
    const r: CheckResult = {
      ok: false,
      structural: { ok: true, errors: [], warnings: ["a warning"] },
      coverage: {
        frTotal: 2,
        frGrounded: 1,
        nfrTotal: 0,
        nfrGrounded: 0,
        adrTotal: 3,
        adrGrounded: 3,
        dangling: ["E9"],
        uncited: [],
        citations: ["E1"],
        resolved: ["E1"],
      },
      grounding: { threshold: 80, actualPct: 50, ok: false },
      semantic: {
        ok: false,
        pairs: 3,
        adjudicated: 3,
        supported: 1,
        partial: 0,
        refuted: 1,
        unsupported: 1,
        failures: [{ claimId: "FR-002", evidenceId: "E2", verdict: "refuted", note: "" }],
        unadjudicated: [],
      },
    };
    const text = formatCheckReport(r, "/run");
    expect(text).toMatch(/non-functional: 0\/0 grounded \(n\/a\)/);
    expect(text).toMatch(/Grounding gate \(opt-in --min-grounding 80\)/);
    expect(text).toMatch(/✗ FAIL — 50% of groundable claims/);
    expect(text).toMatch(/Semantic claim-support gate/);
    expect(text).toMatch(/✗ FR-002 \(E2\): refuted/);
    expect(text).toMatch(/✗ FAIL — a claim is refuted/);
  });

  it("prints PASS wording and flags leftover unadjudicated claims when the semantic gate passes with gaps", () => {
    const r: CheckResult = {
      ok: true,
      structural: { ok: true, errors: [], warnings: [] },
      coverage: { frTotal: 1, frGrounded: 1, nfrTotal: 1, nfrGrounded: 1, adrTotal: 1, adrGrounded: 1, dangling: [], uncited: [], citations: [], resolved: [] },
      grounding: { threshold: 50, actualPct: 100, ok: true },
      semantic: { ok: true, pairs: 2, adjudicated: 1, supported: 1, partial: 0, refuted: 0, unsupported: 0, failures: [], unadjudicated: ["FR-003"] },
    };
    const text = formatCheckReport(r, "/run");
    expect(text).toMatch(/✓ PASS — 100% of groundable claims/);
    expect(text).toMatch(/✓ PASS — no refuted\/unsupported claims \(1 still unadjudicated\)/);
  });
});

describe("checkRun — brainstorm advisory", () => {
  it("warns (never gates) when brainstorm.json has proposed ideas", () => {
    const dir = renderRun();
    writeFileSync(
      join(dir, "brainstorm.json"),
      JSON.stringify({ schemaVersion: 1, idea: "x", createdAt: "T", ideas: [{ id: "B-001", angle: "feature", title: "idea", status: "proposed" }] }),
    );
    const r = checkRun(dir);
    expect(r.ok).toBe(true); // advisory
    expect(r.structural.warnings.join(" ")).toMatch(/brainstorm.*proposed/i);
  });

  it("stays silent once every brainstorm idea is adjudicated", () => {
    const dir = renderRun();
    writeFileSync(
      join(dir, "brainstorm.json"),
      JSON.stringify({ schemaVersion: 1, idea: "x", createdAt: "T", ideas: [{ id: "B-001", angle: "feature", title: "idea", status: "rejected" }] }),
    );
    const r = checkRun(dir);
    expect(r.structural.warnings.join(" ")).not.toMatch(/brainstorm/i);
  });
});

describe("checkRun — placeholder words vs decisions", () => {
  it("does NOT hard-fail when a feature title legitimately contains TODO (advisory only)", () => {
    const r = checkRun(
      renderRun({
        briefOverride: {
          featureWishlist: [{ title: "Manage a shared TODO list", priority: "must", notes: "so that every teammate sees an added item within 2 seconds" }],
        },
      }),
    );
    expect(r.ok).toBe(true); // TODO in a real title must not fail the build
    expect(r.structural.warnings.join(" ")).toMatch(/TODO\/TBD\/FIXME/);
  });

  it("still hard-fails on an unresolved 🧠 decision", () => {
    const r = checkRun(renderRun({ briefOverride: { openQuestions: ["Pick a license"] } }));
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/🧠/);
  });

  it("does NOT hard-fail when a 🧠 glyph appears in a feature title (only the rendered Decide callout counts)", () => {
    // The 🧠 lands in FUNCTIONAL.md, design/SCREENS.md and TRACEABILITY.md, but
    // none of those is the renderer's `> 🧠 **Decide:**` callout.
    const r = checkRun(
      renderRun({
        level: "complex",
        briefOverride: {
          featureWishlist: [{ title: "Capture a 🧠 brainstorm", priority: "must", notes: "so that a captured idea is never lost on reload" }],
        },
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.structural.errors.join(" ")).not.toMatch(/Unresolved decision/);
  });
});
