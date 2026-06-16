import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSRD } from "../src/srd.js";
import { derivePlan, mergePlan, loadPlan, writePlan, buildPlanPath, readyFrontier } from "../src/plan.js";
import { renderSRD } from "../src/render.js";
import type { Brief, BuildPlanDoc, EvidenceItem } from "../src/types.js";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const brief = JSON.parse(readFileSync(join(FIX, "sample-brief.json"), "utf8")) as Brief;
const evidence = JSON.parse(readFileSync(join(FIX, "sample-evidence.json"), "utf8")) as EvidenceItem[];

const srd = () => buildSRD(brief, evidence, { level: "complex", generatedAt: "T" });

const dirs: string[] = [];
function freshDir(): string {
  const d = mkdtempSync(join(tmpdir(), "construct-plan-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("derivePlan", () => {
  it("derives T-000 plus one task per FR, in milestone order", () => {
    const plan = derivePlan(srd());
    expect(plan.tasks[0]!.id).toBe("T-000");
    expect(plan.tasks).toHaveLength(srd().functional.length + 1);
    // must-haves come before should-haves before could-haves
    const milestones = plan.tasks.slice(1).map((t) => t.milestone);
    expect(milestones).toEqual([...milestones].sort());
    // every FR task depends on the skeleton
    for (const t of plan.tasks.slice(1)) expect(t.dependsOn).toContain("T-000");
  });

  it("references acceptance criteria by pointer, never by copy", () => {
    const s = srd();
    const plan = derivePlan(s);
    const t1 = plan.tasks.find((t) => t.frIds.includes("FR-001"))!;
    expect(t1.acceptance).toEqual(s.functional[0]!.acceptance.map((_, i) => ({ frId: "FR-001", index: i })));
  });

  it("adds an entity edge to the earliest earlier-milestone task sharing an entity", () => {
    const s = srd();
    const plan = derivePlan(s);
    // FR-003 (should, Article) builds on the first must-have task touching Article
    const t3 = plan.tasks.find((t) => t.frIds.includes("FR-003"))!;
    const t1 = plan.tasks.find((t) => t.frIds.includes("FR-001"))!;
    expect(t3.dependsOn).toContain(t1.id);
    // same-milestone tasks stay parallel: FR-002 (must, Article) has no edge to FR-001
    const t2 = plan.tasks.find((t) => t.frIds.includes("FR-002"))!;
    expect(t2.dependsOn).toEqual(["T-000"]);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(derivePlan(srd()))).toBe(JSON.stringify(derivePlan(srd())));
  });
});

describe("mergePlan — re-render never loses agent progress", () => {
  it("preserves status, artifacts, tests, verify commands and conventions by FR identity", () => {
    const prev = derivePlan(srd());
    prev.conventions.testCommand = "pnpm test";
    prev.conventions.appDir = "./app";
    const t1 = prev.tasks.find((t) => t.frIds.includes("FR-001"))!;
    t1.status = "done";
    t1.artifacts = ["src/save.ts"];
    t1.tests = ["tests/save.test.ts"];
    t1.verify = { commands: ["pnpm test -- save"] };

    const merged = mergePlan(prev, derivePlan(srd()));
    expect(merged.conventions.testCommand).toBe("pnpm test");
    expect(merged.conventions.appDir).toBe("./app");
    const m1 = merged.tasks.find((t) => t.frIds.includes("FR-001"))!;
    expect(m1.status).toBe("done");
    expect(m1.artifacts).toEqual(["src/save.ts"]);
    expect(m1.tests).toEqual(["tests/save.test.ts"]);
    expect(m1.verify.commands).toEqual(["pnpm test -- save"]);
  });

  it("keeps progress attached to the right FR even when task ids shift", () => {
    const prev = derivePlan(srd());
    const searchTask = prev.tasks.find((t) => t.title.includes("FR-002"))!;
    searchTask.status = "done";

    // A new must-have feature is prepended → FR ids and task ids shift.
    const grown: Brief = {
      ...brief,
      featureWishlist: [{ title: "Sign in with a passkey", priority: "must" }, ...brief.featureWishlist],
    };
    const nextSrd = buildSRD(grown, evidence, { level: "complex", generatedAt: "T" });
    const merged = mergePlan(prev, derivePlan(nextSrd));
    // the search FR is now FR-003; its progress must follow the FR, not the slot
    const search = nextSrd.functional.find((f) => /full-text search/i.test(f.title))!;
    const followed = merged.tasks.find((t) => t.frIds.includes(search.id))!;
    expect(followed.status).toBe("done");
  });

  it("keeps engine-derived structure from the new plan", () => {
    const prev = derivePlan(srd());
    prev.tasks[1]!.title = "hand-edited title";
    prev.tasks[1]!.dependsOn = [];
    const merged = mergePlan(prev, derivePlan(srd()));
    expect(merged.tasks[1]!.title).not.toBe("hand-edited title");
    expect(merged.tasks[1]!.dependsOn).toContain("T-000");
  });
});

describe("render writes BUILD-PLAN.json and preserves it across re-renders", () => {
  it("emits the plan file and survives a re-render with progress intact", () => {
    const out = freshDir();
    renderSRD(brief, evidence, { level: "complex", out, merge: false, generatedAt: "T" });
    expect(existsSync(buildPlanPath(out))).toBe(true);

    const plan = loadPlan(out)!;
    plan.conventions.testCommand = "pnpm test";
    const t = plan.tasks.find((x) => x.frIds.includes("FR-001"))!;
    t.status = "done";
    t.artifacts = ["src/save.ts"];
    writePlan(out, plan);

    renderSRD(brief, evidence, { level: "complex", out, merge: false, generatedAt: "T2" });
    const after = loadPlan(out)!;
    expect(after.generatedAt).toBe("T2"); // engine-derived field refreshed
    expect(after.conventions.testCommand).toBe("pnpm test");
    expect(after.tasks.find((x) => x.frIds.includes("FR-001"))!.status).toBe("done");
  });

  it("is byte-deterministic for the same inputs on a fresh run", () => {
    const a = freshDir();
    const b = freshDir();
    renderSRD(brief, evidence, { level: "complex", out: a, merge: false, generatedAt: "T" });
    renderSRD(brief, evidence, { level: "complex", out: b, merge: false, generatedAt: "T" });
    expect(readFileSync(buildPlanPath(a), "utf8")).toBe(readFileSync(buildPlanPath(b), "utf8"));
  });
});

describe("readyFrontier — the buildable set", () => {
  it("exposes only T-000 until the skeleton is done", () => {
    const plan = derivePlan(srd());
    const f = readyFrontier(plan);
    expect(f.frontier).toEqual(["T-000"]);
    expect(f.total).toBe(plan.tasks.length);
    expect(f.done).toBe(0);
    // every FR task is blocked, waiting on the skeleton
    expect(f.blocked.find((b) => b.id === "T-001")!.waitingOn).toContain("T-000");
  });

  it("opens same-milestone tasks in parallel once T-000 is done, but holds entity-dependent ones", () => {
    const plan = derivePlan(srd());
    plan.tasks.find((t) => t.id === "T-000")!.status = "done";
    const f = readyFrontier(plan);
    const t1 = plan.tasks.find((t) => t.frIds.includes("FR-001"))!;
    const t2 = plan.tasks.find((t) => t.frIds.includes("FR-002"))!;
    // FR-001 and FR-002 are both must-haves (M1) depending only on T-000 → both ready in parallel
    expect(f.frontier).toContain(t1.id);
    expect(f.frontier).toContain(t2.id);
    // FR-003 (should) carries an entity edge to FR-001 → blocked until FR-001 is done
    const t3 = plan.tasks.find((t) => t.frIds.includes("FR-003"))!;
    expect(f.frontier).not.toContain(t3.id);
    expect(f.blocked.find((b) => b.id === t3.id)!.waitingOn).toContain(t1.id);
    expect(f.done).toBe(1);
  });

  it("drops done tasks from the frontier and clears blocked when all are done", () => {
    const plan = derivePlan(srd());
    for (const t of plan.tasks) t.status = "done";
    const f = readyFrontier(plan);
    expect(f.frontier).toEqual([]);
    expect(f.blocked).toEqual([]);
    expect(f.done).toBe(f.total);
  });
});

describe("loadPlan", () => {
  it("returns null for a missing or malformed plan", () => {
    const out = freshDir();
    expect(loadPlan(out)).toBeNull();
    writePlan(out, { not: "a plan" } as unknown as BuildPlanDoc);
    expect(loadPlan(out)).toBeNull();
  });
});
