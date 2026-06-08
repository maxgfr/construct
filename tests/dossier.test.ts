import { describe, it, expect } from "vitest";
import { assignIds, renderEvidenceMarkdown } from "../src/research/dossier.js";
import type { SourceResult, DossierMeta } from "../src/types.js";

const results: SourceResult[] = [
  {
    source: "docs",
    items: [{ source: "docs", title: "Meili docs", ref: "https://meili", score: 1, snippet: "search" }],
    notes: [],
  },
  {
    source: "market",
    items: [
      { source: "market", title: "low", ref: "b.com", score: 2, snippet: "x" },
      { source: "market", title: "high", ref: "a.com", score: 9, snippet: "y" },
    ],
    notes: ["a note"],
  },
];

describe("assignIds", () => {
  it("orders market before docs and sorts by score within a source", () => {
    const ev = assignIds(results);
    expect(ev.map((e) => e.id)).toEqual(["E1", "E2", "E3"]);
    expect(ev[0]).toMatchObject({ id: "E1", source: "market", ref: "a.com" });
    expect(ev[1]).toMatchObject({ id: "E2", source: "market", ref: "b.com" });
    expect(ev[2]).toMatchObject({ id: "E3", source: "docs" });
  });
});

describe("renderEvidenceMarkdown", () => {
  it("renders the idea, grouped sections and citable ids", () => {
    const ev = assignIds(results);
    const meta: DossierMeta = {
      idea: "a read-later app",
      angles: ["market", "tech"],
      sources: ["market", "docs"],
      semantic: false,
      evidenceCount: ev.length,
      builtAt: "now",
      notes: ["a note"],
    };
    const md = renderEvidenceMarkdown(ev, meta);
    expect(md).toContain("**Idea:** a read-later app");
    expect(md).toContain("## Market & competitors");
    expect(md).toContain("## Technology documentation");
    expect(md).toContain("[E1]");
    expect(md).toContain("Retrieval notes");
  });
});
