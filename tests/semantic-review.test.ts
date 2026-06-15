import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runReview, applyVerdicts } from "../src/review.js";
import { checkRun } from "../src/check.js";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "ct-review-"));
}

// A minimal run dir: SRD.json (only the fields review reads) + evidence/evidence.json.
function run(dir: string, fr: { id: string; ev: string[] }[], evidence: any[]): void {
  const srd = {
    schemaVersion: 1,
    level: "light",
    generatedAt: "2026-06-15T00:00:00.000Z",
    product: { name: "x", problem: "", valueProp: "", users: [], metrics: [] },
    scope: { inScope: [], outOfScope: [], assumptions: [] },
    functional: fr.map((f) => ({
      id: f.id,
      title: `${f.id} title`,
      description: `${f.id} does a thing`,
      priority: "must",
      acceptance: [],
      rationaleEvidence: f.ev,
      entities: [],
      interfaces: [],
      nfrs: [],
      unresolved: false,
    })),
    nonFunctional: [],
    architecture: { context: "", dataModel: [], interfaces: [], adrs: [] },
    competitive: { competitors: [], oss: [] },
    buildPlan: [],
    traceability: [],
    openQuestions: [],
    evidenceIndex: [],
  };
  writeFileSync(join(dir, "SRD.json"), JSON.stringify(srd));
  mkdirSync(join(dir, "evidence"), { recursive: true });
  writeFileSync(join(dir, "evidence", "evidence.json"), JSON.stringify(evidence));
}

const EVIDENCE = [
  { id: "E1", source: "oss", title: "todo-app", ref: "github.com/x/y", score: 1, snippet: "POST /todos creates a todo" },
  { id: "E2", source: "tech", title: "API docs", ref: "docs", score: 0.8, snippet: "GET /todos lists todos" },
];

function writeVerdicts(dir: string, map: Record<string, string>): string {
  const todo = JSON.parse(readFileSync(join(dir, "VERIFY.todo.json"), "utf8"));
  const pairs = todo.pairs.map((p: any) => ({ ...p, verdict: map[p.evidenceId] ?? "supported", note: "" }));
  const f = join(dir, "verdicts.json");
  writeFileSync(f, JSON.stringify({ pairs }));
  return f;
}

describe("runReview (worklist)", () => {
  it("pairs each grounded SRD claim with its cited evidence and writes the worklist", () => {
    const dir = scratch();
    run(
      dir,
      [
        { id: "FR-001", ev: ["E1"] },
        { id: "FR-002", ev: ["E2"] },
      ],
      EVIDENCE,
    );
    const r = runReview(dir);
    expect(r.pairs.length).toBe(2);
    expect(r.pairs.map((p) => p.evidenceId).sort()).toEqual(["E1", "E2"]);
    expect(r.pairs.map((p) => p.claimId).sort()).toEqual(["FR-001", "FR-002"]);
    expect(r.pairs[0]!.digest.length).toBeGreaterThan(0);
    expect(existsSync(join(dir, "VERIFY.todo.json"))).toBe(true);
    expect(existsSync(join(dir, "VERIFY.md"))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("skips a claim citing only a dangling [E#]", () => {
    const dir = scratch();
    run(
      dir,
      [
        { id: "FR-001", ev: ["E1"] },
        { id: "FR-002", ev: ["E9"] },
      ],
      EVIDENCE,
    );
    const r = runReview(dir);
    expect(r.pairs.map((p) => p.claimId)).toEqual(["FR-001"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("caps the worklist at maxReview", () => {
    const dir = scratch();
    run(
      dir,
      [
        { id: "FR-001", ev: ["E1"] },
        { id: "FR-002", ev: ["E2"] },
      ],
      EVIDENCE,
    );
    const r = runReview(dir, { maxReview: 1 });
    expect(r.pairs.length).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("applyVerdicts (semantic gate)", () => {
  function setup(): string {
    const dir = scratch();
    run(
      dir,
      [
        { id: "FR-001", ev: ["E1"] },
        { id: "FR-002", ev: ["E2"] },
      ],
      EVIDENCE,
    );
    runReview(dir);
    return dir;
  }

  it("passes when every claim has a supporting evidence item", () => {
    const dir = setup();
    const r = applyVerdicts(dir, writeVerdicts(dir, { E1: "supported", E2: "partial" }));
    expect(r.ok).toBe(true);
    expect(existsSync(join(dir, "VERIFY.json"))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails when a cited evidence item refutes the claim", () => {
    const dir = setup();
    const r = applyVerdicts(dir, writeVerdicts(dir, { E1: "refuted", E2: "supported" }));
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.verdict === "refuted")).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails when a claim's only cited evidence is unsupported", () => {
    const dir = setup();
    const r = applyVerdicts(dir, writeVerdicts(dir, { E1: "unsupported", E2: "supported" }));
    expect(r.ok).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("check --semantic composition (additive)", () => {
  it("folds VERIFY.json into the gate and is undefined without the flag", () => {
    const dir = scratch();
    run(dir, [{ id: "FR-001", ev: ["E1"] }], EVIDENCE);
    runReview(dir);
    applyVerdicts(dir, writeVerdicts(dir, { E1: "refuted" }));
    expect(checkRun(dir).semantic).toBeUndefined(); // additive: no flag → no semantic
    const sem = checkRun(dir, { semantic: true });
    expect(sem.semantic?.ok).toBe(false);
    expect(sem.ok).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("warns (does not add a semantic verdict) when no VERIFY.json exists", () => {
    const dir = scratch();
    run(dir, [{ id: "FR-001", ev: ["E1"] }], EVIDENCE);
    const r = checkRun(dir, { semantic: true });
    expect(r.semantic).toBeUndefined();
    expect(r.structural.warnings.join(" ").toLowerCase()).toContain("review");
    rmSync(dir, { recursive: true, force: true });
  });
});
