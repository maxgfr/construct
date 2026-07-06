import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderSRD } from "../src/render.js";
import { slugTitle } from "../src/templates.js";
import type { Brief, EvidenceItem, SRD } from "../src/types.js";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const brief = JSON.parse(readFileSync(join(FIX, "sample-brief.json"), "utf8")) as Brief;
const modulesBrief = JSON.parse(readFileSync(join(FIX, "sample-brief-modules.json"), "utf8")) as Brief;
const evidence = JSON.parse(readFileSync(join(FIX, "sample-evidence.json"), "utf8")) as EvidenceItem[];

const dirs: string[] = [];
function freshDir(): string {
  const d = mkdtempSync(join(tmpdir(), "construct-render-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("renderSRD", () => {
  it("writes the full SRD tree and a parseable SRD.json", () => {
    const out = freshDir();
    const r = renderSRD(brief, evidence, { level: "complex", out, merge: true, generatedAt: "T" });
    for (const f of [
      "00-overview/VISION.md",
      "00-overview/SCOPE.md",
      "requirements/FUNCTIONAL.md",
      "requirements/NON-FUNCTIONAL.md",
      "architecture/SYSTEM-CONTEXT.md",
      "architecture/DATA-MODEL.md",
      "architecture/INTERFACES.md",
      "competitive/LANDSCAPE.md",
      "BUILD-PLAN.md",
      "TRACEABILITY.md",
      "SRD.json",
      "SRD.md",
    ]) {
      expect(existsSync(join(out, f)), f).toBe(true);
    }
    const manifest = JSON.parse(readFileSync(join(out, "SRD.json"), "utf8")) as SRD;
    expect(manifest.functional.length).toBe(brief.featureWishlist.length);
    expect(r.files).toContain("SRD.json");
  });

  it("inlines [E#] hooks and Given/When/Then in FUNCTIONAL.md", () => {
    const out = freshDir();
    renderSRD(brief, evidence, { level: "light", out, merge: false, generatedAt: "T" });
    const fn = readFileSync(join(out, "requirements/FUNCTIONAL.md"), "utf8");
    expect(fn).toMatch(/## FR-001 —/);
    expect(fn).toMatch(/\*\*Given\*\* .*\*\*When\*\* .*\*\*Then\*\*/);
    expect(fn).toMatch(/\[E\d+\]/); // at least one grounded requirement
  });

  it("emits a 🧠 callout for each open question and none when there are none", () => {
    const withQ: Brief = { ...brief, openQuestions: ["Pick a license model", "Hosted option later?"] };
    const out1 = freshDir();
    renderSRD(withQ, evidence, { level: "light", out: out1, merge: false, generatedAt: "T" });
    const scope1 = readFileSync(join(out1, "00-overview/SCOPE.md"), "utf8");
    expect(scope1.match(/🧠/g)?.length).toBe(2);

    const out2 = freshDir();
    renderSRD(brief, evidence, { level: "light", out: out2, merge: false, generatedAt: "T" });
    const scope2 = readFileSync(join(out2, "00-overview/SCOPE.md"), "utf8");
    expect(scope2).not.toContain("🧠");
  });

  it("escapes a '|' in a competitor name so the markdown table is not corrupted", () => {
    const out = freshDir();
    const b: Brief = { ...brief, competitors: ["Foo | Bar"] };
    renderSRD(b, evidence, { level: "light", out, merge: false, generatedAt: "T" });
    const land = readFileSync(join(out, "competitive/LANDSCAPE.md"), "utf8");
    expect(land).toContain("Foo \\| Bar"); // pipe escaped, cell intact
    // the competitor row must still have exactly 3 cells (4 pipes counting borders)
    const row = land.split("\n").find((l) => l.includes("Foo"))!;
    expect((row.match(/(?<!\\)\|/g) || []).length).toBe(4);
  });

  it("clears stale id-derived ADR files on re-render", () => {
    const out = freshDir();
    renderSRD(brief, evidence, { level: "complex", out, merge: false, generatedAt: "T" });
    const stale = join(out, "architecture/decisions/9999-stale-orphan.md");
    writeFileSync(stale, "# stale\n> 🧠 leftover\n");
    renderSRD(brief, evidence, { level: "complex", out, merge: false, generatedAt: "T" });
    expect(existsSync(stale)).toBe(false);
  });

  it("drops a stale SRD.md from a prior --merge run when re-rendering without --merge", () => {
    const out = freshDir();
    // First render WITH merge (and an open question, so SRD.md carries a 🧠).
    renderSRD({ ...brief, openQuestions: ["Pick a license model"] }, evidence, { level: "complex", out, merge: true, generatedAt: "T" });
    expect(existsSync(join(out, "SRD.md"))).toBe(true);
    // Re-render WITHOUT merge and with the decision resolved — the stale bundle
    // must not linger for `check` to flag.
    renderSRD(brief, evidence, { level: "light", out, merge: false, generatedAt: "T" });
    expect(existsSync(join(out, "SRD.md"))).toBe(false);
  });

  it("seeds DATA-MODEL.md and INTERFACES.md from inference (not blank)", () => {
    const out = freshDir();
    renderSRD(brief, evidence, { level: "complex", out, merge: false, generatedAt: "T" });
    const dm = readFileSync(join(out, "architecture/DATA-MODEL.md"), "utf8");
    expect(dm).toMatch(/## Article/);
    expect(dm).toMatch(/Seeded by inference/);
    const ifc = readFileSync(join(out, "architecture/INTERFACES.md"), "utf8");
    expect(ifc).toMatch(/## Web App/);
    expect(ifc).toMatch(/Seeded by inference/);
  });

  it("is byte-deterministic for the same inputs and generatedAt", () => {
    const a = freshDir();
    const b = freshDir();
    renderSRD(brief, evidence, { level: "complex", out: a, merge: true, generatedAt: "T" });
    renderSRD(brief, evidence, { level: "complex", out: b, merge: true, generatedAt: "T" });
    for (const f of ["requirements/FUNCTIONAL.md", "SRD.json", "SRD.md", "TRACEABILITY.md", "design/DESIGN-TOKENS.md", "design/COMPONENTS.md"]) {
      expect(readFileSync(join(a, f), "utf8")).toBe(readFileSync(join(b, f), "utf8"));
    }
  });
});

describe("renderSRD design system", () => {
  const DESIGN_FILES = [
    "design/PRINCIPLES.md",
    "design/DESIGN-TOKENS.md",
    "design/design-tokens.json",
    "design/COMPONENTS.md",
    "design/SCREENS.md",
    "design/ACCESSIBILITY.md",
  ];

  it("renders the design/ subtree at complex level", () => {
    const out = freshDir();
    renderSRD(brief, evidence, { level: "complex", out, merge: false, generatedAt: "T" });
    for (const f of DESIGN_FILES) expect(existsSync(join(out, f)), f).toBe(true);
    // the machine-readable token twin parses and covers every category
    const tokens = JSON.parse(readFileSync(join(out, "design/design-tokens.json"), "utf8")) as Record<string, Record<string, string>>;
    for (const c of ["color", "typography", "spacing", "radius", "elevation", "motion"]) expect(tokens[c], c).toBeTruthy();
    // components carry states + FR links; accessibility states the standard
    const comp = readFileSync(join(out, "design/COMPONENTS.md"), "utf8");
    expect(comp).toMatch(/\*\*States:\*\*/);
    expect(comp).toMatch(/\*\*Realises:\*\* FR-\d{3}/);
    const a11y = readFileSync(join(out, "design/ACCESSIBILITY.md"), "utf8");
    expect(a11y).toMatch(/Target standard:\*\* WCAG 2\.2 AA/);
    expect(a11y).toMatch(/\*\*Given\*\* .*\*\*When\*\* .*\*\*Then\*\*/);
  });

  it("does NOT render the design subtree at light level", () => {
    const out = freshDir();
    renderSRD(brief, evidence, { level: "light", out, merge: false, generatedAt: "T" });
    expect(existsSync(join(out, "design"))).toBe(false);
  });

  it("skips the design subtree at complex with noDesign", () => {
    const out = freshDir();
    renderSRD(brief, evidence, { level: "complex", out, merge: false, generatedAt: "T", noDesign: true });
    expect(existsSync(join(out, "design"))).toBe(false);
    // and the traceability matrix keeps its original 5 columns
    const trace = readFileSync(join(out, "TRACEABILITY.md"), "utf8");
    expect(trace).not.toContain("Components");
  });

  it("clears a stale design/ subtree when re-rendering without design", () => {
    const out = freshDir();
    renderSRD(brief, evidence, { level: "complex", out, merge: false, generatedAt: "T" });
    expect(existsSync(join(out, "design/DESIGN-TOKENS.md"))).toBe(true);
    renderSRD(brief, evidence, { level: "light", out, merge: false, generatedAt: "T" });
    expect(existsSync(join(out, "design"))).toBe(false);
  });

  it("adds Components/Screens columns to the traceability matrix at complex", () => {
    const out = freshDir();
    renderSRD(brief, evidence, { level: "complex", out, merge: false, generatedAt: "T" });
    const trace = readFileSync(join(out, "TRACEABILITY.md"), "utf8");
    expect(trace).toContain("| Requirement | NFRs | ADRs | Entities | Interfaces | Components | Screens |");
  });
});

describe("renderSRD --prd export", () => {
  it("writes one PRD file per FR plus an index listing them when prd is set", () => {
    const out = freshDir();
    const r = renderSRD(brief, evidence, { level: "complex", out, merge: false, generatedAt: "T", prd: true });
    const manifest = JSON.parse(readFileSync(join(out, "SRD.json"), "utf8")) as SRD;
    expect(manifest.functional.length).toBeGreaterThan(0);
    const index = readFileSync(join(out, "requirements/prd/README.md"), "utf8");
    for (const fr of manifest.functional) {
      const rel = `requirements/prd/PRD-${fr.id}-${slugTitle(fr.title)}.md`;
      expect(existsSync(join(out, rel)), rel).toBe(true);
      expect(r.files).toContain(rel);
      expect(index).toContain(`PRD-${fr.id}-${slugTitle(fr.title)}.md`);
    }
    expect(r.files).toContain("requirements/prd/README.md");
  });

  it("renders priority, Given/When/Then, citations and resolved NFR statements in a PRD", () => {
    const out = freshDir();
    renderSRD(brief, evidence, { level: "complex", out, merge: false, generatedAt: "T", prd: true });
    const manifest = JSON.parse(readFileSync(join(out, "SRD.json"), "utf8")) as SRD;
    const all = manifest.functional.map((fr) => readFileSync(join(out, `requirements/prd/PRD-${fr.id}-${slugTitle(fr.title)}.md`), "utf8")).join("\n");
    expect(all).toMatch(/_Priority: (must|should|could)_/);
    expect(all).toMatch(/\*\*Given\*\* .*\*\*When\*\* .*\*\*Then\*\*/);
    expect(all).toMatch(/\[E\d+\]/); // grounding citations survive into the PRDs
    // Linked NFRs are resolved to their statements, not left as bare ids.
    const withNfr = manifest.functional.find((fr) => fr.nfrs.length > 0);
    expect(withNfr, "fixture should yield at least one FR with linked NFRs at complex").toBeDefined();
    const prd = readFileSync(join(out, `requirements/prd/PRD-${withNfr!.id}-${slugTitle(withNfr!.title)}.md`), "utf8");
    const nfr = manifest.nonFunctional.find((n) => n.id === withNfr!.nfrs[0])!;
    expect(prd).toContain(nfr.id);
    expect(prd).toContain(nfr.statement.slice(0, 40));
  });

  it("does not write the prd/ subtree by default and clears a stale one on re-render", () => {
    const out = freshDir();
    renderSRD(brief, evidence, { level: "complex", out, merge: false, generatedAt: "T", prd: true });
    expect(existsSync(join(out, "requirements/prd/README.md"))).toBe(true);
    renderSRD(brief, evidence, { level: "complex", out, merge: false, generatedAt: "T" });
    expect(existsSync(join(out, "requirements/prd"))).toBe(false);
  });
});

describe("renderSRD modules mode (per-module PRDs)", () => {
  const MODULE_IDS = ["capture", "search", "library"];

  it("writes prd/README.md plus one PRD per declared module", () => {
    const out = freshDir();
    const r = renderSRD(modulesBrief, evidence, { level: "complex", out, merge: false, generatedAt: "T" });
    expect(existsSync(join(out, "prd/README.md"))).toBe(true);
    expect(r.files).toContain("prd/README.md");
    for (const id of MODULE_IDS) {
      expect(existsSync(join(out, `prd/${id}/PRD.md`)), id).toBe(true);
      expect(r.files).toContain(`prd/${id}/PRD.md`);
    }
    const index = readFileSync(join(out, "prd/README.md"), "utf8");
    for (const id of MODULE_IDS) expect(index).toContain(`${id}/PRD.md`);
  });

  it("renders full FR blocks, module scope, NFR refs, data/interface slices and dependencies in a module PRD", () => {
    const out = freshDir();
    renderSRD(modulesBrief, evidence, { level: "complex", out, merge: false, generatedAt: "T" });
    const capture = readFileSync(join(out, "prd/capture/PRD.md"), "utf8");
    // full FR blocks live here (not just ids)
    expect(capture).toMatch(/## FR-001 — Save an article/);
    expect(capture).toMatch(/\*\*Given\*\* .*\*\*When\*\* .*\*\*Then\*\*/);
    expect(capture).toMatch(/\[E\d+\]/);
    // scope names the other modules as out-of-scope, with relative links
    expect(capture).toMatch(/Out of scope/i);
    expect(capture).toContain("../search/PRD.md");
    // module-scoped NFR reference table
    expect(capture).toMatch(/NFR-\d{3}/);
    // data-model slice: the Article entity is owned by capture FRs
    expect(capture).toMatch(/\bArticle\b/);
    // links back to the global docs
    expect(capture).toContain("../../00-overview/VISION.md");
    // search declares a dependency on capture
    const search = readFileSync(join(out, "prd/search/PRD.md"), "utf8");
    expect(search).toContain("../capture/PRD.md");
  });

  it("turns FUNCTIONAL.md into an index (no duplicated FR blocks) in modules mode", () => {
    const out = freshDir();
    renderSRD(modulesBrief, evidence, { level: "complex", out, merge: false, generatedAt: "T" });
    const fn = readFileSync(join(out, "requirements/FUNCTIONAL.md"), "utf8");
    expect(fn).toContain("FR-001");
    expect(fn).toContain("../prd/capture/PRD.md");
    expect(fn).not.toMatch(/\*\*Acceptance criteria:\*\*/); // full blocks live in the PRDs only
  });

  it("keeps full FR blocks in the --merge bundle even in modules mode", () => {
    const out = freshDir();
    renderSRD(modulesBrief, evidence, { level: "complex", out, merge: true, generatedAt: "T" });
    const bundle = readFileSync(join(out, "SRD.md"), "utf8");
    expect(bundle).toMatch(/## FR-001 — Save an article/);
    expect(bundle).toMatch(/\*\*Acceptance criteria:\*\*/);
  });

  it("adds a Module column to the traceability matrix in modules mode only", () => {
    const out = freshDir();
    renderSRD(modulesBrief, evidence, { level: "complex", out, merge: false, generatedAt: "T" });
    const trace = readFileSync(join(out, "TRACEABILITY.md"), "utf8");
    expect(trace).toContain("| Requirement | Module |");
    expect(trace).toMatch(/\| FR-001 \| capture \|/);

    const plain = freshDir();
    renderSRD(brief, evidence, { level: "complex", out: plain, merge: false, generatedAt: "T" });
    expect(readFileSync(join(plain, "TRACEABILITY.md"), "utf8")).not.toContain("| Module |");
  });

  it("regression: a brief without modules renders no prd/ tree and an unchanged FUNCTIONAL.md", () => {
    const out = freshDir();
    renderSRD(brief, evidence, { level: "complex", out, merge: false, generatedAt: "T" });
    expect(existsSync(join(out, "prd"))).toBe(false);
    const fn = readFileSync(join(out, "requirements/FUNCTIONAL.md"), "utf8");
    expect(fn).toMatch(/## FR-001 —/);
    expect(fn).toMatch(/\*\*Acceptance criteria:\*\*/);
  });

  it("clears a stale prd/ tree when re-rendering without modules", () => {
    const out = freshDir();
    renderSRD(modulesBrief, evidence, { level: "complex", out, merge: false, generatedAt: "T" });
    expect(existsSync(join(out, "prd/capture/PRD.md"))).toBe(true);
    renderSRD(brief, evidence, { level: "complex", out, merge: false, generatedAt: "T" });
    expect(existsSync(join(out, "prd"))).toBe(false);
  });

  it("is byte-deterministic in modules mode", () => {
    const a = freshDir();
    const b = freshDir();
    renderSRD(modulesBrief, evidence, { level: "complex", out: a, merge: false, generatedAt: "T" });
    renderSRD(modulesBrief, evidence, { level: "complex", out: b, merge: false, generatedAt: "T" });
    for (const f of ["prd/README.md", "prd/capture/PRD.md", "requirements/FUNCTIONAL.md", "TRACEABILITY.md", "SRD.json"]) {
      expect(readFileSync(join(a, f), "utf8")).toBe(readFileSync(join(b, f), "utf8"));
    }
  });
});
