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

  it("prefixes the digest of a low-signal evidence item so the judge treats it skeptically", () => {
    const dir = scratch();
    const lowEv = [
      { id: "E1", source: "docs", title: "pricing", ref: "https://x/pricing", score: 0, snippet: "Accept all cookies", meta: { lowSignal: true } },
    ];
    run(dir, [{ id: "FR-001", ev: ["E1"] }], lowEv);
    const r = runReview(dir);
    expect(r.pairs[0]!.digest).toMatch(/low-signal/i);
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

  it("reviews EVERY cited pair by default — no implicit 40-pair cap", () => {
    const dir = scratch();
    const many = Array.from({ length: 45 }, (_, i) => ({ id: `FR-${String(i + 1).padStart(3, "0")}`, ev: ["E1"] }));
    run(dir, many, EVIDENCE);
    const r = runReview(dir);
    expect(r.pairs.length).toBe(45); // the old default silently kept the top-40 by score
    rmSync(dir, { recursive: true, force: true });
  });

  it("an explicit cap names the DROPPED pairs loudly in VERIFY.md", () => {
    const dir = scratch();
    run(
      dir,
      [
        { id: "FR-001", ev: ["E1"] },
        { id: "FR-002", ev: ["E2"] },
      ],
      EVIDENCE,
    );
    runReview(dir, { maxReview: 1 });
    const md = readFileSync(join(dir, "VERIFY.md"), "utf8");
    expect(md).toMatch(/DROPPED/);
    expect(md).toMatch(/FR-002 · E2/); // E2 has the lower score → dropped
    expect(md).toMatch(/NOT .*adjudicated/i);
    expect(md).toMatch(/without --max-review/);
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

// The single-artifact-tamper / honest-fold-drop coverage gate. The persisted
// worklist (VERIFY.todo.json) and the persisted ledger (VERIFY.json verdicts[])
// are two artifacts; every pair the worklist names AND every pair the ledger
// carries must have an adjudicated verdict, else the gate fails closed.
describe("check --semantic coverage gate (worklist ↔ ledger)", () => {
  it("fails closed when a refuted pair is deleted from VERIFY.json while the worklist still lists it", () => {
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
    // FR-001/E1 REFUTED so check --semantic fails first.
    applyVerdicts(dir, writeVerdicts(dir, { E1: "refuted", E2: "supported" }));
    expect(checkRun(dir, { semantic: true }).semantic?.ok).toBe(false);

    // TAMPER: strip FR-001's verdict rows from the ledger; leave the worklist intact.
    const p = join(dir, "VERIFY.json");
    const sem = JSON.parse(readFileSync(p, "utf8"));
    sem.verdicts = sem.verdicts.filter((v: any) => v.claimId !== "FR-001");
    writeFileSync(p, JSON.stringify(sem, null, 2));

    const strict = checkRun(dir, { semantic: true });
    expect(strict.ok).toBe(false); // must NOT flip a refuted claim into a pass
    expect(strict.semantic).toBeUndefined(); // untrustworthy ledger → no misleading PASS block
    expect(strict.semanticError).toMatch(/FR-001·E1/);
    expect(strict.semanticError).toMatch(/--allow-unverified/);

    const lax = checkRun(dir, { semantic: true, allowUnverified: true });
    expect(lax.semanticError).toBeUndefined();
    expect(lax.structural.warnings.join(" ")).toMatch(/coverage gate skipped/i);
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails closed on a worklist pair left unadjudicated (verdict null), degradable via --allow-unverified", () => {
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
    // Adjudicate only FR-001; FR-002 is folded in as unadjudicated (verdict null).
    const todo = JSON.parse(readFileSync(join(dir, "VERIFY.todo.json"), "utf8")) as { pairs: any[] };
    const only = [{ ...todo.pairs.find((p) => p.claimId === "FR-001"), verdict: "supported", note: "" }];
    const f = join(dir, "partial.json");
    writeFileSync(f, JSON.stringify(only));
    applyVerdicts(dir, f);

    const strict = checkRun(dir, { semantic: true });
    expect(strict.ok).toBe(false);
    expect(strict.semanticError).toMatch(/FR-002·E2/);
    expect(strict.semanticError).toMatch(/--allow-unverified/);

    const lax = checkRun(dir, { semantic: true, allowUnverified: true });
    expect(lax.semanticError).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });

  it("passes when every worklist pair carries an adjudicated verdict (no false alarm)", () => {
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
    applyVerdicts(dir, writeVerdicts(dir, { E1: "supported", E2: "partial" }));
    const r = checkRun(dir, { semantic: true });
    expect(r.semanticError).toBeUndefined();
    expect(r.semantic?.ok).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});

// The staleness gate used to compare only SRD.generatedAt — but the documented
// workflow (edit SRD.json, `render --from-srd`) PRESERVES generatedAt, so an SRD
// whose claims were rewritten after the review still certified as "supported".
// Verdicts must therefore bind to the full claim text AND the cited evidence's
// contents, checked at worklist generation, at apply, and at check.
describe("check --semantic binds verdicts to claim + evidence CONTENT (stale-verdict bypass)", () => {
  const readSrd = (dir: string) => JSON.parse(readFileSync(join(dir, "SRD.json"), "utf8"));
  const writeSrd = (dir: string, srd: unknown) => writeFileSync(join(dir, "SRD.json"), JSON.stringify(srd, null, 2));
  const HOSTILE = "The application uploads every saved article to a public server without authentication.";

  // review → adjudicate every pair `supported` → apply. The green baseline.
  function reviewed(dir: string): void {
    runReview(dir);
    applyVerdicts(dir, writeVerdicts(dir, {}));
  }

  function twoClaims(): string {
    const dir = scratch();
    run(
      dir,
      [
        { id: "FR-001", ev: ["E1"] },
        { id: "FR-002", ev: ["E2"] },
      ],
      EVIDENCE,
    );
    return dir;
  }

  it("passes a genuine unchanged run, and a re-render of identical content stays valid + deterministic", () => {
    const dir = twoClaims();
    const first = runReview(dir);
    expect(first.pairs.every((p) => typeof p.fingerprint === "string" && p.fingerprint.length > 0)).toBe(true);
    applyVerdicts(dir, writeVerdicts(dir, {}));
    expect(checkRun(dir, { semantic: true }).semanticError).toBeUndefined();
    expect(checkRun(dir, { semantic: true }).semantic?.ok).toBe(true);

    // `render --from-srd` rewrites the manifest from the same model (generatedAt
    // preserved). Identical content ⇒ identical fingerprints ⇒ still certified.
    writeSrd(dir, readSrd(dir));
    const second = runReview(dir);
    expect(second.pairs.map((p) => p.fingerprint)).toEqual(first.pairs.map((p) => p.fingerprint));
    const r = checkRun(dir, { semantic: true });
    expect(r.semanticError).toBeUndefined();
    expect(r.semantic?.ok).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses a stale saved worklist even when rows carry a current fingerprint", () => {
    const dir = twoClaims();
    try {
      runReview(dir);
      const saved = readFileSync(join(dir, "VERIFY.todo.json"), "utf8");
      const srd = readSrd(dir);
      srd.functional[0].description += ` ${"context ".repeat(80)} ORIGINAL_SUFFIX`;
      writeSrd(dir, srd);
      runReview(dir);
      const verdicts = writeVerdicts(dir, {});
      writeFileSync(join(dir, "VERIFY.todo.json"), saved);
      expect(() => applyVerdicts(dir, verdicts)).toThrow(/changed|stale/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(["missing", "corrupt", "legacy"])("keeps old rows unbound with a %s worklist after a suffix edit", (state) => {
    const dir = twoClaims();
    try {
      const srd = readSrd(dir);
      srd.functional[0].description += ` ${"context ".repeat(80)} ORIGINAL_SUFFIX`;
      writeSrd(dir, srd);
      const todo = runReview(dir);
      const pairs = todo.pairs.map(({ fingerprint: _fingerprint, ...p }) => ({ ...p, verdict: "supported", note: "old judgement" }));
      const path = join(dir, "VERIFY.todo.json");
      if (state === "missing") rmSync(path);
      else writeFileSync(path, state === "corrupt" ? "{" : JSON.stringify({ pairs }));
      srd.functional[0].description = srd.functional[0].description.replace("ORIGINAL_SUFFIX", "CHANGED_SUFFIX");
      writeSrd(dir, srd);
      const f = join(dir, "legacy.json");
      writeFileSync(f, JSON.stringify({ pairs }));
      applyVerdicts(dir, f);
      expect(checkRun(dir, { semantic: true }).semanticError).toMatch(/fingerprint/i);
      expect(JSON.parse(readFileSync(join(dir, "VERIFY.json"), "utf8")).verdicts.every((v: any) => !v.fingerprint)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails when a claim's description changed under the SAME generatedAt", () => {
    const dir = twoClaims();
    reviewed(dir);
    const srd = readSrd(dir);
    const stamp = srd.generatedAt;
    srd.functional[0].description = HOSTILE;
    writeSrd(dir, srd);
    expect(readSrd(dir).generatedAt).toBe(stamp); // exactly what `render --from-srd` preserves

    const strict = checkRun(dir, { semantic: true });
    expect(strict.ok).toBe(false);
    expect(strict.semantic).toBeUndefined(); // no misleading "17 supported" PASS block
    expect(strict.semanticError).toMatch(/FR-001·E1/);
    expect(strict.semanticError).toMatch(/--allow-unverified/);
    expect(strict.semanticError).toMatch(/construct review/);

    const lax = checkRun(dir, { semantic: true, allowUnverified: true });
    expect(lax.semanticError).toBeUndefined();
    expect(lax.structural.warnings.join(" ")).toMatch(/FR-001·E1|changed since/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails when an acceptance criterion changed BEYOND the 400-char claim excerpt", () => {
    const dir = twoClaims();
    const filler = Array.from({ length: 8 }, (_, i) => ({
      given: `precondition ${i} with enough prose to push the interesting criterion past the excerpt cap`,
      when: `the user performs step ${i}`,
      then: `the system records outcome ${i}`,
    }));
    const seed = readSrd(dir);
    seed.functional[0].acceptance = [...filler, { given: "the archive is private", when: "an article is saved", then: "it stays on the device" }];
    writeSrd(dir, seed);
    reviewed(dir);
    const before = JSON.parse(readFileSync(join(dir, "VERIFY.json"), "utf8")).verdicts.find((v: any) => v.claimId === "FR-001").claim;

    const srd = readSrd(dir);
    srd.functional[0].acceptance.at(-1).then = "it is published to a public bucket";
    writeSrd(dir, srd);
    runReview(dir); // the worklist's 400-char excerpt cannot see the edit …
    const after = JSON.parse(readFileSync(join(dir, "VERIFY.todo.json"), "utf8")).pairs.find((p: any) => p.claimId === "FR-001").claim;
    expect(after).toBe(before);
    expect(after.length).toBe(400);

    const r = checkRun(dir, { semantic: true }); // … but the fingerprint must
    expect(r.ok).toBe(false);
    expect(r.semanticError).toMatch(/FR-001·E1/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails when the CITED EVIDENCE snippet was altered after the review", () => {
    const dir = twoClaims();
    reviewed(dir);
    const altered = EVIDENCE.map((e) => (e.id === "E1" ? { ...e, snippet: "POST /todos is unsupported and returns 501" } : e));
    writeFileSync(join(dir, "evidence", "evidence.json"), JSON.stringify(altered));

    const r = checkRun(dir, { semantic: true });
    expect(r.ok).toBe(false);
    expect(r.semantic).toBeUndefined();
    expect(r.semanticError).toMatch(/FR-001·E1/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses to apply a STALE worklist's verdicts after the SRD changed", () => {
    const dir = twoClaims();
    runReview(dir); // judged against the ORIGINAL claim text
    const verdicts = writeVerdicts(dir, {});
    const srd = readSrd(dir);
    srd.functional[0].description = HOSTILE;
    writeSrd(dir, srd);

    expect(() => applyVerdicts(dir, verdicts)).toThrow(/FR-001·E1/);
    expect(() => applyVerdicts(dir, verdicts)).toThrow(/construct review/);
    expect(existsSync(join(dir, "VERIFY.json"))).toBe(false); // no green ledger written
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses a stale worklist even for FRAGMENT verdicts that carry no fingerprint", () => {
    const dir = twoClaims();
    runReview(dir);
    // What the orchestrated claim-reviewer agents emit (CLAIM_REVIEW_SCHEMA):
    // claimId/evidenceId/verdict/note only — the binding comes from the worklist.
    const fragments = [
      { claimId: "FR-001", evidenceId: "E1", verdict: "supported", note: "" },
      { claimId: "FR-002", evidenceId: "E2", verdict: "supported", note: "" },
    ];
    const f = join(dir, "fragments.json");
    writeFileSync(f, JSON.stringify({ pairs: fragments }));

    // Against the CURRENT worklist a fragment file still applies and is bound.
    const ok = applyVerdicts(dir, f);
    expect(ok.ok).toBe(true);
    const ledger = JSON.parse(readFileSync(join(dir, "VERIFY.json"), "utf8"));
    expect(ledger.verdicts.every((v: any) => typeof v.fingerprint === "string")).toBe(true);
    expect(checkRun(dir, { semantic: true }).semantic?.ok).toBe(true);

    const srd = readSrd(dir);
    srd.functional[0].description = HOSTILE;
    writeSrd(dir, srd);
    expect(() => applyVerdicts(dir, f)).toThrow(/FR-001·E1/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("never lets a fingerprint-less (legacy) ledger silently certify — it is explicit and degradable", () => {
    const dir = twoClaims();
    reviewed(dir);
    const p = join(dir, "VERIFY.json");
    const sem = JSON.parse(readFileSync(p, "utf8"));
    sem.verdicts = sem.verdicts.map(({ fingerprint, ...rest }: any) => rest); // a pre-fingerprint ledger
    writeFileSync(p, JSON.stringify(sem, null, 2));

    const strict = checkRun(dir, { semantic: true });
    expect(strict.ok).toBe(false);
    expect(strict.semantic).toBeUndefined();
    expect(strict.semanticError).toMatch(/fingerprint/i);
    expect(strict.semanticError).toMatch(/--allow-unverified/);

    const lax = checkRun(dir, { semantic: true, allowUnverified: true });
    expect(lax.semanticError).toBeUndefined();
    expect(lax.structural.warnings.join(" ")).toMatch(/fingerprint/i);
    expect(lax.semantic?.ok).toBe(true); // explicit downgrade still reduces the verdicts
    rmSync(dir, { recursive: true, force: true });
  });

  // The laundering path: a pre-fingerprint worklist + the verdicts adjudicated
  // from it, applied AFTER the SRD was edited. Binding those verdicts to whatever
  // is on disk at apply time would make an old review certify claims it never saw
  // — the legacy artifact must stay unbound and be re-reviewed.
  it("never re-binds a legacy worklist's verdicts to the CURRENT SRD", () => {
    const dir = twoClaims();
    runReview(dir);
    const todoPath = join(dir, "VERIFY.todo.json");
    const todo = JSON.parse(readFileSync(todoPath, "utf8"));
    const legacyPairs = todo.pairs.map(({ fingerprint, ...p }: any) => p);
    writeFileSync(todoPath, JSON.stringify({ run: dir, pairs: legacyPairs })); // pre-3.19: no fingerprints, no scope
    const f = join(dir, "legacy-verdicts.json");
    writeFileSync(f, JSON.stringify({ pairs: legacyPairs.map((p: any) => ({ ...p, verdict: "supported", note: "" })) }));

    // … and the SRD is edited afterwards, generatedAt preserved as `render --from-srd` leaves it.
    const srd = readSrd(dir);
    srd.functional[0].description = HOSTILE;
    writeSrd(dir, srd);

    applyVerdicts(dir, f);
    const ledger = JSON.parse(readFileSync(join(dir, "VERIFY.json"), "utf8"));
    expect(ledger.verdicts.every((v: any) => v.fingerprint === undefined)).toBe(true); // no minted binding

    const strict = checkRun(dir, { semantic: true });
    expect(strict.ok).toBe(false);
    expect(strict.semantic).toBeUndefined();
    expect(strict.semanticError).toMatch(/fingerprint/i);
    expect(strict.semanticError).toMatch(/construct review/);
    rmSync(dir, { recursive: true, force: true });
  });

  // The pair SET can change too: a claim added after the review has no verdict to
  // invalidate, so per-verdict fingerprints alone would never notice it.
  it("fails when the SRD cites a pair that was never part of a review", () => {
    const dir = twoClaims();
    reviewed(dir);
    const srd = readSrd(dir);
    const stamp = srd.generatedAt;
    srd.functional.push({ ...srd.functional[0], id: "FR-003", title: "FR-003 title", description: HOSTILE, rationaleEvidence: ["E2"] });
    writeSrd(dir, srd);
    expect(readSrd(dir).generatedAt).toBe(stamp);

    const strict = checkRun(dir, { semantic: true });
    expect(strict.ok).toBe(false);
    expect(strict.semantic).toBeUndefined();
    expect(strict.semanticError).toMatch(/FR-003·E2/);
    expect(strict.semanticError).toMatch(/--allow-unverified/);
    expect(strict.semanticError).toMatch(/construct review/);

    const lax = checkRun(dir, { semantic: true, allowUnverified: true });
    expect(lax.semanticError).toBeUndefined();
    expect(lax.structural.warnings.join(" ")).toMatch(/FR-003·E2/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses to apply verdicts from a worklist the SRD has since outgrown", () => {
    const dir = twoClaims();
    runReview(dir);
    const verdicts = writeVerdicts(dir, {});
    const srd = readSrd(dir);
    srd.functional.push({ ...srd.functional[0], id: "FR-003", title: "FR-003 title", rationaleEvidence: ["E2"] });
    writeSrd(dir, srd);

    expect(() => applyVerdicts(dir, verdicts)).toThrow(/FR-003·E2/);
    expect(existsSync(join(dir, "VERIFY.json"))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  // The cap is an explicit, documented omission (VERIFY.md names every dropped
  // pair): it must stay transparently partial, not be re-read as "the SRD changed".
  it("keeps an explicitly capped review applicable and passing — its dropped pairs are in scope", () => {
    const dir = twoClaims();
    runReview(dir, { maxReview: 1 });
    const todo = JSON.parse(readFileSync(join(dir, "VERIFY.todo.json"), "utf8"));
    expect(todo.pairs.length).toBe(1);
    expect(todo.scope.length).toBe(2); // kept + dropped

    applyVerdicts(dir, writeVerdicts(dir, {}));
    const r = checkRun(dir, { semantic: true });
    expect(r.semanticError).toBeUndefined();
    expect(r.semantic?.ok).toBe(true);
    expect(r.semantic?.pairs).toBe(1); // still only what was actually adjudicated
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
