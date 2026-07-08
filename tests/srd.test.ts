import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildSRD, matchEvidence, mentionsEntity, deriveA11yStandard } from "../src/srd.js";
import { DESIGN_TOKEN_CATEGORIES } from "../src/types.js";
import type { Brief, EvidenceItem } from "../src/types.js";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const brief = JSON.parse(readFileSync(join(FIX, "sample-brief.json"), "utf8")) as Brief;
const modulesBrief = JSON.parse(readFileSync(join(FIX, "sample-brief-modules.json"), "utf8")) as Brief;
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
  it("de-duplicates url-less items on source:ref (two excerpts of one local repo)", () => {
    const ev = [
      { id: "E1", source: "oss", title: "repo summary", ref: "acme/reader", score: 2, snippet: "full text search index" },
      { id: "E2", source: "oss", title: "repo readme", ref: "acme/reader", score: 1, snippet: "full text search ranking" },
    ] as EvidenceItem[];
    expect(matchEvidence("full text search", ev, 2)).toEqual(["E1"]);
  });
  it("keeps url-less items with distinct refs apart", () => {
    const ev = [
      { id: "E1", source: "oss", title: "repo a", ref: "acme/reader", score: 2, snippet: "full text search index" },
      { id: "E2", source: "oss", title: "repo b", ref: "acme/clipper", score: 1, snippet: "full text search ranking" },
    ] as EvidenceItem[];
    expect(matchEvidence("full text search", ev, 2)).toEqual(["E1", "E2"]);
  });
});

describe("mentionsEntity", () => {
  const item = (text: string) => ({ id: "E1", source: "market", title: "", ref: "r", score: 1, snippet: text }) as EvidenceItem;

  it("matches the whole name as a word-bounded, case-insensitive phrase", () => {
    expect(mentionsEntity("Pocket", item("Pocket lets you save articles"))).toBe(true);
    expect(mentionsEntity("pocket", item("Compare POCKET and others"))).toBe(true);
    expect(mentionsEntity("Money Wave", item("We benchmarked Money Wave against Mint"))).toBe(true);
  });

  it("does not match inside a larger word", () => {
    expect(mentionsEntity("Wave", item("microwave ovens on sale"))).toBe(false);
    expect(mentionsEntity("Mint", item("badminton rackets"))).toBe(false);
  });

  it("does not treat token overlap as a mention", () => {
    expect(mentionsEntity("Money Wave", item("a new wave of money apps"))).toBe(false);
  });

  it("handles punctuation-bearing names literally", () => {
    expect(mentionsEntity("Next.js", item("Choosing Next.js for the frontend"))).toBe(true);
    expect(mentionsEntity("Next.js", item("what comes next js-wise"))).toBe(false);
  });

  it("checks the title as well as the snippet", () => {
    expect(mentionsEntity("Pocket", { id: "E1", source: "market", title: "Pocket review", ref: "r", score: 1, snippet: "save it" } as EvidenceItem)).toBe(true);
  });
});

describe("buildSRD — competitor grounding requires a literal mention (no citation washing)", () => {
  const listicle = [
    {
      id: "E1",
      source: "market",
      title: "Best read-later apps",
      ref: "https://x/listicle",
      url: "https://x/listicle",
      score: 2,
      snippet: "Pocket lets you save articles for later. A new wave of money apps also bundle reading lists.",
    },
  ] as EvidenceItem[];
  const washBrief: Brief = { ...brief, competitors: ["Pocket", "Money Wave"] };

  it("keeps the citation for a competitor the evidence literally names", () => {
    const srd = buildSRD(washBrief, listicle, { level: "light", generatedAt: "T" });
    const pocket = srd.competitive.competitors.find((c) => c.name === "Pocket")!;
    expect(pocket.evidence).toEqual(["E1"]);
  });

  it("attaches nothing when the name is only token-overlapped, never mentioned", () => {
    const srd = buildSRD(washBrief, listicle, { level: "light", generatedAt: "T" });
    const wave = srd.competitive.competitors.find((c) => c.name === "Money Wave")!;
    expect(wave.evidence).toEqual([]); // "wave … money" overlap ≠ a mention of Money Wave
    expect(wave.note).toMatch(/Comparable product/); // falls back to the generic note, not E1's digest
  });
});

describe("buildSRD — integration detection is word-bounded", () => {
  // A neutral brief so ONLY the injected feature titles drive boundary/integration
  // detection (idea + candidateTech are emptied out of the haystack).
  const clean = (features: Brief["featureWishlist"]): Brief => ({
    ...brief,
    idea: "a simple app",
    candidateTech: [],
    competitors: [],
    featureWishlist: features,
  });
  const build = (features: Brief["featureWishlist"]) => buildSRD(clean(features), evidence, { level: "complex", generatedAt: "T" });

  it("does not fabricate an external-service dependency or integration ADR from analytics/historical", () => {
    const srd = build([
      { title: "View analytics dashboard", priority: "must" },
      { title: "Show historical trends", priority: "should" },
    ]);
    // The must-have FR's failure-path criterion must be the invalid-input path,
    // not a fabricated "external service … is unreachable" dependency.
    const acceptance = srd.functional.flatMap((f) => f.acceptance.map((a) => `${a.given} ${a.then}`)).join(" ");
    expect(acceptance).not.toMatch(/external service/i);
    const ifaceNames = srd.architecture.interfaces.map((i) => i.name).join(" ");
    expect(ifaceNames).not.toMatch(/Google|Payments|Email|SMS|Widget|Webhook|Calendar/);
  });

  it("does not fabricate a payments interface from 'pinstripe' or a widget from 'Embedded'", () => {
    const srd = build([
      { title: "Pinstripe visual theme", priority: "should" },
      { title: "Embedded code editor", priority: "should" },
    ]);
    const ifaceNames = srd.architecture.interfaces.map((i) => i.name).join(" ");
    expect(ifaceNames).not.toMatch(/Payments/);
    expect(ifaceNames).not.toMatch(/Widget/);
  });

  it("still detects a real integration when the trigger word actually appears", () => {
    const srd = build([{ title: "Sync events with Google Calendar", priority: "must" }]);
    const ifaceNames = srd.architecture.interfaces.map((i) => i.name).join(" ");
    expect(ifaceNames).toMatch(/Calendar Integration|Google API Integration/);
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
    const cats = (lvl: "light" | "complex") => buildSRD(brief, evidence, { level: lvl, generatedAt: "T" }).nonFunctional.map((n) => n.category.toLowerCase());
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
      {
        id: "E1",
        source: "oss",
        title: "omnivore-app/omnivore — prior art",
        ref: "omnivore-app/omnivore",
        url: "https://github.com/omnivore-app/omnivore",
        score: 9,
        snippet: "A self-hosted read-it-later app.",
      },
    ] as EvidenceItem[];
    const b: Brief = { ...brief, ossSeeds: ["https://github.com/omnivore-app/omnivore"] };
    const srd = buildSRD(b, ev, { level: "light", generatedAt: "T" });
    const rows = srd.competitive.oss.filter((o) => /omnivore/i.test(o.name));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.evidence).toContain("E1");
  });

  it("derives a concrete acceptance outcome from the notes without a double-modal or leaked ';'", () => {
    const b: Brief = { ...brief, featureWishlist: [{ title: "User login", priority: "must", notes: "The user must authenticate with email and password." }] };
    const then = buildSRD(b, evidence, { level: "light", generatedAt: "T" }).functional[0]!.acceptance[0]!.then;
    expect(then).toMatch(/authenticate with email and password/);
    expect(then).not.toMatch(/and must authenticate/); // no double-modal
    const b2: Brief = { ...brief, featureWishlist: [{ title: "Durability", priority: "must", notes: "Data is always consistent; durable." }] };
    const then2 = buildSRD(b2, evidence, { level: "light", generatedAt: "T" }).functional[0]!.acceptance[0]!.then;
    expect(then2).not.toContain(";"); // the mid-string ';' must not leak
  });

  it("keeps a genuinely short first sentence in OSS notes (does not merge sentences)", () => {
    const ev = [
      {
        id: "E1",
        source: "oss",
        title: "acme/widget — prior art",
        ref: "acme/widget",
        url: "https://github.com/acme/widget",
        score: 5,
        snippet: "It is fast. The internals use a custom index for full-text search.",
      },
    ] as EvidenceItem[];
    const b: Brief = { ...brief, ossSeeds: [] };
    const note = buildSRD(b, ev, { level: "light", generatedAt: "T" }).competitive.oss[0]!.note;
    expect(note).toBe("It is fast.");
  });

  it("infers core entities from feature titles and closes FR.entities symmetrically", () => {
    const srd = buildSRD(brief, evidence, { level: "complex", generatedAt: "T" });
    const article = srd.architecture.dataModel.find((e) => e.name === "Article");
    expect(article).toBeDefined();
    expect(article!.referencedByFRs).toContain("FR-001");
    expect(article!.attributes.map((a) => a.name)).toEqual(["id", "createdAt"]);
    // symmetric closure: every FR.entities name exists in the data model
    const names = new Set(srd.architecture.dataModel.map((e) => e.name));
    for (const fr of srd.functional) for (const e of fr.entities) expect(names.has(e)).toBe(true);
    // brand/tech names never become entities
    expect(names.has("Pocket")).toBe(false);
    expect(names.has("Instapaper")).toBe(false);
  });

  it("infers an interface per external boundary plus the primary UI surface", () => {
    const srd = buildSRD(brief, evidence, { level: "complex", generatedAt: "T" });
    const ifaces = srd.architecture.interfaces;
    const web = ifaces.find((i) => i.name === "Web App");
    expect(web).toBeDefined();
    expect(web!.kind).toBe("ui");
    expect(web!.relatedFRs).toEqual(srd.functional.map((f) => f.id));
    // "browser extension" in FR-001 is a detected boundary
    const ext = ifaces.find((i) => i.name === "Browser Extension");
    expect(ext).toBeDefined();
    expect(ext!.relatedFRs).toContain("FR-001");
    // symmetric closure: every FR.interfaces name exists
    const names = new Set(ifaces.map((i) => i.name));
    for (const fr of srd.functional) for (const i of fr.interfaces) expect(names.has(i)).toBe(true);
  });

  it("derives a testable Then from a numeric bound in the notes", () => {
    const b: Brief = {
      ...brief,
      featureWishlist: [{ title: "Bulk import", priority: "must", notes: "Handles exports of up to 10000 articles without timing out." }],
    };
    const then = buildSRD(b, evidence, { level: "light", generatedAt: "T" }).functional[0]!.acceptance[0]!.then;
    expect(then).toMatch(/up to 10000 articles/);
  });

  it("specialises the cost metric from the budget constraint", () => {
    const srd = buildSRD(brief, evidence, { level: "complex", generatedAt: "T" });
    const cost = srd.nonFunctional.find((n) => n.category === "cost")!;
    expect(cost.metric).toMatch(/side-project, near-zero infra budget/);
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

describe("buildSRD design system", () => {
  it("omits the design block unless explicitly requested", () => {
    expect(buildSRD(brief, evidence, { level: "complex", generatedAt: "T" }).design).toBeUndefined();
    expect(buildSRD(brief, evidence, { level: "light", generatedAt: "T" }).design).toBeUndefined();
  });

  it("seeds a complete, internally-consistent design system when requested", () => {
    const srd = buildSRD(brief, evidence, { level: "complex", generatedAt: "T", design: true });
    const ds = srd.design!;
    expect(ds).toBeDefined();
    expect(ds.principles.length).toBeGreaterThanOrEqual(3);
    expect(ds.principles.length).toBeLessThanOrEqual(5);

    // every required token category is present
    const cats = new Set(ds.tokens.map((t) => t.category));
    for (const c of DESIGN_TOKEN_CATEGORIES) expect(cats.has(c), c).toBe(true);

    // components carry the interaction-state checklist and resolve to real FRs
    const frIds = new Set(srd.functional.map((f) => f.id));
    expect(ds.components.length).toBeGreaterThan(0);
    for (const c of ds.components) {
      expect(c.states.length).toBeGreaterThan(0);
      for (const id of c.relatedFRs) expect(frIds.has(id), `${c.name} → ${id}`).toBe(true);
    }
    // a search component traces to the full-text-search FR
    const search = ds.components.find((c) => /search/i.test(c.name))!;
    expect(search.relatedFRs).toContain("FR-002");

    // screens and flows resolve to real FRs
    for (const s of ds.screens) for (const id of s.relatedFRs) expect(frIds.has(id)).toBe(true);
    for (const f of ds.flows) for (const id of f.frIds) expect(frIds.has(id)).toBe(true);

    // accessibility block defaults to WCAG 2.2 AA with testable criteria
    expect(ds.accessibility.standard).toBe("WCAG 2.2 AA");
    expect(ds.accessibility.requirements.length).toBeGreaterThan(0);
    for (const r of ds.accessibility.requirements) expect(r.acceptance.length).toBeGreaterThan(0);
  });

  it("derives the accessibility standard from the brief, defaulting to WCAG 2.2 AA", () => {
    expect(deriveA11yStandard(brief)).toBe("WCAG 2.2 AA");
    // an explicit target wins, even over a conflicting compliance signal
    expect(deriveA11yStandard({ ...brief, design: { accessibilityTarget: "RGAA 4.1" } })).toBe("RGAA 4.1");
    expect(
      deriveA11yStandard({ ...brief, design: { accessibilityTarget: "Custom A11y Std" }, constraints: { ...brief.constraints, compliance: ["RGAA"] } }),
    ).toBe("Custom A11y Std");
    // recognised standards map to the full, exact string (guards a mistyped WCAG version)
    expect(deriveA11yStandard({ ...brief, constraints: { ...brief.constraints, compliance: ["RGAA"] } })).toBe("RGAA 4.1 (aligned to WCAG 2.2 AA)");
    expect(deriveA11yStandard({ ...brief, nfrPriorities: [...brief.nfrPriorities, "Section 508"] })).toBe("Section 508 (WCAG 2.0 AA)");
    expect(deriveA11yStandard({ ...brief, constraints: { ...brief.constraints, compliance: ["EN 301 549"] } })).toBe("EN 301 549 (WCAG 2.1 AA)");
  });

  it("weaves component/screen traceability into the matrix only when design is present", () => {
    const withDesign = buildSRD(brief, evidence, { level: "complex", generatedAt: "T", design: true });
    const fr001 = withDesign.traceability.find((r) => r.fr === "FR-001")!;
    expect(fr001.components?.length).toBeGreaterThan(0);
    expect(fr001.screens?.length).toBeGreaterThan(0);

    const noDesign = buildSRD(brief, evidence, { level: "complex", generatedAt: "T" });
    expect(noDesign.traceability[0]!.components).toBeUndefined();
    expect(noDesign.traceability[0]!.screens).toBeUndefined();
  });

  it("is deterministic with the design block", () => {
    const a = buildSRD(brief, evidence, { level: "complex", generatedAt: "T", design: true });
    const b = buildSRD(brief, evidence, { level: "complex", generatedAt: "T", design: true });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("buildSRD — modules mode", () => {
  const srd = () => buildSRD(modulesBrief, evidence, { level: "complex", generatedAt: "T" });

  it("carries each feature's module onto its FR", () => {
    expect(srd().functional.map((f) => f.module)).toEqual(["capture", "search", "library", "capture", "library"]);
  });

  it("computes srd.modules with per-module frIds and dependsOn", () => {
    const mods = srd().modules!;
    expect(mods.map((m) => m.id)).toEqual(["capture", "search", "library"]);
    expect(mods.find((m) => m.id === "capture")).toEqual({
      id: "capture",
      name: "Capture",
      description: "Getting content into the archive: saving, extraction, imports.",
      frIds: ["FR-001", "FR-004"],
      dependsOn: [],
    });
    expect(mods.find((m) => m.id === "search")!.dependsOn).toEqual(["capture"]);
    expect(mods.find((m) => m.id === "library")!.frIds).toEqual(["FR-003", "FR-005"]);
  });

  it("keeps srd.modules and FR.module absent without declared modules (byte-identical)", () => {
    const plain = buildSRD(brief, evidence, { level: "complex", generatedAt: "T" });
    expect(plain.modules).toBeUndefined();
    expect("module" in plain.functional[0]!).toBe(false);
    expect(plain.traceability[0]!.module).toBeUndefined();
  });

  it("sets the module on each traceability row", () => {
    expect(srd().traceability.map((r) => r.module)).toEqual(["capture", "search", "library", "capture", "library"]);
  });
});

describe("boundary detection — word boundaries", () => {
  it("does not hallucinate a Calendar Integration from 'metrics' or 'historical'", () => {
    const b: Brief = {
      ...brief,
      candidateTech: [],
      featureWishlist: [
        { title: "Declare audience metrics per platform", priority: "must" },
        { title: "View historical earnings", priority: "should" },
      ],
    };
    const s = buildSRD(b, evidence, { level: "complex", generatedAt: "T" });
    expect(s.architecture.interfaces.map((i) => i.name)).not.toContain("Calendar Integration");
  });

  it("still detects a real calendar boundary", () => {
    const b: Brief = {
      ...brief,
      featureWishlist: [{ title: "Sync bookings to Google Calendar", priority: "must", notes: "two-way iCal sync" }],
    };
    const s = buildSRD(b, evidence, { level: "complex", generatedAt: "T" });
    expect(s.architecture.interfaces.map((i) => i.name)).toContain("Calendar Integration");
  });
});
