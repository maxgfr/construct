import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";
import { loadBrief } from "../src/brief.js";
import { BATCH_SIZE, PHASES, SMALL_WORKLIST, listPhases, orchestrateRun } from "../src/orchestrate.js";
import { toBatches } from "../src/orchestrate-templates.js";
import { loadPlan, readyFrontier, writePlan } from "../src/plan.js";
import { renderSRD } from "../src/render.js";
import { runReview } from "../src/review.js";
import type { EvidenceItem } from "../src/types.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIX = join(ROOT, "tests", "fixtures");
const BIN = join(ROOT, "scripts", "construct.mjs");
// The unit-level engine path is a fixed constant so emitted artifacts are
// assertable; the CLI resolves the real one via realpathSync(import.meta.url).
const ENGINE = "/opt/skills/construct/scripts/construct.mjs";
// Deterministic render timestamp: emission must be byte-stable across runs.
const GENERATED_AT = "2026-07-09T00:00:00.000Z";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

/**
 * A run dir built through the REAL engine writers (the same fixtures + code
 * paths the pipeline uses): fixtures seed brief+evidence, renderSRD writes
 * SRD.json + BUILD-PLAN.json, runReview writes VERIFY.todo.json.
 */
function makeRun(opts: { seed?: boolean; render?: boolean; review?: boolean; frontier?: boolean } = {}): string {
  const run = mkdtempSync(join(tmpdir(), "construct-orch-"));
  dirs.push(run);
  if (!(opts.seed || opts.render || opts.review || opts.frontier)) return run;
  mkdirSync(join(run, "evidence"), { recursive: true });
  cpSync(join(FIX, "sample-brief.json"), join(run, "brief.json"));
  cpSync(join(FIX, "sample-evidence.json"), join(run, "evidence", "evidence.json"));
  if (opts.render || opts.review || opts.frontier) {
    const evidence = JSON.parse(readFileSync(join(run, "evidence", "evidence.json"), "utf8")) as EvidenceItem[];
    renderSRD(loadBrief(run), evidence, { level: "complex", out: run, merge: false, generatedAt: GENERATED_AT });
  }
  if (opts.review) runReview(run);
  if (opts.frontier) {
    // T-000 done → the first real frontier (the M1 tasks + design foundation).
    const plan = loadPlan(run)!;
    plan.tasks[0]!.status = "done";
    writePlan(run, plan);
  }
  return run;
}

const wf = (run: string, phase: string) => join(run, "orchestration", `${phase}.workflow.mjs`);
const readWf = (run: string, phase: string) => readFileSync(wf(run, phase), "utf8");
const stable = (src: string, run: string) => src.replaceAll(run, "<RUN>").replaceAll(ENGINE, "<ENGINE>");
const batchesOf = (src: string): string[][] => {
  const m = src.match(/const BATCHES = (\[.*?\])\n/s);
  expect(m, "const BATCHES missing").not.toBeNull();
  return JSON.parse(m![1]!) as string[][];
};

describe("orchestrate — listPhases", () => {
  it("reports all four phases not ready on an empty run, naming the producing command", () => {
    const run = makeRun();
    const phases = listPhases(run, ENGINE);
    expect(phases.map((p) => p.name)).toEqual(["research", "claim-review", "adr-judges", "build"]);
    for (const p of phases) {
      expect(p.ready).toBe(false);
      expect(p.items).toBe(0);
      expect(isAbsolute(p.worklist)).toBe(true);
      expect(p.prerequisite).toContain(`node ${ENGINE}`);
    }
    expect(phases[0]!.prerequisite).toContain("research --out");
    expect(phases[1]!.prerequisite).toContain("review --out");
    expect(phases[2]!.prerequisite).toContain("render --out");
    expect(phases[3]!.prerequisite).toContain("render --out");
  });

  it("reports ready phases with real item counts and absolute worklist paths", () => {
    const run = makeRun({ review: true, frontier: true });
    const phases = listPhases(run, ENGINE);
    // The fixtures leave 6 analyze gaps, 6 claim↔evidence pairs, 3 ADRs.
    expect(phases[0]).toMatchObject({ name: "research", ready: true, items: 6 });
    expect(phases[1]).toMatchObject({ name: "claim-review", ready: true, items: 6 });
    expect(phases[2]).toMatchObject({ name: "adr-judges", ready: true, items: 3 });
    expect(phases[2]!.ids).toEqual(["0001", "0002", "0003"]);
    const frontier = readyFrontier(loadPlan(run)!).frontier;
    expect(frontier.length).toBeGreaterThan(1);
    expect(phases[3]).toMatchObject({ name: "build", ready: true, items: frontier.length });
    expect(phases[3]!.ids).toEqual(frontier);
    for (const p of phases) expect(isAbsolute(p.worklist)).toBe(true);
  });

  it("research units carry the gap AND its drill command rewritten to the absolute engine", () => {
    const run = makeRun({ seed: true });
    const research = listPhases(run, ENGINE)[0]!;
    expect(research.ready).toBe(true);
    expect(research.items).toBe(6);
    const tech = research.ids.find((g) => g.includes("PostgreSQL"));
    expect(tech).toBeDefined();
    expect(tech).toContain('tech: "PostgreSQL" has no docs/StackOverflow grounding');
    expect(tech).toContain(`node ${ENGINE} tech --out ${run}`);
  });
});

describe("orchestrate — emitted workflow", () => {
  it("emits one workflow per ready fan-out phase, plus all contracts and the runbook", () => {
    const run = makeRun({ review: true, frontier: true });
    const res = orchestrateRun(run, ENGINE);
    expect(res.exitCode).toBe(0);
    for (const phase of ["research", "claim-review", "build"]) expect(existsSync(wf(run, phase)), phase).toBe(true);
    // The judge panel is opt-in (one contested ADR at a time): default emission
    // skips it with a notice naming the flag.
    expect(existsSync(wf(run, "adr-judges"))).toBe(false);
    expect(res.notices.some((n) => n.includes("adr-judges") && n.includes("--adr"))).toBe(true);
    expect(existsSync(join(run, "orchestration", "RUNBOOK.md"))).toBe(true);
    for (const role of ["researcher", "claim-reviewer", "adr-judge", "builder"]) {
      expect(existsSync(join(run, "orchestration", "agents", `${role}.md`)), role).toBe(true);
    }
  });

  it("parses as JavaScript the way the Workflow harness evaluates it (meta export + async body)", () => {
    const run = makeRun({ review: true, frontier: true });
    orchestrateRun(run, ENGINE);
    orchestrateRun(run, ENGINE, { phase: "adr-judges", adr: "0003" });
    for (const phase of ["research", "claim-review", "build", "adr-judges"]) {
      const [metaLine, ...body] = readWf(run, phase).split("\n");
      expect(() => new Script(metaLine!.replace("export const meta =", "const meta ="))).not.toThrow();
      expect(() => new Script(`(async () => {\n${body.join("\n")}\n})`)).not.toThrow();
    }
  });

  it("meta is a pure JSON literal on line 1 (name, description, phases)", () => {
    const run = makeRun({ review: true });
    orchestrateRun(run, ENGINE, { phase: "claim-review" });
    const first = readWf(run, "claim-review").split("\n")[0]!;
    expect(first.startsWith("export const meta = ")).toBe(true);
    const meta = JSON.parse(first.replace("export const meta = ", "")) as { name: string; description: string; phases: unknown[] };
    expect(meta.name).toBe("construct-claim-review");
    expect(meta.description.length).toBeGreaterThan(0);
    expect(Array.isArray(meta.phases)).toBe(true);
  });

  it("never contains Date.now / Math.random / new Date (forbidden under the Workflow tool)", () => {
    const run = makeRun({ review: true, frontier: true });
    orchestrateRun(run, ENGINE);
    orchestrateRun(run, ENGINE, { phase: "adr-judges", adr: "0003" });
    for (const phase of ["research", "claim-review", "build", "adr-judges"]) {
      const src = readWf(run, phase);
      expect(src).not.toContain("Date.now(");
      expect(src).not.toContain("Math.random(");
      expect(src).not.toContain("new Date(");
    }
  });

  it("injects absolute RUN/ENGINE/WORKLIST constants matching the run", () => {
    const run = makeRun({ review: true });
    orchestrateRun(run, ENGINE);
    const src = readWf(run, "claim-review");
    for (const name of ["RUN", "ENGINE", "WORKLIST"]) {
      const m = src.match(new RegExp(`const ${name} = "([^"]+)"`));
      expect(m, `const ${name} missing`).not.toBeNull();
      expect(isAbsolute(m![1]!)).toBe(true);
    }
    expect(src).toContain(JSON.stringify(join(run, "VERIFY.todo.json")));
    expect(src).toContain(JSON.stringify(ENGINE));
  });

  it("injects the REAL current worklist ids — a doctored worklist shows up on re-emit", () => {
    const run = makeRun({ review: true });
    orchestrateRun(run, ENGINE);
    expect(readWf(run, "claim-review")).not.toContain("FR-999::E9");
    const todoPath = join(run, "VERIFY.todo.json");
    const todo = JSON.parse(readFileSync(todoPath, "utf8")) as { pairs: Record<string, unknown>[] };
    todo.pairs.push({ ...todo.pairs[0]!, claimId: "FR-999", evidenceId: "E9" });
    writeFileSync(todoPath, JSON.stringify(todo, null, 2));
    orchestrateRun(run, ENGINE);
    expect(readWf(run, "claim-review")).toContain("FR-999::E9");
  });

  it("is deterministic — two runs over the same state emit byte-identical artifacts", () => {
    const run = makeRun({ review: true, frontier: true });
    const emit = () => {
      orchestrateRun(run, ENGINE);
      orchestrateRun(run, ENGINE, { phase: "adr-judges", adr: "0003" });
      return (
        ["research", "claim-review", "build", "adr-judges"].map((p) => readWf(run, p)).join("\0") +
        readFileSync(join(run, "orchestration", "RUNBOOK.md"), "utf8") +
        readdirSync(join(run, "orchestration", "agents"))
          .map((f) => readFileSync(join(run, "orchestration", "agents", f), "utf8"))
          .join("\0")
      );
    };
    expect(emit()).toBe(emit());
  });

  it("batches large worklists 8-per-agent and dispatches one agent per batch", () => {
    const run = makeRun({ review: true });
    // Grow the engine-written worklist to 20 pairs (a big SRD), then re-emit.
    const todoPath = join(run, "VERIFY.todo.json");
    const todo = JSON.parse(readFileSync(todoPath, "utf8")) as { pairs: Record<string, unknown>[] };
    while (todo.pairs.length < 20) todo.pairs.push({ ...todo.pairs[0]!, claimId: `FR-${100 + todo.pairs.length}` });
    writeFileSync(todoPath, JSON.stringify(todo, null, 2));
    orchestrateRun(run, ENGINE, { phase: "claim-review" });
    const src = readWf(run, "claim-review");
    const batches = batchesOf(src);
    expect(batches.length).toBe(Math.ceil(20 / BATCH_SIZE));
    expect(batches.flat().length).toBe(20);
    expect(src).toContain("pipeline(BATCHES");
    expect(src).toContain("agentType: 'general-purpose'");
    expect(src).toContain("schema: SCHEMA");
    // The chunker itself is order-preserving and exact.
    expect(toBatches(["a", "b", "c"], 2)).toEqual([["a", "b"], ["c"]]);
  });

  it("build fans out ONE builder per frontier task, each in its own git worktree", () => {
    const run = makeRun({ review: true, frontier: true });
    orchestrateRun(run, ENGINE, { phase: "build" });
    const src = readWf(run, "build");
    const frontier = readyFrontier(loadPlan(run)!).frontier;
    const batches = batchesOf(src);
    expect(batches.length).toBe(frontier.length); // batch size 1: one agent per task
    expect(batches.flat()).toEqual(frontier);
    expect(src).toContain("isolation: 'worktree'");
    // Only builders get a worktree — the read-only fan-outs must not.
    orchestrateRun(run, ENGINE);
    for (const phase of ["research", "claim-review"]) expect(readWf(run, phase)).not.toContain("isolation:");
  });

  it("adr-judges emits exactly the 3 lens agents with the ADR + cited evidence pasted in", () => {
    const run = makeRun({ render: true });
    const res = orchestrateRun(run, ENGINE, { phase: "adr-judges", adr: "0003" });
    expect(res.exitCode).toBe(0);
    const src = readWf(run, "adr-judges");
    const batches = batchesOf(src);
    expect(batches).toEqual([["feasibility"], ["operations-cost"], ["user-value"]]);
    expect(src).toContain("const ADR = ");
    expect(src).toContain("const EVIDENCE = ");
    expect(src).toContain('"0003"');
    expect(src).not.toContain("isolation:");
  });

  it("small worklist (≤ SMALL_WORKLIST) → single batch + an eco notice", () => {
    const run = makeRun({ render: true }); // frontier is [T-000] only → 1 build unit
    const res = orchestrateRun(run, ENGINE, { phase: "build" });
    expect(batchesOf(readWf(run, "build")).flat()).toEqual(["T-000"]);
    expect(res.notices.some((n) => n.includes("--eco"))).toBe(true);
    expect(SMALL_WORKLIST).toBeLessThan(BATCH_SIZE);
  });

  it("an empty worklist is skipped with a notice, not emitted", () => {
    const run = makeRun({ review: true });
    const plan = loadPlan(run)!;
    for (const t of plan.tasks) t.status = "done";
    writePlan(run, plan);
    const res = orchestrateRun(run, ENGINE);
    expect(res.exitCode).toBe(0);
    expect(existsSync(wf(run, "build"))).toBe(false);
    expect(existsSync(wf(run, "claim-review"))).toBe(true);
    expect(res.notices.some((n) => n.includes("build") && n.includes("empty"))).toBe(true);
  });

  it("every contract('<role>') referenced by a workflow has its agents/<role>.md", () => {
    const run = makeRun({ review: true, frontier: true });
    orchestrateRun(run, ENGINE);
    orchestrateRun(run, ENGINE, { phase: "adr-judges", adr: "0003" });
    const agents = readdirSync(join(run, "orchestration", "agents")).map((f) => f.replace(/\.md$/, ""));
    for (const phase of ["research", "claim-review", "build", "adr-judges"]) {
      const refs = [...readWf(run, phase).matchAll(/contract\('([a-z-]+)'/g)].map((m) => m[1]!);
      expect(refs.length, phase).toBeGreaterThan(0);
      for (const r of refs) expect(agents).toContain(r);
    }
  });

  it("workflows return fragments and never contain a write step (the fold stays with the orchestrator)", () => {
    const run = makeRun({ review: true, frontier: true });
    orchestrateRun(run, ENGINE);
    orchestrateRun(run, ENGINE, { phase: "adr-judges", adr: "0003" });
    for (const phase of ["research", "claim-review", "build", "adr-judges"]) {
      const src = readWf(run, phase);
      expect(src).toMatch(/^return \{/m);
      expect(src).toContain("results: results.filter(Boolean)");
      // Run-folder writes (--apply, research/render re-runs) may appear only in
      // comments — the orchestrator's next step — never as executed code.
      const code = src
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n");
      expect(code).not.toContain("--apply");
      expect(code).not.toMatch(/\b(research|render|review|init) --out/);
    }
  });
});

describe("orchestrate — contracts & runbook", () => {
  it("every emitted contract carries the one-writer footer and returns structured output", () => {
    const run = makeRun({ review: true });
    orchestrateRun(run, ENGINE);
    const dir = join(run, "orchestration", "agents");
    const files = readdirSync(dir);
    expect(files.sort()).toEqual(["adr-judge.md", "builder.md", "claim-reviewer.md", "researcher.md"]);
    for (const f of files) {
      const md = readFileSync(join(dir, f), "utf8");
      expect(md).toContain("Return, don't write");
      expect(md).toContain("The orchestrator is the sole writer");
      expect(md).toContain("orchestration/out/");
      expect(md).toContain("structured output");
    }
  });

  it("contracts encode each pattern's judgment rules", () => {
    const run = makeRun({ review: true });
    orchestrateRun(run, ENGINE);
    const read = (role: string) => readFileSync(join(run, "orchestration", "agents", `${role}.md`), "utf8");
    const researcher = read("researcher");
    expect(researcher).toContain("≤5-line summary");
    expect(researcher).toContain("URLs worth grounding");
    expect(researcher).toContain(loadBrief(run).idea); // the brief one-liner is pasted in
    const reviewer = read("claim-reviewer");
    for (const v of ["supported", "partial", "refuted", "unsupported"]) expect(reviewer).toContain(v);
    expect(reviewer).toMatch(/HARSHER/i);
    expect(reviewer).toContain("claimId::evidenceId");
    const judge = read("adr-judge");
    for (const lens of ["feasibility", "operations-cost", "user-value"]) expect(judge).toContain(lens);
    expect(judge).toMatch(/majority/i);
    const builder = read("builder");
    expect(builder).toContain("worktree");
    expect(builder).toMatch(/FR id/);
    expect(builder).toContain("BUILD-PLAN.json");
  });

  it("sanitizes backticks out of the idea so the contract's inline-code span survives", () => {
    const run = makeRun({ review: true });
    const raw = JSON.parse(readFileSync(join(run, "brief.json"), "utf8"));
    raw.idea = "a `save-for-later` app\nwith `backticks`";
    writeFileSync(join(run, "brief.json"), JSON.stringify(raw));
    orchestrateRun(run, ENGINE);
    const researcher = readFileSync(join(run, "orchestration", "agents", "researcher.md"), "utf8");
    const line = researcher.split("\n").find((l) => l.startsWith("Product one-liner:"));
    // The interpolated idea stays ONE inline-code span: no interior backtick may
    // close it early, and the newline flattens to a space.
    expect(line).toBe("Product one-liner: `a 'save-for-later' app with 'backticks'`");
  });

  it("worklist-driven contracts carry the family stale-id rule", () => {
    const run = makeRun({ review: true, frontier: true });
    orchestrateRun(run, ENGINE);
    const read = (role: string) => readFileSync(join(run, "orchestration", "agents", `${role}.md`), "utf8");
    expect(read("claim-reviewer")).toContain("If a PAIRS key is no longer in the worklist, skip it and say so in your note");
    expect(read("builder")).toContain("If your TASK id is no longer in the worklist, skip it and say so in your summary");
  });

  it("the runbook covers every phase with concrete paths and the phase status", () => {
    const run = makeRun({ review: true, frontier: true });
    orchestrateRun(run, ENGINE);
    const rb = readFileSync(join(run, "orchestration", "RUNBOOK.md"), "utf8");
    expect(rb).toContain(join(run, "VERIFY.todo.json"));
    expect(rb).toContain(join(run, "BUILD-PLAN.json"));
    expect(rb).toContain(ENGINE);
    for (const role of ["researcher.md", "claim-reviewer.md", "adr-judge.md", "builder.md"]) expect(rb).toContain(role);
    for (const name of PHASES) expect(rb).toContain(name);
    expect(rb).toContain("check --out"); // the gate is named
  });

  it("golden shape (paths normalized)", () => {
    const run = makeRun({ review: true, frontier: true });
    orchestrateRun(run, ENGINE);
    orchestrateRun(run, ENGINE, { phase: "adr-judges", adr: "0003" });
    expect(stable(readWf(run, "research"), run)).toMatchSnapshot("research.workflow.mjs");
    expect(stable(readWf(run, "adr-judges"), run)).toMatchSnapshot("adr-judges.workflow.mjs");
    expect(stable(readFileSync(join(run, "orchestration", "agents", "claim-reviewer.md"), "utf8"), run)).toMatchSnapshot("claim-reviewer.md");
    expect(stable(readFileSync(join(run, "orchestration", "RUNBOOK.md"), "utf8"), run)).toMatchSnapshot("RUNBOOK.md");
  });
});

describe("orchestrate — eco mode & phase gating", () => {
  it("--eco emits RUNBOOK + contracts only, no workflow scripts", () => {
    const run = makeRun({ review: true, frontier: true });
    const res = orchestrateRun(run, ENGINE, { eco: true });
    expect(res.exitCode).toBe(0);
    expect(existsSync(join(run, "orchestration", "RUNBOOK.md"))).toBe(true);
    expect(existsSync(join(run, "orchestration", "agents", "claim-reviewer.md"))).toBe(true);
    for (const phase of PHASES) expect(existsSync(wf(run, phase))).toBe(false);
  });

  it("--phase on a not-ready phase exits 2 and names the producing command", () => {
    const run = makeRun({ seed: true }); // no SRD yet
    const res = orchestrateRun(run, ENGINE, { phase: "claim-review" });
    expect(res.exitCode).toBe(2);
    expect(res.errors.some((e) => e.includes("review --out"))).toBe(true);
    expect(existsSync(wf(run, "claim-review"))).toBe(false);
  });

  it("--phase restricts emission to that phase", () => {
    const run = makeRun({ review: true, frontier: true });
    const res = orchestrateRun(run, ENGINE, { phase: "claim-review" });
    expect(res.exitCode).toBe(0);
    expect(existsSync(wf(run, "claim-review"))).toBe(true);
    expect(existsSync(wf(run, "research"))).toBe(false);
    expect(existsSync(wf(run, "build"))).toBe(false);
  });

  it("an unknown phase exits 2 naming the valid ones", () => {
    const run = makeRun({ seed: true });
    const res = orchestrateRun(run, ENGINE, { phase: "nope" });
    expect(res.exitCode).toBe(2);
    expect(res.errors.some((e) => PHASES.every((p) => e.includes(p)))).toBe(true);
  });

  it("adr-judges without --adr exits 2 naming the run's ADR ids", () => {
    const run = makeRun({ render: true });
    const res = orchestrateRun(run, ENGINE, { phase: "adr-judges" });
    expect(res.exitCode).toBe(2);
    expect(res.errors.some((e) => e.includes("--adr") && e.includes("0001") && e.includes("0003"))).toBe(true);
  });

  it("adr-judges with an unknown --adr exits 2 naming the available ids", () => {
    const run = makeRun({ render: true });
    const res = orchestrateRun(run, ENGINE, { phase: "adr-judges", adr: "9999" });
    expect(res.exitCode).toBe(2);
    expect(res.errors.some((e) => e.includes("9999") && e.includes("0001"))).toBe(true);
  });
});

describe("orchestrate — CLI wiring (the shipped bundle)", () => {
  function cli(args: string[]): { status: number; stdout: string; stderr: string } {
    try {
      const stdout = execFileSync(process.execPath, [BIN, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      return { status: 0, stdout, stderr: "" };
    } catch (e) {
      const err = e as { status?: number; stdout?: string | Buffer; stderr?: string | Buffer };
      return { status: err.status ?? 1, stdout: String(err.stdout ?? ""), stderr: String(err.stderr ?? "") };
    }
  }

  it("orchestrate without --out exits 2", () => {
    expect(cli(["orchestrate"]).status).toBe(2);
  });

  it("orchestrate --out <run> --list exits 0 with a {phases:[...]} JSON; a full run emits and exits 0", () => {
    const run = makeRun({ review: true });
    const list = cli(["orchestrate", "--out", run, "--list"]);
    expect(list.status).toBe(0);
    const parsed = JSON.parse(list.stdout) as { phases: { name: string; ready: boolean }[] };
    expect(parsed.phases.map((p) => p.name)).toEqual([...PHASES]);
    const emit = cli(["orchestrate", "--out", run]);
    expect(emit.status, emit.stderr).toBe(0);
    expect(existsSync(wf(run, "claim-review"))).toBe(true);
  });

  it("orchestrate --out <missing dir> exits 2", () => {
    expect(cli(["orchestrate", "--out", join(tmpdir(), "construct-does-not-exist-xyz")]).status).toBe(2);
  });
});
