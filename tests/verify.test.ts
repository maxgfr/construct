import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderSRD } from "../src/render.js";
import { loadPlan, writePlan } from "../src/plan.js";
import { verifyRun, formatVerifyReport } from "../src/verify.js";
import type { Brief, BuildPlanDoc, EvidenceItem } from "../src/types.js";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const brief = JSON.parse(readFileSync(join(FIX, "sample-brief.json"), "utf8")) as Brief;
const evidence = JSON.parse(readFileSync(join(FIX, "sample-evidence.json"), "utf8")) as EvidenceItem[];

const dirs: string[] = [];
function freshDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

// A rendered run + an app dir, with a helper to mutate the plan.
function setup(): { run: string; app: string; mutate: (fn: (p: BuildPlanDoc) => void) => void } {
  const run = freshDir("construct-verify-run-");
  const app = freshDir("construct-verify-app-");
  renderSRD(brief, evidence, { level: "complex", out: run, merge: false, generatedAt: "T" });
  const mutate = (fn: (p: BuildPlanDoc) => void) => {
    const p = loadPlan(run)!;
    fn(p);
    writePlan(run, p);
  };
  mutate((p) => (p.conventions.appDir = app));
  return { run, app, mutate };
}

describe("verifyRun — static checks", () => {
  it("passes a fresh plan with nothing built yet", () => {
    const { run } = setup();
    const r = verifyRun(run);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    // coverage rows exist for every FR, all untested but unclaimed
    expect(r.frTestCoverage).toHaveLength(brief.featureWishlist.length);
  });

  it("fails when the plan is missing", () => {
    const run = freshDir("construct-verify-empty-");
    const r = verifyRun(run);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/No BUILD-PLAN\.json/);
  });

  it("fails when a done task's declared artifact does not exist", () => {
    const { run, mutate } = setup();
    mutate((p) => {
      const t = p.tasks.find((x) => x.frIds.includes("FR-001"))!;
      t.status = "done";
      t.artifacts = ["src/save.ts"];
    });
    const r = verifyRun(run);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/declared file is missing: src\/save\.ts/);
  });

  it("passes once the artifact and an FR-tagged test exist, and reports coverage", () => {
    const { run, app, mutate } = setup();
    mkdirSync(join(app, "src"), { recursive: true });
    mkdirSync(join(app, "tests"), { recursive: true });
    writeFileSync(join(app, "src", "save.ts"), "export const save = () => true;\n");
    writeFileSync(join(app, "tests", "save.test.ts"), `describe("FR-001 save an article", () => {});\n`);
    mutate((p) => {
      const t = p.tasks.find((x) => x.frIds.includes("FR-001"))!;
      t.status = "done";
      t.artifacts = ["src/save.ts"];
      t.tests = ["tests/save.test.ts"];
    });
    const r = verifyRun(run);
    expect(r.ok).toBe(true);
    const cov = r.frTestCoverage.find((c) => c.fr === "FR-001")!;
    expect(cov.testFiles).toEqual(["tests/save.test.ts"]);
  });

  it("warns (default) or fails (--strict) when a built must-have has no referencing test", () => {
    const { run, app, mutate } = setup();
    mkdirSync(join(app, "src"), { recursive: true });
    writeFileSync(join(app, "src", "save.ts"), "x\n");
    mutate((p) => {
      const t = p.tasks.find((x) => x.frIds.includes("FR-001"))!;
      t.status = "done";
      t.artifacts = ["src/save.ts"];
    });
    const lax = verifyRun(run);
    expect(lax.ok).toBe(true);
    expect(lax.warnings.join(" ")).toMatch(/FR-001 \(must\) is built but no test references it/);
    const strict = verifyRun(run, { strict: true });
    expect(strict.ok).toBe(false);
    expect(strict.errors.join(" ")).toMatch(/FR-001 \(must\)/);
  });

  it("fails on a dangling requirement or out-of-range acceptance ref", () => {
    const { run, mutate } = setup();
    mutate((p) => {
      p.tasks[1]!.frIds = ["FR-999"];
      p.tasks[2]!.acceptance = [{ frId: "FR-002", index: 99 }];
    });
    const r = verifyRun(run);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/unknown requirement "FR-999"/);
    expect(r.errors.join(" ")).toMatch(/out of range/);
  });

  it("fails on a dependency cycle", () => {
    const { run, mutate } = setup();
    mutate((p) => {
      p.tasks[1]!.dependsOn = [p.tasks[2]!.id];
      p.tasks[2]!.dependsOn = [p.tasks[1]!.id];
    });
    const r = verifyRun(run);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/dependency cycle/i);
  });

  it("fails when tasks are done but no app directory is declared", () => {
    const { run, mutate } = setup();
    mutate((p) => {
      p.conventions.appDir = null;
      p.tasks[1]!.status = "done";
    });
    const r = verifyRun(run);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/no app directory is declared/);
  });

  it("warns about stale FR tags after ids shift", () => {
    const { run, app } = setup();
    mkdirSync(join(app, "tests"), { recursive: true });
    writeFileSync(join(app, "tests", "old.test.ts"), `it("FR-099 legacy", () => {});\n`);
    const r = verifyRun(run);
    expect(r.warnings.join(" ")).toMatch(/FR id\(s\) absent from the SRD \(FR-099\)/);
  });
});

describe("verifyRun — opt-in command execution (--run-tests)", () => {
  it("runs the declared commands and flips the verdict on a failing one", () => {
    const { run, mutate } = setup();
    mutate((p) => (p.conventions.testCommand = `node -e "process.exit(0)"`));
    const pass = verifyRun(run, { runTests: true });
    expect(pass.ok).toBe(true);
    expect(pass.commandResults![0]).toMatchObject({ ok: true, exitCode: 0 });

    mutate((p) => (p.conventions.testCommand = `node -e "process.exit(3)"`));
    const failR = verifyRun(run, { runTests: true });
    expect(failR.ok).toBe(false);
    expect(failR.errors.join(" ")).toMatch(/Test command failed \(exit 3\)/);
  });

  it("never executes anything without the flag", () => {
    const { run, mutate } = setup();
    const canary = join(dirs[dirs.length - 1]!, "canary.txt");
    mutate((p) => (p.conventions.testCommand = `node -e "require('fs').writeFileSync('${canary}','x')"`));
    const r = verifyRun(run);
    expect(r.commandResults).toBeUndefined();
    expect(() => readFileSync(canary)).toThrow();
  });
});

describe("formatVerifyReport", () => {
  it("renders verdict, coverage and command sections", () => {
    const { run } = setup();
    const text = formatVerifyReport(verifyRun(run, { runTests: true }), run);
    expect(text).toMatch(/Plan & artifacts \(hard\):/);
    expect(text).toMatch(/Requirement → test coverage:/);
    expect(text).toMatch(/Commands \(--run-tests\):/);
  });
});
