import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderSRD } from "../src/render.js";
import type { Brief, EvidenceItem, SRD } from "../src/types.js";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const brief = JSON.parse(readFileSync(join(FIX, "sample-brief.json"), "utf8")) as Brief;
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

  it("is byte-deterministic for the same inputs and generatedAt", () => {
    const a = freshDir();
    const b = freshDir();
    renderSRD(brief, evidence, { level: "complex", out: a, merge: true, generatedAt: "T" });
    renderSRD(brief, evidence, { level: "complex", out: b, merge: true, generatedAt: "T" });
    for (const f of ["requirements/FUNCTIONAL.md", "SRD.json", "SRD.md", "TRACEABILITY.md"]) {
      expect(readFileSync(join(a, f), "utf8")).toBe(readFileSync(join(b, f), "utf8"));
    }
  });
});
