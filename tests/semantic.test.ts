import { describe, it, expect } from "vitest";
import { chunkText, cosine } from "../src/research/semantic.js";

describe("chunkText", () => {
  it("splits content into overlapping line windows", () => {
    const content = Array.from({ length: 150 }, (_, i) => `line ${i + 1}`).join("\n");
    const chunks = chunkText("a.ts", content, false, { windowLines: 60, overlap: 12 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toMatchObject({ rel: "a.ts", start: 1, isDoc: false });
    expect(chunks[1]!.start).toBe(49);
    expect(chunks[1]!.start).toBeLessThan(chunks[0]!.end);
  });

  it("skips trivially short content and caps per file", () => {
    expect(chunkText("a.ts", "   ", false)).toEqual([]);
    const big = Array.from({ length: 5000 }, (_, i) => `x${i}`).join("\n");
    expect(chunkText("a.ts", big, false, { maxPerFile: 5 }).length).toBeLessThanOrEqual(5);
  });
});

describe("cosine", () => {
  it("is 1 for identical direction, 0 for orthogonal, 0 for empty/mismatched", () => {
    expect(cosine([1, 0], [2, 0])).toBeCloseTo(1, 6);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 6);
    expect(cosine([], [])).toBe(0);
    expect(cosine([1, 2], [1, 2, 3])).toBe(0);
  });
});
