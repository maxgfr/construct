import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { languageHistogram, canonicalRepoUrl } from "../src/research/oss.js";

// A fixed on-disk "clone" the mocked ensureClone returns. The hoisted constant
// is referenced by the mock factory below.
const { REPO_DIR } = vi.hoisted(() => ({ REPO_DIR: `/tmp/construct-oss-test-${process.pid}` }));

vi.mock("../src/clone.js", () => ({
  resolveRepo: (raw: string) => ({
    raw,
    host: "github.com",
    owner: "o",
    repo: "r",
    webUrl: "https://github.com/o/r",
    cloneUrl: "https://github.com/o/r.git",
    isLocal: false,
    slug: "github.com-o-r",
  }),
  ensureClone: vi.fn(() => REPO_DIR),
}));

vi.mock("../src/providers/registry.js", () => ({
  providerFor: () => ({
    name: "github",
    matches: () => true,
    search: async (_ref: unknown, _q: string, kind: "issue" | "pr") => ({
      items: [{ source: kind, title: `#1 ${kind} pitfall`, ref: `${kind}#1`, score: 0, snippet: "import of a large export times out" }],
      notes: [],
    }),
  }),
}));

// Import AFTER the mocks are registered.
import { ossAngle } from "../src/research/oss.js";
import { ensureClone } from "../src/clone.js";
import type { ResearchContext } from "../src/types.js";

function ctx(): ResearchContext {
  return {
    brief: {
      schemaVersion: 1,
      idea: "a self-hosted read-it-later app with search",
      product: {},
      goals: [],
      nonGoals: [],
      constraints: {},
      candidateTech: [],
      competitors: [],
      ossSeeds: ["https://github.com/o/r"],
      featureWishlist: [],
      nfrPriorities: [],
      openQuestions: [],
      createdAt: "",
    },
    runDir: "/tmp/x",
    angles: ["oss"],
    query: "",
    webEngine: "auto",
    semantic: false,
    perSource: 6,
    refresh: false,
  };
}

beforeEach(() => {
  mkdirSync(REPO_DIR, { recursive: true });
  writeFileSync(join(REPO_DIR, "README.md"), "# r\n\nA self-hosted read-it-later app with full-text search and tagging.\n");
  writeFileSync(join(REPO_DIR, "index.ts"), "export const x = 1;\n");
  writeFileSync(join(REPO_DIR, "server.ts"), "export const y = 2;\n");
  vi.mocked(ensureClone).mockImplementation(() => REPO_DIR);
});
afterEach(() => {
  rmSync(REPO_DIR, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe("helpers", () => {
  it("canonicalRepoUrl trims deep paths and .git", () => {
    expect(canonicalRepoUrl("https://github.com/o/r/tree/main/src")).toBe("https://github.com/o/r");
    expect(canonicalRepoUrl("https://github.com/o/r.git")).toBe("https://github.com/o/r");
    expect(canonicalRepoUrl("https://example.com/x")).toBeUndefined();
  });
  it("languageHistogram counts by extension, most first", () => {
    const h = languageHistogram([{ ext: ".ts" }, { ext: ".ts" }, { ext: ".md" }]);
    expect(h[0]).toEqual(["ts", 2]);
  });
});

describe("ossAngle", () => {
  it("fingerprints the cloned repo and mines issues + PRs", async () => {
    const r = await ossAngle(ctx());
    const oss = r[0]!, issues = r[1]!, prs = r[2]!;
    expect(oss.source).toBe("oss");
    expect(oss.items).toHaveLength(1);
    expect(oss.items[0]!.snippet).toMatch(/Languages: ts:2/);
    expect(oss.items[0]!.snippet).toMatch(/read-it-later/i); // README excerpt
    expect(issues.items[0]!.ref).toBe("issue#1");
    expect(prs.items[0]!.ref).toBe("pr#1");
  });

  it("survives a clone failure but still mines issues/PRs", async () => {
    vi.mocked(ensureClone).mockImplementation(() => {
      throw new Error("clone failed");
    });
    const r = await ossAngle(ctx());
    const oss = r[0]!, issues = r[1]!;
    expect(oss.items).toHaveLength(0);
    expect(oss.notes.join(" ")).toMatch(/Could not clone/);
    expect(issues.items).toHaveLength(1); // owner/repo still resolved → providers ran
  });
});
