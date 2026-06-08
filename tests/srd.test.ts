import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildSRD, matchEvidence } from "../src/srd.js";
import type { Brief, EvidenceItem } from "../src/types.js";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const brief = JSON.parse(readFileSync(join(FIX, "sample-brief.json"), "utf8")) as Brief;
const evidence = JSON.parse(readFileSync(join(FIX, "sample-evidence.json"), "utf8")) as EvidenceItem[];

describe("matchEvidence", () => {
  it("returns the evidence ids sharing the most keywords with the text", () => {
    const ids = matchEvidence("full-text search typo tolerance", evidence, 2);
    expect(ids[0]).toBe("E3"); // the Meilisearch docs item mentions full-text search + typo tolerance
  });
  it("can restrict to specific sources", () => {
    const ids = matchEvidence("Pocket Instapaper", evidence, 2, ["market"]);
    expect(ids).toEqual(["E1"]);
  });
  it("matches on whole tokens, not substrings (data ≠ database)", () => {
    const ev = [{ id: "E1", source: "docs", title: "t", ref: "r", score: 1, snippet: "database migration tooling" }] as EvidenceItem[];
    expect(matchEvidence("data", ev, 1)).toEqual([]); // 'data' must not match 'database'
    expect(matchEvidence("database", ev, 1)).toEqual(["E1"]);
  });
  it("drops weak single-generic-token matches via the coverage floor", () => {
    const ev = [{ id: "E1", source: "docs", title: "t", ref: "r", score: 1, snippet: "the system handles a user without delay" }] as EvidenceItem[];
    // 'performance latency throughput concurrency' shares only the generic 'system'? none → no grounding
    expect(matchEvidence("performance latency throughput concurrency scalability", ev, 1)).toEqual([]);
  });
  it("de-duplicates by URL so two excerpts of one page never both cite", () => {
    const ev = [
      { id: "E1", source: "docs", title: "p1", ref: "u", url: "https://x/doc", score: 2, snippet: "full text search index" },
      { id: "E2", source: "docs", title: "p2", ref: "u", url: "https://x/doc", score: 1, snippet: "full text search ranking" },
    ] as EvidenceItem[];
    expect(matchEvidence("full text search", ev, 2)).toEqual(["E1"]);
  });
});

describe("buildSRD", () => {
  it("derives one FR per feature with sequential ids and matched evidence", () => {
    const srd = buildSRD(brief, evidence, { level: "light", generatedAt: "T" });
    expect(srd.functional).toHaveLength(brief.featureWishlist.length);
    expect(srd.functional.map((f) => f.id)).toEqual(["FR-001", "FR-002", "FR-003", "FR-004", "FR-005"]);
    // the search FR should ground on the Meilisearch docs evidence
    const search = srd.functional.find((f) => /search/i.test(f.title))!;
    expect(search.rationaleEvidence).toContain("E3");
  });

  it("adds a failure-path acceptance criterion only at the complex level", () => {
    const light = buildSRD(brief, evidence, { level: "light", generatedAt: "T" });
    const complex = buildSRD(brief, evidence, { level: "complex", generatedAt: "T" });
    expect(light.functional[0]!.acceptance).toHaveLength(1);
    expect(complex.functional[0]!.acceptance).toHaveLength(2);
  });

  it("includes the required NFR categories for the level", () => {
    const cats = (lvl: "light" | "complex") =>
      buildSRD(brief, evidence, { level: lvl, generatedAt: "T" }).nonFunctional.map((n) => n.category.toLowerCase());
    expect(cats("light")).toEqual(expect.arrayContaining(["performance", "security", "reliability"]));
    expect(cats("complex")).toEqual(expect.arrayContaining(["usability", "observability", "cost"]));
  });

  it("builds a traceability row per FR and a non-empty evidence index", () => {
    const srd = buildSRD(brief, evidence, { level: "complex", generatedAt: "T" });
    expect(srd.traceability).toHaveLength(srd.functional.length);
    expect(srd.evidenceIndex.length).toBeGreaterThan(0);
    // every FR references NFR ids that exist
    const nfrIds = new Set(srd.nonFunctional.map((n) => n.id));
    for (const fr of srd.functional) for (const n of fr.nfrs) expect(nfrIds.has(n)).toBe(true);
  });

  it("is deterministic for the same inputs", () => {
    const a = buildSRD(brief, evidence, { level: "complex", generatedAt: "T" });
    const b = buildSRD(brief, evidence, { level: "complex", generatedAt: "T" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("uses a grammatical, neutral actor — never 'a <plural persona>'", () => {
    const plural: Brief = { ...brief, product: { ...brief.product, name: "Readpile", users: ["privacy-conscious freelancers and consultants"] } };
    const srd = buildSRD(plural, evidence, { level: "complex", generatedAt: "T" });
    const json = JSON.stringify(srd);
    expect(json).not.toMatch(/a privacy-conscious freelancers/);
    expect(srd.functional[0]!.acceptance[0]!.given).toMatch(/available to a user/);
  });

  it("links a privacy/GDPR feature to the privacy NFR (not just the core three)", () => {
    const b: Brief = {
      ...brief,
      nfrPriorities: ["privacy"],
      featureWishlist: [{ title: "Export and delete personal data on request", priority: "must", notes: "GDPR data-subject rights." }],
    };
    const srd = buildSRD(b, evidence, { level: "complex", generatedAt: "T" });
    const privacy = srd.nonFunctional.find((n) => n.category === "privacy")!;
    expect(srd.functional[0]!.nfrs).toContain(privacy.id);
  });

  it("collapses an OSS seed and its resolved-repo evidence into one landscape row", () => {
    const ev = [
      { id: "E1", source: "oss", title: "omnivore-app/omnivore — prior art", ref: "omnivore-app/omnivore", url: "https://github.com/omnivore-app/omnivore", score: 9, snippet: "A self-hosted read-it-later app." },
    ] as EvidenceItem[];
    const b: Brief = { ...brief, ossSeeds: ["https://github.com/omnivore-app/omnivore"] };
    const srd = buildSRD(b, ev, { level: "light", generatedAt: "T" });
    const rows = srd.competitive.oss.filter((o) => /omnivore/i.test(o.name));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.evidence).toContain("E1");
  });

  it("specialises NFR metrics from the brief (compliance + time goals)", () => {
    const srd = buildSRD(brief, evidence, { level: "complex", generatedAt: "T" });
    const security = srd.nonFunctional.find((n) => n.category === "security")!;
    // sample brief has no compliance; this only asserts the metric stays concrete
    expect(security.metric).toBeTruthy();
    const withGoal: Brief = { ...brief, goals: ["re-find any article in under 5 seconds"], constraints: { ...brief.constraints, compliance: ["GDPR"] } };
    const s2 = buildSRD(withGoal, evidence, { level: "complex", generatedAt: "T" });
    expect(s2.nonFunctional.find((n) => n.category === "security")!.metric).toMatch(/GDPR/);
    expect(s2.nonFunctional.find((n) => n.category === "performance")!.metric).toMatch(/under 5 second/i);
  });
});
