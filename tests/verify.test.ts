import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderSRD } from "../src/render.js";
import { loadPlan, writePlan } from "../src/plan.js";
import { verifyRun, formatVerifyReport, isTestFile } from "../src/verify.js";
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

describe("isTestFile — cross-language test conventions", () => {
  it.each([
    "src/save.test.ts",
    "lib/save.spec.js",
    "pkg/store_test.go",
    "spec/article_spec.rb",
    "app/test_models.py",
    "src/main/FooTest.java",
    "Project/FooTests.cs",
    "test/save.py",
    "tests/save.ts",
    "specs/flow.js",
    "e2e/checkout.ts",
    "__tests__/save.tsx",
  ])("recognises %s as a test file", (rel) => {
    expect(isTestFile(rel)).toBe(true);
  });

  it.each(["src/latest.java", "docs/protest.md", "src/contest.ts", "src/manifest.go", "src/attestation.py"])("does not misclassify %s", (rel) => {
    expect(isTestFile(rel)).toBe(false);
  });
});

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

describe("verifyRun — load & integrity failure paths", () => {
  it("fails when BUILD-PLAN.json is present but unreadable", () => {
    const { run } = setup();
    writeFileSync(join(run, "BUILD-PLAN.json"), "{ not json ][");
    const r = verifyRun(run);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/unreadable or malformed/);
  });

  it("rejects a plan whose schemaVersion is unsupported", () => {
    const { run, mutate } = setup();
    mutate((p) => ((p as unknown as { schemaVersion: number }).schemaVersion = 999));
    const r = verifyRun(run);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/schemaVersion 999 is not supported/);
  });

  it("fails when the SRD.json the plan verifies against is missing", () => {
    const { run } = setup();
    rmSync(join(run, "SRD.json"));
    const r = verifyRun(run);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/No SRD\.json/);
  });

  it("fails when the SRD.json is unreadable", () => {
    const { run } = setup();
    writeFileSync(join(run, "SRD.json"), "}not json{");
    const r = verifyRun(run);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/SRD\.json is unreadable/);
  });

  it("fails when a declared app directory does not exist", () => {
    const { run, mutate } = setup();
    mutate((p) => (p.conventions.appDir = join(tmpdir(), "construct-no-such-appdir-zzz")));
    const r = verifyRun(run);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/App directory does not exist/);
  });

  it("only warns (never gates) when no app dir is declared and nothing is built", () => {
    const { run, mutate } = setup();
    mutate((p) => (p.conventions.appDir = null));
    const r = verifyRun(run);
    expect(r.ok).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/No app directory declared yet/);
  });

  it("fails when conventions.frTagPattern is not a valid regex", () => {
    const { run, mutate } = setup();
    mutate((p) => (p.conventions.frTagPattern = "FR-("));
    const r = verifyRun(run);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/frTagPattern is not a valid regex/);
  });

  it("runs per-task verify commands under --run-tests and flags a failing one", () => {
    const { run, app, mutate } = setup();
    mkdirSync(join(app, "src"), { recursive: true });
    writeFileSync(join(app, "src", "save.ts"), "x\n");
    mutate((p) => {
      const t = p.tasks.find((x) => x.frIds.includes("FR-001"))!;
      t.status = "done";
      t.artifacts = ["src/save.ts"];
      t.tests = [];
      t.verify.commands = [`node -e "process.exit(4)"`];
    });
    const r = verifyRun(run, { runTests: true });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/verify command failed \(exit 4\)/);
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
