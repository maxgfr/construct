import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderSRD } from "../src/render.js";
import { checkRun } from "../src/check.js";
import { srdManifestPath } from "../src/srd.js";
import type { Brief, EvidenceItem, SRD, Level } from "../src/types.js";

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

describe("checkRun — renderer-templated criteria nudges", () => {
  it("warns when acceptance criteria still carry the renderer's template", () => {
    // The fixture's "Tag and organize saved articles" has no notes, so its
    // positive-path Then stays templated.
    const r = checkRun(renderRun());
    expect(r.ok).toBe(true); // advisory only
    expect(r.structural.warnings.join(" ")).toMatch(/renderer-templated/);
  });

  it("stays silent once every criterion is sharpened", () => {
    const dir = renderRun();
    mutateSRD(dir, (s) =>
      s.functional.forEach((f) =>
        f.acceptance.forEach((a) => (a.then = "the article appears in the reading list within 2 seconds")),
      ),
    );
    const r = checkRun(dir);
    expect(r.structural.warnings.join(" ")).not.toMatch(/renderer-templated/);
  });
});

describe("checkRun — placeholder words vs decisions", () => {
  it("does NOT hard-fail when a feature title legitimately contains TODO (advisory only)", () => {
    const r = checkRun(renderRun({ briefOverride: { featureWishlist: [{ title: "Manage a shared TODO list", priority: "must" }] } }));
    expect(r.ok).toBe(true); // TODO in a real title must not fail the build
    expect(r.structural.warnings.join(" ")).toMatch(/TODO\/TBD\/FIXME/);
  });

  it("still hard-fails on an unresolved 🧠 decision", () => {
    const r = checkRun(renderRun({ briefOverride: { openQuestions: ["Pick a license"] } }));
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/🧠/);
  });
});
