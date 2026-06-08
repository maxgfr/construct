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
});
