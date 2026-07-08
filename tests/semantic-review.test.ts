import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runReview, applyVerdicts, formatReviewReport } from "../src/review.js";
import { checkRun } from "../src/check.js";
import type { ClaimVerifyResult } from "../src/types.js";

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

  it("fails closed when no VERIFY.json exists (names --allow-unverified)", () => {
    const dir = scratch();
    run(dir, [{ id: "FR-001", ev: ["E1"] }], EVIDENCE);
    const r = checkRun(dir, { semantic: true });
    expect(r.semantic).toBeUndefined();
    expect(r.ok).toBe(false);
    expect(r.semanticError).toMatch(/VERIFY\.json/);
    expect(r.semanticError).toMatch(/--allow-unverified/);
    expect(r.semanticError?.toLowerCase()).toContain("review");
    rmSync(dir, { recursive: true, force: true });
  });

  it("--allow-unverified degrades a missing VERIFY.json to the advisory warning", () => {
    const dir = scratch();
    run(dir, [{ id: "FR-001", ev: ["E1"] }], EVIDENCE);
    const r = checkRun(dir, { semantic: true, allowUnverified: true });
    expect(r.semantic).toBeUndefined();
    expect(r.semanticError).toBeUndefined();
    expect(r.structural.warnings.join(" ").toLowerCase()).toContain("review");
    rmSync(dir, { recursive: true, force: true });
  });

  it("recomputes ok from verdicts[] — a tampered persisted ok:true with a refuted verdict still fails", () => {
    const dir = scratch();
    run(dir, [{ id: "FR-001", ev: ["E1"] }], EVIDENCE);
    runReview(dir);
    applyVerdicts(dir, writeVerdicts(dir, { E1: "supported" }));
    // Tamper the OUTPUT: flip the verdict but keep the persisted summary green.
    const p = join(dir, "VERIFY.json");
    const sem = JSON.parse(readFileSync(p, "utf8"));
    sem.verdicts[0].verdict = "refuted";
    expect(sem.ok).toBe(true); // the doctored summary still claims a pass
    writeFileSync(p, JSON.stringify(sem, null, 2));

    const r = checkRun(dir, { semantic: true });
    expect(r.semantic?.ok).toBe(false); // recomputed from verdicts[], not trusted
    expect(r.ok).toBe(false);
    expect(r.structural.warnings.join(" ")).toMatch(/recomputed/i);
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails closed on a legacy VERIFY.json without verdicts[] unless --allow-unverified", () => {
    const dir = scratch();
    run(dir, [{ id: "FR-001", ev: ["E1"] }], EVIDENCE);
    writeFileSync(
      join(dir, "VERIFY.json"),
      JSON.stringify({ ok: true, pairs: 1, adjudicated: 1, supported: 1, partial: 0, refuted: 0, unsupported: 0, failures: [], unadjudicated: [] }),
    );
    const strict = checkRun(dir, { semantic: true });
    expect(strict.ok).toBe(false);
    expect(strict.semanticError).toMatch(/verdicts/i);
    expect(strict.semanticError).toMatch(/--allow-unverified/);
    const lax = checkRun(dir, { semantic: true, allowUnverified: true });
    expect(lax.semanticError).toBeUndefined();
    expect(lax.structural.warnings.join(" ")).toMatch(/verdicts/i);
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails closed on an unreadable VERIFY.json unless --allow-unverified", () => {
    const dir = scratch();
    run(dir, [{ id: "FR-001", ev: ["E1"] }], EVIDENCE);
    writeFileSync(join(dir, "VERIFY.json"), "}broken{");
    const strict = checkRun(dir, { semantic: true });
    expect(strict.ok).toBe(false);
    expect(strict.semanticError).toMatch(/unreadable/i);
    expect(strict.semanticError).toMatch(/--allow-unverified/);
    const lax = checkRun(dir, { semantic: true, allowUnverified: true });
    expect(lax.semanticError).toBeUndefined();
    expect(lax.structural.warnings.join(" ").toLowerCase()).toContain("unreadable");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("runReview — claim coverage & error paths", () => {
  it("builds pairs for NFR, ADR, competitor and OSS claims, not only FRs", () => {
    const dir = scratch();
    const srd = {
      schemaVersion: 1,
      level: "light",
      generatedAt: "T",
      product: { name: "x", problem: "", valueProp: "", users: [], metrics: [] },
      scope: { inScope: [], outOfScope: [], assumptions: [] },
      functional: [],
      nonFunctional: [{ id: "NFR-001", category: "Performance", statement: "stays fast", metric: "p95 < 200ms", rationaleEvidence: ["E1"] }],
      architecture: {
        context: "",
        dataModel: [],
        interfaces: [],
        adrs: [{ id: "0001", title: "Use X", status: "accepted", context: "c", decision: "d", consequences: "q", evidence: ["E2"] }],
      },
      competitive: { competitors: [{ name: "Acme", note: "incumbent", evidence: ["E1"] }], oss: [{ name: "libx", note: "prior art", evidence: ["E2"] }] },
      buildPlan: [],
      traceability: [],
      openQuestions: [],
      evidenceIndex: [],
    };
    writeFileSync(join(dir, "SRD.json"), JSON.stringify(srd));
    mkdirSync(join(dir, "evidence"), { recursive: true });
    writeFileSync(join(dir, "evidence", "evidence.json"), JSON.stringify(EVIDENCE));
    const wl = runReview(dir);
    expect(new Set(wl.pairs.map((p) => p.kind))).toEqual(new Set(["NFR", "ADR", "competitor", "oss"]));
    const ids = wl.pairs.map((p) => p.claimId);
    expect(ids).toContain("NFR-001");
    expect(ids).toContain("ADR-0001");
    expect(ids.some((i) => i.startsWith("COMP-"))).toBe(true);
    expect(ids.some((i) => i.startsWith("OSS-"))).toBe(true);
    // the NFR digest carries its metric text
    expect(wl.pairs.find((p) => p.claimId === "NFR-001")!.claim).toMatch(/p95 < 200ms/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("throws a clean domain error when SRD.json is unreadable", () => {
    const dir = scratch();
    writeFileSync(join(dir, "SRD.json"), "}broken{");
    expect(() => runReview(dir)).toThrow(/SRD\.json is unreadable/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("degrades to no-evidence (never crashes) on a corrupt evidence.json", () => {
    for (const body of [JSON.stringify({ not: "an array" }), "{ broken ]["]) {
      const dir = scratch();
      run(dir, [{ id: "FR-001", ev: ["E1"] }], EVIDENCE);
      writeFileSync(join(dir, "evidence", "evidence.json"), body); // hand-broken dossier
      expect(() => runReview(dir), `body=${body}`).not.toThrow();
      // E1 no longer resolves → its citation is dangling → no support pair
      expect(runReview(dir).pairs).toEqual([]);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("applyVerdicts — validation & unadjudicated tracking", () => {
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

  it("rejects a non-JSON verdicts file", () => {
    const dir = setup();
    const f = join(dir, "bad.json");
    writeFileSync(f, "not json at all");
    expect(() => applyVerdicts(dir, f)).toThrow(/not valid JSON/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects a valid-JSON-but-wrong-shape file without writing a vacuous VERIFY.json", () => {
    const dir = setup();
    const f = join(dir, "wrong.json");
    writeFileSync(f, "42");
    expect(() => applyVerdicts(dir, f)).toThrow(/must be a JSON array/);
    expect(existsSync(join(dir, "VERIFY.json"))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("surfaces a dropped claim↔evidence pair as unadjudicated rather than passing it", () => {
    const dir = setup();
    const todo = JSON.parse(readFileSync(join(dir, "VERIFY.todo.json"), "utf8")) as { pairs: Record<string, unknown>[] };
    const only = [{ ...todo.pairs[0], verdict: "supported", note: "" }];
    const f = join(dir, "partial.json");
    writeFileSync(f, JSON.stringify(only));
    const r = applyVerdicts(dir, f);
    expect(r.unadjudicated.length).toBeGreaterThan(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("still applies the provided verdicts when VERIFY.todo.json is corrupt", () => {
    const dir = setup();
    const good = writeVerdicts(dir, { E1: "supported", E2: "supported" });
    writeFileSync(join(dir, "VERIFY.todo.json"), "}corrupt{");
    const r = applyVerdicts(dir, good);
    expect(r.ok).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("formatReviewReport", () => {
  it("lists failures and unadjudicated claims", () => {
    const r: ClaimVerifyResult = {
      ok: false,
      pairs: 3,
      adjudicated: 2,
      supported: 1,
      partial: 0,
      refuted: 1,
      unsupported: 0,
      failures: [{ claimId: "FR-002", evidenceId: "E2", verdict: "refuted", note: "contradicts" }],
      unadjudicated: ["FR-003"],
    };
    const text = formatReviewReport(r);
    expect(text).toMatch(/2\/3 pair\(s\) adjudicated/);
    expect(text).toMatch(/✗ FR-002 \(E2\): refuted — contradicts/);
    expect(text).toMatch(/1 claim\(s\) not fully adjudicated: FR-003/);
    expect(text).toMatch(/some claims are refuted or unsupported/);
  });

  it("reports the all-clear when nothing failed", () => {
    const r: ClaimVerifyResult = { ok: true, pairs: 2, adjudicated: 2, supported: 2, partial: 0, refuted: 0, unsupported: 0, failures: [], unadjudicated: [] };
    expect(formatReviewReport(r)).toMatch(/every grounded claim is backed/);
  });
});

describe("claim-focused digest", () => {
  it("windows a long snippet around the claim's keywords instead of head-truncating", () => {
    const dir = scratch();
    const filler = "Introductory marketing filler sentence about the product. ".repeat(20); // > 600 chars
    const support = "The FR-001 title does a thing exactly as documented here.";
    run(
      dir,
      [{ id: "FR-001", ev: ["E9"] }],
      [{ id: "E9", source: "market", title: "How it works", ref: "u", url: "https://x/how", score: 5, snippet: filler + support }],
    );
    const wl = runReview(dir);
    const pair = wl.pairs.find((p) => p.evidenceId === "E9")!;
    expect(pair).toBeDefined();
    expect(pair.digest).toContain("does a thing exactly as documented");
    expect(pair.digest.length).toBeLessThanOrEqual(650);
    rmSync(dir, { recursive: true, force: true });
  });
});
