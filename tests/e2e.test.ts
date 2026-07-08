import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, cpSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION, REQUIRED_NFR } from "../src/types.js";
import type { BuildPlanDoc, SRD } from "../src/types.js";

// End-to-end: drive the REAL bundled binary (scripts/construct.mjs) as a
// subprocess through the lifecycle an agent actually runs — render → status →
// check → review → verify — asserting exit codes, files and JSON shapes. This is
// the integration layer the per-module unit tests can't reach (CLI wiring, flag
// parsing, exit codes, JSON contracts, the claim-support gate end to end). All
// commands here are OFFLINE; the networked angles (research/web/oss/tech/so) are
// out of scope for a deterministic CI run.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(ROOT, "scripts", "construct.mjs");
const FIX = join(ROOT, "tests", "fixtures");

interface Run {
  status: number;
  stdout: string;
  stderr: string;
}

// Run the bundle. execFileSync throws on non-zero exit; normalise both paths to
// { status, stdout, stderr } so tests can assert on failures too.
function cli(args: string[]): Run {
  try {
    const stdout = execFileSync(process.execPath, [BIN, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stdout, stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: string | Buffer; stderr?: string | Buffer };
    return { status: err.status ?? 1, stdout: String(err.stdout ?? ""), stderr: String(err.stderr ?? "") };
  }
}

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "construct-e2e-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

// A seeded-but-unrendered run: brief.json + evidence/evidence.json from fixtures.
function seeded(): string {
  const run = join(tmp(), "run");
  mkdirSync(join(run, "evidence"), { recursive: true });
  cpSync(join(FIX, "sample-brief.json"), join(run, "brief.json"));
  cpSync(join(FIX, "sample-evidence.json"), join(run, "evidence", "evidence.json"));
  return run;
}

function rendered(level: "light" | "complex" = "complex", extra: string[] = []): string {
  const run = seeded();
  const r = cli(["render", "--out", run, "--level", level, ...extra]);
  expect(r.status, r.stderr).toBe(0);
  return run;
}

const planPath = (run: string) => join(run, "BUILD-PLAN.json");
const readPlan = (run: string) => JSON.parse(readFileSync(planPath(run), "utf8")) as BuildPlanDoc;
const writePlan = (run: string, p: BuildPlanDoc) => writeFileSync(planPath(run), JSON.stringify(p, null, 2) + "\n");
const noStackTrace = (s: string) => expect(s).not.toMatch(/\n\s+at\s/); // no raw Node stack frames

describe("e2e: CLI basics", () => {
  it("--version prints the package version, --help and no-args exit 0", () => {
    const v = cli(["--version"]);
    expect(v.status).toBe(0);
    expect(v.stdout.trim()).toBe(VERSION);

    const h = cli(["--help"]);
    expect(h.status).toBe(0);
    expect(h.stdout).toContain("construct v");

    expect(cli([]).status).toBe(0); // no args → help, not an error
  });
});

describe("e2e: render lifecycle", () => {
  it("renders the SRD tree + BUILD-PLAN (T-000 + one task per FR)", () => {
    // --no-design isolates the pure FR→task DAG (the design system would append
    // an extra FR-less foundation task — covered separately below).
    const run = rendered("complex", ["--no-design"]);
    for (const f of ["SRD.json", "requirements/FUNCTIONAL.md", "requirements/NON-FUNCTIONAL.md", "BUILD-PLAN.json", "TRACEABILITY.md"]) {
      expect(existsSync(join(run, f)), `${f} should exist`).toBe(true);
    }
    const plan = readPlan(run);
    expect(plan.tasks[0]!.id).toBe("T-000");
    expect(plan.tasks).toHaveLength(6); // T-000 + FR-001..FR-005
    expect(plan.tasks.slice(1).every((t) => t.frIds.length === 1)).toBe(true);
  });

  it("complex carries more NFRs than light, and --merge emits a single SRD.md", () => {
    const light = JSON.parse(readFileSync(join(rendered("light"), "SRD.json"), "utf8")) as { nonFunctional: unknown[] };
    const complex = JSON.parse(readFileSync(join(rendered("complex"), "SRD.json"), "utf8")) as { nonFunctional: unknown[] };
    expect(complex.nonFunctional.length).toBeGreaterThan(light.nonFunctional.length);

    const run = seeded();
    expect(existsSync(join(run, "SRD.md"))).toBe(false);
    expect(cli(["render", "--out", run, "--level", "complex", "--merge"]).status).toBe(0);
    expect(existsSync(join(run, "SRD.md"))).toBe(true);
  });
});

describe("e2e: modules mode (per-module PRDs)", () => {
  // A seeded run whose brief declares modules — render must emit prd/<id>/PRD.md
  // per module and the whole lifecycle (render → check) must pass the gate.
  function seededModules(): string {
    const run = join(tmp(), "run");
    mkdirSync(join(run, "evidence"), { recursive: true });
    cpSync(join(FIX, "sample-brief-modules.json"), join(run, "brief.json"));
    cpSync(join(FIX, "sample-evidence.json"), join(run, "evidence", "evidence.json"));
    return run;
  }

  it("render emits one PRD per module + index, FUNCTIONAL.md as index, tagged BUILD-PLAN, and check passes", () => {
    const run = seededModules();
    const r = cli(["render", "--out", run, "--level", "complex"]);
    expect(r.status, r.stderr).toBe(0);

    const srd = JSON.parse(readFileSync(join(run, "SRD.json"), "utf8")) as SRD;
    expect(srd.modules!.length).toBe(3);
    for (const m of srd.modules!) {
      expect(existsSync(join(run, "prd", m.id, "PRD.md")), m.id).toBe(true);
    }
    expect(existsSync(join(run, "prd", "README.md"))).toBe(true);

    // FUNCTIONAL.md is the index; the full blocks live in the module PRDs.
    const fn = readFileSync(join(run, "requirements/FUNCTIONAL.md"), "utf8");
    expect(fn).toContain("../prd/capture/PRD.md");
    expect(fn).not.toContain("**Acceptance criteria:**");
    const capture = readFileSync(join(run, "prd/capture/PRD.md"), "utf8");
    expect(capture).toContain("**Acceptance criteria:**");

    // Every FR task in the plan carries its module.
    const plan = readPlan(run);
    const frTasks = plan.tasks.filter((t) => t.frIds.length);
    expect(frTasks.length).toBeGreaterThan(0);
    for (const t of frTasks) expect(t.module, t.id).toBeTruthy();

    // The hard gate passes end to end.
    const c = cli(["check", "--out", run]);
    expect(c.status, c.stdout + c.stderr).toBe(0);
  });

  it("check fails (exit 1) when a module PRD is deleted", () => {
    const run = seededModules();
    expect(cli(["render", "--out", run, "--level", "complex"]).status).toBe(0);
    rmSync(join(run, "prd", "search"), { recursive: true, force: true });
    const c = cli(["check", "--out", run]);
    expect(c.status).toBe(1);
    expect(c.stdout + c.stderr).toMatch(/prd\/search\/PRD\.md/);
  });
});

describe("e2e: design system", () => {
  it("renders the design/ subtree at complex, gates it, and --no-design opts out", () => {
    const run = rendered("complex");
    const designFiles = [
      "design/PRINCIPLES.md",
      "design/DESIGN-TOKENS.md",
      "design/design-tokens.json",
      "design/COMPONENTS.md",
      "design/SCREENS.md",
      "design/ACCESSIBILITY.md",
    ];
    for (const f of designFiles) expect(existsSync(join(run, f)), `${f} should exist`).toBe(true);
    // the token twin is valid JSON covering every category
    const tokens = JSON.parse(readFileSync(join(run, "design/design-tokens.json"), "utf8")) as Record<string, unknown>;
    for (const c of ["color", "typography", "spacing", "radius", "elevation", "motion"]) expect(tokens[c], c).toBeTruthy();
    // the SRD manifest carries the design block, and check passes structurally
    const srd = JSON.parse(readFileSync(join(run, "SRD.json"), "utf8")) as SRD;
    expect(srd.design?.components.length).toBeGreaterThan(0);
    expect(srd.design?.accessibility.standard).toBe("WCAG 2.2 AA");
    expect(cli(["check", "--out", run]).status).toBe(0);
    // BUILD-PLAN gained the design-foundation task
    expect(readPlan(run).tasks.some((t) => /design foundation/i.test(t.title))).toBe(true);

    // --no-design opts out entirely
    const bare = rendered("complex", ["--no-design"]);
    expect(existsSync(join(bare, "design"))).toBe(false);
    expect((JSON.parse(readFileSync(join(bare, "SRD.json"), "utf8")) as SRD).design).toBeUndefined();
    expect(readPlan(bare).tasks.some((t) => /design foundation/i.test(t.title))).toBe(false);

    // light never renders it
    expect(existsSync(join(rendered("light"), "design"))).toBe(false);
  });
});

describe("e2e: status --json ready frontier", () => {
  it("returns null when there is no plan, and stays valid JSON on a corrupt plan", () => {
    const empty = join(tmp(), "empty");
    mkdirSync(empty, { recursive: true });
    const r = cli(["status", "--out", empty, "--json"]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toBeNull();

    const run = rendered();
    writeFileSync(planPath(run), "{bad json][");
    const bad = cli(["status", "--out", run, "--json"]);
    expect(bad.status).toBe(0);
    expect(JSON.parse(bad.stdout)).toBeNull(); // loadPlan rejects malformed → null, no crash
  });

  it("gates the frontier on T-000, then opens same-milestone tasks in parallel", () => {
    const run = rendered("complex", ["--no-design"]); // isolate the FR→task DAG
    let f = JSON.parse(cli(["status", "--out", run, "--json"]).stdout);
    expect(f.frontier).toEqual(["T-000"]);
    expect(f.done).toBe(0);
    expect(f.total).toBe(6);
    // every task entry carries the documented shape
    for (const t of f.tasks) {
      expect(Object.keys(t).sort()).toEqual(["dependsOn", "id", "milestone", "ready", "status"]);
      expect(typeof t.ready).toBe("boolean");
    }
    expect(f.blocked.find((b: { id: string }) => b.id === "T-001").waitingOn).toContain("T-000");

    // Mark T-000 done → must-have FR tasks become buildable in parallel; should/
    // could FRs with an entity edge to a must-have stay blocked.
    const plan = readPlan(run);
    plan.tasks.find((t) => t.id === "T-000")!.status = "done";
    writePlan(run, plan);
    f = JSON.parse(cli(["status", "--out", run, "--json"]).stdout);
    expect(f.done).toBe(1);
    expect(f.frontier).toContain("T-001");
    expect(f.frontier).toContain("T-002");
    expect(f.frontier).not.toContain("T-003"); // entity edge to T-001
    expect(f.blocked.find((b: { id: string }) => b.id === "T-003").waitingOn).toEqual(["T-001"]);
  });

  it("empties the frontier when all tasks are done", () => {
    const run = rendered();
    const plan = readPlan(run);
    for (const t of plan.tasks) t.status = "done";
    writePlan(run, plan);
    const f = JSON.parse(cli(["status", "--out", run, "--json"]).stdout);
    expect(f.frontier).toEqual([]);
    expect(f.blocked).toEqual([]);
    expect(f.done).toBe(f.total);
  });
});

describe("e2e: check (structural + json)", () => {
  it("passes structurally on a freshly rendered SRD and emits valid --json", () => {
    const run = rendered();
    const plain = cli(["check", "--out", run]);
    expect(plain.status).toBe(0);
    expect(plain.stdout).toContain("structurally complete");

    const j = cli(["check", "--out", run, "--json"]);
    expect(j.status).toBe(0);
    const parsed = JSON.parse(j.stdout) as { ok: boolean; structural: { ok: boolean }; coverage: object };
    expect(parsed.ok).toBe(true);
    expect(parsed.structural.ok).toBe(true);
    expect(parsed.coverage).toBeTruthy();
  });

  it("fails (exit 1) on an unrendered run, with a clean message", () => {
    const run = seeded();
    const r = cli(["check", "--out", run]);
    expect(r.status).toBe(1);
    noStackTrace(r.stdout + r.stderr);
  });
});

describe("e2e: claim-support gate (review → apply → check --semantic)", () => {
  // Build a verdicts file by reading the worklist and assigning a verdict per pair.
  function verdictsFor(run: string, verdict: (claimId: string, evidenceId: string, i: number) => string, shape: "array" | "object" = "array"): string {
    const todo = JSON.parse(readFileSync(join(run, "VERIFY.todo.json"), "utf8")) as { pairs: { claimId: string; evidenceId: string }[] };
    const pairs = todo.pairs.map((p, i) => ({ ...p, verdict: verdict(p.claimId, p.evidenceId, i), note: "" }));
    const out = join(run, "verdicts.json");
    writeFileSync(out, JSON.stringify(shape === "array" ? pairs : { pairs }));
    return out;
  }

  it("writes a worklist, then passes when every pair is supported", () => {
    const run = rendered();
    const rev = cli(["review", "--out", run]);
    expect(rev.status).toBe(0);
    expect(existsSync(join(run, "VERIFY.todo.json"))).toBe(true);
    expect(existsSync(join(run, "VERIFY.md"))).toBe(true);
    const todo = JSON.parse(readFileSync(join(run, "VERIFY.todo.json"), "utf8")) as { pairs: { claimId: string; evidenceId: string; verdict: null }[] };
    expect(todo.pairs.length).toBeGreaterThan(0);
    expect(todo.pairs[0]!.claimId).toBeTruthy();
    expect(todo.pairs[0]!.evidenceId).toBeTruthy();

    const apply = cli(["review", "--out", run, "--apply", verdictsFor(run, () => "supported")]);
    expect(apply.status).toBe(0);
    const gate = cli(["check", "--out", run, "--semantic"]);
    expect(gate.status).toBe(0);
    expect(gate.stdout).toContain("PASS");
  });

  it("fails the gate (exit 1) when a cited claim is refuted", () => {
    const run = rendered();
    cli(["review", "--out", run]);
    cli(["review", "--out", run, "--apply", verdictsFor(run, (_c, _e, i) => (i === 0 ? "refuted" : "supported"))]);
    const gate = cli(["check", "--out", run, "--semantic"]);
    expect(gate.status).toBe(1);
    expect(gate.stdout).toContain("FAIL");
  });

  it("accepts both a bare array and a { pairs: [...] } verdicts file", () => {
    for (const shape of ["array", "object"] as const) {
      const run = rendered();
      cli(["review", "--out", run]);
      const apply = cli(["review", "--out", run, "--apply", verdictsFor(run, () => "supported", shape)]);
      expect(apply.status, `shape=${shape}`).toBe(0);
    }
  });

  it("caps the worklist with --max-review", () => {
    const run = rendered();
    cli(["review", "--out", run, "--max-review", "2"]);
    const todo = JSON.parse(readFileSync(join(run, "VERIFY.todo.json"), "utf8")) as { pairs: unknown[] };
    expect(todo.pairs).toHaveLength(2);
  });

  it("fails closed (exit 1) when --semantic has no VERIFY.json", () => {
    const run = rendered();
    const gate = cli(["check", "--out", run, "--semantic"]);
    expect(gate.status).toBe(1);
    expect(gate.stdout.toLowerCase()).toContain("verify.json");
    expect(gate.stdout).toContain("--allow-unverified");
  });

  it("--allow-unverified restores the advisory skip (exit 0) when VERIFY.json is missing", () => {
    const run = rendered();
    const gate = cli(["check", "--out", run, "--semantic", "--allow-unverified"]);
    expect(gate.status).toBe(0);
    expect(gate.stdout.toLowerCase()).toContain("no verify.json");
  });

  it("recomputes the semantic verdict — a hand-tampered ok:true with a refuted verdict still fails", () => {
    const run = rendered();
    cli(["review", "--out", run]);
    cli(["review", "--out", run, "--apply", verdictsFor(run, () => "supported")]);
    const p = join(run, "VERIFY.json");
    const sem = JSON.parse(readFileSync(p, "utf8"));
    sem.verdicts[0].verdict = "refuted"; // doctored output, stale green summary
    writeFileSync(p, JSON.stringify(sem, null, 2));
    const gate = cli(["check", "--out", run, "--semantic"]);
    expect(gate.status).toBe(1);
    expect(gate.stdout).toContain("FAIL");
  });

  // --- Regression guards for the hardening fixes (were: leaked ENOENT / silent vacuous pass) ---

  it("review on a missing SRD gives a clean domain error, not a raw fs error", () => {
    const run = seeded(); // not rendered → no SRD.json
    const r = cli(["review", "--out", run]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("No SRD.json");
    expect(r.stderr).not.toContain("ENOENT");
    noStackTrace(r.stderr);
  });

  it("review --apply on a missing verdicts file gives a clean message", () => {
    const run = rendered();
    cli(["review", "--out", run]);
    const r = cli(["review", "--out", run, "--apply", join(run, "nope.json")]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("verdicts file not found");
    expect(r.stderr).not.toContain("ENOENT");
  });

  it("review --apply rejects a valid-JSON-but-wrong-shape verdicts file instead of a vacuous pass", () => {
    const run = rendered();
    cli(["review", "--out", run]);
    for (const body of ["42", '{"foo":"bar"}']) {
      const f = join(run, "wrong.json");
      writeFileSync(f, body);
      const r = cli(["review", "--out", run, "--apply", f]);
      expect(r.status, `body=${body}`).toBe(1);
      expect(r.stderr).toContain("must be a JSON array");
      // and it must NOT have written a vacuous VERIFY.json
      expect(existsSync(join(run, "VERIFY.json"))).toBe(false);
    }
  });

  it("flags omitted pairs as unadjudicated rather than silently passing", () => {
    const run = rendered();
    cli(["review", "--out", run]);
    const todo = JSON.parse(readFileSync(join(run, "VERIFY.todo.json"), "utf8")) as { pairs: { claimId: string; evidenceId: string }[] };
    expect(todo.pairs.length).toBeGreaterThan(1); // there are pairs to drop
    // Submit ONLY the first pair, dropping all the rest.
    const only = [{ ...todo.pairs[0], verdict: "supported", note: "" }];
    const f = join(run, "partial.json");
    writeFileSync(f, JSON.stringify(only));
    const apply = cli(["review", "--out", run, "--apply", f]);
    expect(apply.stdout).toContain("not fully adjudicated");
    const verify = JSON.parse(readFileSync(join(run, "VERIFY.json"), "utf8")) as { unadjudicated: string[] };
    expect(verify.unadjudicated.length).toBeGreaterThan(0);
    const gate = cli(["check", "--out", run, "--semantic"]);
    expect(gate.stdout).toContain("not fully adjudicated"); // surfaced, not silent
  });
});

describe("e2e: verify referee", () => {
  it("passes a wired done task and flags a built must-have with no test under --strict", () => {
    const run = rendered();
    const app = join(run, "app");
    mkdirSync(join(app, "src"), { recursive: true });
    mkdirSync(join(app, "tests"), { recursive: true });
    writeFileSync(join(app, "src", "save.js"), "module.exports = {};\n");
    writeFileSync(join(app, "tests", "save.test.js"), 'describe("FR-001 save an article", () => { it("works", () => {}); });\n');

    const plan = readPlan(run);
    plan.conventions.appDir = app;
    plan.conventions.testCommand = 'node -e "process.exit(0)"';
    const t1 = plan.tasks.find((t) => t.frIds.includes("FR-001"))!;
    t1.status = "done";
    t1.artifacts = ["src/save.js"];
    t1.tests = ["tests/save.test.js"];
    writePlan(run, plan);

    expect(cli(["verify", "--out", run]).status).toBe(0);

    // Mark a second must-have done with NO referencing test → --strict fails.
    const plan2 = readPlan(run);
    const t2 = plan2.tasks.find((t) => t.frIds.includes("FR-002"))!;
    t2.status = "done";
    t2.artifacts = [];
    t2.tests = [];
    writePlan(run, plan2);
    const strict = cli(["verify", "--out", run, "--strict"]);
    expect(strict.status).toBe(1);
    expect(strict.stdout).toMatch(/FR-002[\s\S]*no test/);
    noStackTrace(strict.stdout + strict.stderr);
  });

  it("fails cleanly with no BUILD-PLAN.json", () => {
    const run = seeded();
    const r = cli(["verify", "--out", run]);
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toContain("No BUILD-PLAN.json");
  });
});

describe("e2e: full suite completeness (a real render produces the whole tree, internally complete)", () => {
  it("emits every document in the SRD tree", () => {
    const run = rendered("complex");
    const expected = [
      "00-overview/VISION.md",
      "00-overview/SCOPE.md",
      "requirements/FUNCTIONAL.md",
      "requirements/NON-FUNCTIONAL.md",
      "architecture/SYSTEM-CONTEXT.md",
      "architecture/DATA-MODEL.md",
      "architecture/INTERFACES.md",
      "competitive/LANDSCAPE.md",
      "BUILD-PLAN.md",
      "BUILD-PLAN.json",
      "TRACEABILITY.md",
      "SRD.json",
    ];
    for (const f of expected) expect(existsSync(join(run, f)), `${f} should exist`).toBe(true);
    // complex carries ≥2 ADRs, each its own decision file
    const adrDir = join(run, "architecture", "decisions");
    expect(existsSync(adrDir)).toBe(true);
    expect(readdirSync(adrDir).filter((f) => f.endsWith(".md")).length).toBeGreaterThanOrEqual(2);
  });

  it("covers every brief feature with a complete FR (Given/When/Then + a must-have failure path)", () => {
    const run = rendered("complex");
    const brief = JSON.parse(readFileSync(join(run, "brief.json"), "utf8")) as { featureWishlist: unknown[] };
    const srd = JSON.parse(readFileSync(join(run, "SRD.json"), "utf8")) as SRD;
    expect(srd.functional.length).toBe(brief.featureWishlist.length); // one FR per feature
    for (const fr of srd.functional) {
      expect(fr.acceptance.length, `${fr.id} has no acceptance criteria`).toBeGreaterThan(0);
      for (const a of fr.acceptance) expect(Boolean(a.given && a.when && a.then), `${fr.id} has a non-GWT criterion`).toBe(true);
    }
    for (const fr of srd.functional.filter((f) => f.priority === "must")) {
      expect(fr.acceptance.length, `${fr.id} (must) lacks a failure path`).toBeGreaterThanOrEqual(2);
    }
    const md = readFileSync(join(run, "requirements", "FUNCTIONAL.md"), "utf8");
    for (const marker of ["**Given**", "**When**", "**Then**"]) expect(md).toContain(marker);
  });

  it("includes every required NFR category for the complex level", () => {
    const srd = JSON.parse(readFileSync(join(rendered("complex"), "SRD.json"), "utf8")) as SRD;
    const cats = new Set(srd.nonFunctional.map((n) => n.category.toLowerCase()));
    for (const required of REQUIRED_NFR.complex) expect(cats.has(required), `missing NFR category: ${required}`).toBe(true);
  });

  it("has well-formed ADRs, a data model, interfaces, and a build plan/traceability covering every FR", () => {
    const run = rendered("complex");
    const srd = JSON.parse(readFileSync(join(run, "SRD.json"), "utf8")) as SRD;
    expect(srd.architecture.adrs.length).toBeGreaterThanOrEqual(2);
    for (const a of srd.architecture.adrs) {
      expect(a.context.trim(), "ADR context").toBeTruthy();
      expect(a.decision.trim(), "ADR decision").toBeTruthy();
      expect(a.consequences.trim(), "ADR consequences").toBeTruthy();
      expect(["proposed", "accepted"]).toContain(a.status);
    }
    expect(srd.architecture.dataModel.length).toBeGreaterThanOrEqual(1);
    expect(srd.architecture.interfaces.length).toBeGreaterThanOrEqual(1);
    // every FR has a build task AND appears in a milestone AND has a traceability row
    const taskFrs = new Set(readPlan(run).tasks.flatMap((t) => t.frIds));
    const milestoneFrs = new Set(srd.buildPlan.flatMap((m) => m.frIds));
    for (const fr of srd.functional) {
      expect(taskFrs.has(fr.id), `${fr.id} has no build task`).toBe(true);
      expect(milestoneFrs.has(fr.id), `${fr.id} not in any milestone`).toBe(true);
    }
    expect(srd.traceability.length).toBeGreaterThanOrEqual(srd.functional.length);
  });

  it("passes the hard structural gate end to end", () => {
    expect(cli(["check", "--out", rendered("complex")]).status).toBe(0);
  });

  it("refuses to render a hollow suite from an under-specified brief (won't fake completeness)", () => {
    const run = join(tmp(), "skeleton");
    expect(cli(["init", "--idea", "a read-it-later app", "--out", run]).status).toBe(0);
    // a bare `init` brief has captured no problem/goals/features yet
    const r = cli(["render", "--out", run, "--level", "complex"]);
    expect(r.status).toBe(1);
    expect((r.stderr + r.stdout).toLowerCase()).toContain("incomplete");
    expect(existsSync(join(run, "SRD.json"))).toBe(false); // no hollow SRD written
  });
});

describe("e2e: analyze (informational gap signal, never gates)", () => {
  it("reports gaps as text and as valid JSON, always exit 0", () => {
    const run = seeded(); // brief + evidence is all analyze needs (no render)
    const text = cli(["analyze", "--out", run]);
    expect(text.status).toBe(0);
    expect(text.stdout).toContain("construct analyze:");
    expect(text.stdout).toMatch(/Gaps \(each will render ungrounded as-is\):/);

    const j = cli(["analyze", "--out", run, "--json"]);
    expect(j.status).toBe(0);
    const parsed = JSON.parse(j.stdout) as { evidenceCount: number; suggestions: string[]; bySource: object };
    expect(typeof parsed.evidenceCount).toBe("number");
    expect(Array.isArray(parsed.suggestions)).toBe(true);
    expect(parsed.bySource).toBeTruthy();
  });
});

describe("e2e: semantic stack control", () => {
  it("rejects an unknown action cleanly (exit 1, no docker needed, no stack trace)", () => {
    const r = cli(["semantic", "bogus"]);
    expect(r.status).toBe(1);
    expect((r.stdout + r.stderr).toLowerCase()).toContain("unknown action");
    noStackTrace(r.stdout + r.stderr);
  });
});

describe("e2e: error handling never leaks a stack trace", () => {
  const cases: { args: string[]; needle: string }[] = [
    { args: ["frobnicate"], needle: "unknown command" },
    { args: ["render", "--out", "x", "--bogusflag"], needle: "unknown flag" },
    { args: ["render"], needle: "missing --out" },
    { args: ["research", "--semantic=yes"], needle: "boolean flag" },
    { args: ["check", "--out", "x", "--min-grounding", "999"], needle: "min-grounding" },
    { args: ["check", "--out", "x", "--min-grounding="], needle: "min-grounding" }, // empty must not silently become a 0% no-op gate
  ];
  it.each(cases)("$args → clean `construct:` error, exit 1, no stack trace", ({ args, needle }) => {
    const r = cli(args);
    expect(r.status).toBe(1);
    expect((r.stderr + r.stdout).toLowerCase()).toContain(needle.toLowerCase());
    noStackTrace(r.stderr + r.stdout);
  });
});
