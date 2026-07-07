import { describe, it, expect } from "vitest";
import { normalizeSeed } from "../src/research/oss.js";

// Regression guard for the OSS seed-normalisation bugs: the old two-regex filter
// silently dropped valid non-github/gitlab URLs and scp-form seeds, and handed
// deep github URLs to resolveRepo raw (mis-parsing owner/repo). Uses the REAL
// resolveRepo (no clone mock in this file).
describe("normalizeSeed", () => {
  it("keeps a non-github/gitlab full URL the old filter dropped", () => {
    expect(normalizeSeed("https://bitbucket.org/o/r")).toBe("https://bitbucket.org/o/r");
  });

  it("keeps a self-hosted GitLab URL", () => {
    expect(normalizeSeed("https://gitlab.example.com/group/sub/repo")).toBe("https://gitlab.example.com/group/sub/repo");
  });

  it("keeps an scp-form seed (git@host:owner/repo.git)", () => {
    expect(normalizeSeed("git@github.com:o/r.git")).toBe("git@github.com:o/r.git");
  });

  it("preserves a gitlab.com subgroup URL whole rather than collapsing it", () => {
    expect(normalizeSeed("https://gitlab.com/group/sub/repo")).toBe("https://gitlab.com/group/sub/repo");
  });

  it("canonicalises a deep github URL to owner/repo (was mis-parsed as owner=a/b/tree)", () => {
    expect(normalizeSeed("https://github.com/facebook/react/tree/main")).toBe("https://github.com/facebook/react");
  });

  it("drops a github site section that is not a repo", () => {
    expect(normalizeSeed("https://github.com/topics/bookmarks")).toBeUndefined();
  });

  it("keeps host/owner/repo and bare owner/repo shorthand", () => {
    expect(normalizeSeed("github.com/o/r")).toBe("github.com/o/r");
    expect(normalizeSeed("owner/repo")).toBe("owner/repo");
  });

  it("drops free text and blank seeds", () => {
    expect(normalizeSeed("just some idea, not a repo")).toBeUndefined();
    expect(normalizeSeed("   ")).toBeUndefined();
  });
});
