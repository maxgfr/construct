// The requirement-quality lint.
//
// Before this, `check` recognised exactly one templated acceptance criterion —
// the literal string "is persisted and visible to the user". But the renderer
// has four happy-path branches and two failure-path templates, and it emits a
// failure-path criterion on EVERY requirement at complex level. So an SRD could
// pass the hard gate at the level that claims build-readiness while most of its
// acceptance criteria were text nobody had written.
import { describe, it, expect } from "vitest";
import { lintRequirements, formatFinding } from "../src/requirements-lint.js";
import type { SRD } from "../src/types.js";

function srd(over: Partial<SRD> = {}): SRD {
  return {
    schemaVersion: 1,
    level: "complex",
    generatedAt: "T",
    product: { name: "P", problem: "p", valueProp: "v", users: ["u"], metrics: ["1,000 installs in year one"] },
    scope: { inScope: [], outOfScope: [], assumptions: ["One developer, 8 weeks."] },
    functional: [],
    nonFunctional: [],
    architecture: { context: "c", dataModel: [], interfaces: [], adrs: [] },
    competitive: { competitors: [], oss: [] },
    buildPlan: [],
    traceability: [],
    openQuestions: [],
    evidenceIndex: [],
    ...over,
  } as SRD;
}

function withThen(...thens: string[]): SRD {
  return srd({
    functional: [
      {
        id: "FR-001",
        title: "Save an article",
        description: "d",
        priority: "must",
        acceptance: thens.map((t) => ({ given: "g", when: "w", then: t })),
        rationaleEvidence: [],
        entities: [],
        interfaces: [],
        nfrs: [],
      },
    ] as unknown as SRD["functional"],
  });
}

describe("renderer scaffold in acceptance criteria", () => {
  // One case per branch the renderer can emit. If a branch is added to
  // srd.ts::concreteOutcome without a matching entry here, this suite is the
  // thing that should have caught it.
  const branches = [
    ['the result of "save an article" is persisted and visible to the user', "verifiable"],
    ["the action succeeds and the saved copy renders without the original site being reachable", "verifiable"],
    ["the action completes in under 2 seconds", "verifiable"],
    ["the outcome honours the stated bound: within 2 seconds", "verifiable"],
    ["the system surfaces a clear, specific error and makes no partial or inconsistent change", "unambiguous"],
    ["the system rejects it with a clear, actionable error and no side effects", "unambiguous"],
  ] as const;

  for (const [then, characteristic] of branches) {
    it(`flags "${then.slice(0, 42)}…"`, () => {
      const found = lintRequirements(withThen(then));
      expect(found).toHaveLength(1);
      expect(found[0]!.kind).toBe("scaffold");
      expect(found[0]!.characteristic).toBe(characteristic);
      expect(found[0]!.where).toBe("FR-001 acceptance #1");
    });
  }

  it("says nothing about an authored criterion", () => {
    const found = lintRequirements(withThen("the extracted body is stored locally and the article appears at the top of the list within 2 seconds"));
    expect(found).toEqual([]);
  });

  it("reports one finding per criterion, at its own index", () => {
    const found = lintRequirements(
      withThen("the article appears within 2 seconds", "the system rejects it with a clear, actionable error and no side effects"),
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.where).toBe("FR-001 acceptance #2");
  });
});

describe("vagueness (heuristic — always advisory)", () => {
  const cases = [
    ["the failure is handled gracefully", "verifiable"],
    ["the import completes correctly", "verifiable"],
    ["results are returned fast", "unambiguous"],
    ["the list shows titles, tags, etc.", "complete"],
    ["retries happen as needed", "verifiable"],
  ] as const;

  for (const [then, characteristic] of cases) {
    it(`flags "${then}"`, () => {
      const found = lintRequirements(withThen(then));
      expect(found).toHaveLength(1);
      expect(found[0]!.kind).toBe("vague");
      expect(found[0]!.characteristic).toBe(characteristic);
    });
  }

  it("prefers the scaffold finding when a criterion is both", () => {
    // "the system rejects it with a clear, actionable error…" is scaffold AND
    // contains no weasel word; but the ordering rule matters for criteria that
    // would match both families — the scaffold is what to fix first.
    const found = lintRequirements(withThen("the action succeeds and everything is handled gracefully"));
    expect(found).toHaveLength(1);
    expect(found[0]!.kind).toBe("scaffold");
  });

  it("does not flag a bounded, observable outcome that happens to contain a number", () => {
    expect(lintRequirements(withThen("the response returns HTTP 422 and no row is written"))).toEqual([]);
  });
});

describe("seeded prose elsewhere in the SRD", () => {
  it("flags an interface contract still saying 'define … during authoring'", () => {
    const found = lintRequirements(
      srd({
        architecture: {
          context: "c",
          dataModel: [],
          adrs: [],
          interfaces: [
            {
              name: "Web App",
              kind: "ui",
              summary: "Boundary with the web. Define the contract (operations, data, failure modes) during authoring.",
              relatedFRs: [],
            },
          ],
        },
      }),
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.characteristic).toBe("complete");
    expect(found[0]!.where).toBe('interface "Web App"');
  });

  it("flags the placeholder success metric and the placeholder assumption", () => {
    const found = lintRequirements(
      srd({
        product: { name: "P", problem: "p", valueProp: "v", users: ["u"], metrics: ["Define a measurable launch success metric."] },
        scope: { inScope: [], outOfScope: [], assumptions: ["No hard constraints were captured; revisit budget, timeline and team before committing."] },
      }),
    );
    expect(found.map((f) => f.characteristic).sort()).toEqual(["feasible", "verifiable"]);
  });
});

describe("the message", () => {
  it("names the location, the standard, the text and the fix", () => {
    const [f] = lintRequirements(withThen("the system rejects it with a clear, actionable error and no side effects"));
    const line = formatFinding(f!);
    expect(line).toContain("FR-001 acceptance #1");
    expect(line).toContain("29148 §5.2.4 unambiguous");
    expect(line).toContain("Fix:");
  });

  it("truncates a very long criterion instead of flooding the report", () => {
    const long = `the action succeeds and ${"x".repeat(400)}`;
    const [f] = lintRequirements(withThen(long));
    expect(formatFinding(f!).length).toBeLessThan(300);
  });
});
