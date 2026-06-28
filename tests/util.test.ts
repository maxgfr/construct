import { describe, it, expect } from "vitest";
import { keywords, rankedKeywords, slugify } from "../src/util.js";

describe("keywords", () => {
  it("drops stopwords and short noise, keeps identifiers", () => {
    const k = keywords("How does the retryRequest function handle a 429 status?");
    expect(k).toContain("retryRequest");
    expect(k).toContain("429");
    expect(k).toContain("status");
    expect(k).not.toContain("the");
    expect(k).not.toContain("does");
  });
  it("dedupes case-insensitively but preserves original token", () => {
    const k = keywords("Backoff backoff BACKOFF");
    expect(k).toEqual(["Backoff"]);
  });
});

describe("rankedKeywords", () => {
  it("ranks numbers and long/identifier tokens before short generic words", () => {
    const r = rankedKeywords("retry on 429 rate limit exponential backoff");
    expect(r[0]).toBe("429");
    expect(r.indexOf("exponential")).toBeLessThan(r.indexOf("rate"));
  });
});

describe("slugify", () => {
  it("normalizes a repo URL into a filesystem-safe slug", () => {
    expect(slugify("https://github.com/expressjs/express.git")).toBe("github.com-expressjs-express");
    expect(slugify("git@github.com:a/b.git")).toBe("github.com-a-b");
  });
});
