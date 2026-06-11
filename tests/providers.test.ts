import { describe, it, expect } from "vitest";
import { rerank } from "../src/providers/github.js";
import { providerFor } from "../src/providers/registry.js";
import type { EvidenceItem } from "../src/types.js";

type RawItem = Omit<EvidenceItem, "id">;

const item = (ref: string, title: string, snippet: string, score = 1): RawItem => ({
  source: "pr",
  title,
  ref,
  snippet,
  score,
});

describe("github rerank", () => {
  it("ranks items by how many query keywords they mention", () => {
    const items = [
      item("pr#1", "Added documentation for goal attribution", "docs only", 1),
      item("pr#2", "Force cookieless tracking option", "adds cookieless tracking consent", 1),
      item("pr#3", "Tracker tweak", "minor tracking change", 1),
    ];
    const ranked = ["cookieless", "tracking", "consent", "tracker"];
    const out = rerank(items, ranked);
    expect(out[0]!.ref).toBe("pr#2");
    expect(out[out.length - 1]!.ref).toBe("pr#1");
  });

  it("breaks coverage ties by GitHub score", () => {
    const items = [item("pr#1", "tracking a", "x", 2), item("pr#2", "tracking b", "y", 9)];
    const out = rerank(items, ["tracking"]);
    expect(out[0]!.ref).toBe("pr#2");
  });
});

describe("providerFor", () => {
  it("selects github, gitlab, or the generic fallback by host", () => {
    expect(providerFor("github.com").name).toBe("github");
    expect(providerFor("gitlab.com").name).toBe("gitlab");
    expect(providerFor("bitbucket.org").name).toBe("generic");
  });
});
