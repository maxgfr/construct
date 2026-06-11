import { describe, it, expect, vi, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAngles, runResearch } from "../src/research/registry.js";
import { marketAngle } from "../src/research/market.js";
import { ossAngle } from "../src/research/oss.js";
import { techAngle } from "../src/research/tech.js";
import { semanticRescore } from "../src/research/semantic.js";
import type { RawItem, ResearchContext } from "../src/types.js";

vi.mock("../src/research/market.js", () => ({ marketAngle: vi.fn() }));
vi.mock("../src/research/oss.js", () => ({ ossAngle: vi.fn() }));
vi.mock("../src/research/tech.js", () => ({ techAngle: vi.fn() }));
vi.mock("../src/research/semantic.js", () => ({ semanticRescore: vi.fn() }));

const dirs: string[] = [];
afterEach(() => {
  vi.clearAllMocks();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function item(title: string, score: number): RawItem {
  return { source: "market", title, ref: title, score, snippet: `${title} snippet` };
}

function ctx(over: Partial<ResearchContext> = {}): ResearchContext {
  return {
    brief: {
      schemaVersion: 1,
      idea: "an idea",
      product: {},
      goals: [],
      nonGoals: [],
      constraints: {},
      candidateTech: [],
      competitors: [],
      ossSeeds: [],
      featureWishlist: [],
      nfrPriorities: [],
      openQuestions: [],
      createdAt: "",
    },
    runDir: "/tmp/unused",
    angles: ["market", "oss"],
    query: "",
    webEngine: "auto",
    semantic: false,
    perSource: 6,
    refresh: false,
    ...over,
  };
}

describe("runAngles", () => {
  it("degrades a throwing angle to an honest note without losing the others", async () => {
    vi.mocked(marketAngle).mockRejectedValue(new Error("network partition"));
    vi.mocked(ossAngle).mockResolvedValue([{ source: "oss", items: [{ ...item("repo", 1), source: "oss" }], notes: [] }]);
    const { results } = await runAngles(ctx());
    const market = results.find((r) => r.source === "market")!;
    const oss = results.find((r) => r.source === "oss")!;
    expect(market.items).toEqual([]);
    expect(market.notes.join(" ")).toMatch(/market angle failed: network partition/);
    expect(oss.items).toHaveLength(1);
  });

  it("runs the semantic rescore when the angle is selected, folding its notes in", async () => {
    vi.mocked(techAngle).mockResolvedValue([{ source: "docs", items: [], notes: [] }]);
    vi.mocked(semanticRescore).mockResolvedValue({
      results: [{ source: "docs", items: [], notes: [] }],
      notes: ["semantic stack not reachable — lexical ranking kept"],
      available: false,
    } as never);
    const { notes } = await runAngles(ctx({ angles: ["tech", "semantic"] }));
    expect(vi.mocked(semanticRescore)).toHaveBeenCalledOnce();
    expect(notes.join(" ")).toMatch(/lexical ranking kept/);
  });
});

describe("runResearch", () => {
  it("caps items per source by score and writes the dossier files", async () => {
    const items = [item("low", 1), item("high", 9), item("mid", 5)];
    vi.mocked(marketAngle).mockResolvedValue([{ source: "market", items, notes: ["a note"] }]);
    vi.mocked(ossAngle).mockResolvedValue([{ source: "oss", items: [], notes: [] }]);
    const runDir = mkdtempSync(join(tmpdir(), "construct-registry-"));
    dirs.push(runDir);

    const r = await runResearch(ctx({ runDir, perSource: 2 }), "2026-01-01T00:00:00.000Z");
    expect(r.evidence.map((e) => e.title)).toEqual(["high", "mid"]); // top-2 by score
    expect(r.evidence.map((e) => e.id)).toEqual(["E1", "E2"]);
    expect(r.meta.notes).toContain("a note");
    expect(r.meta.builtAt).toBe("2026-01-01T00:00:00.000Z");
    for (const rel of ["evidence.json", "EVIDENCE.md", "meta.json"]) {
      expect(existsSync(join(runDir, "evidence", rel)), `${rel} should exist`).toBe(true);
    }
    const onDisk = JSON.parse(readFileSync(join(runDir, "evidence", "evidence.json"), "utf8"));
    expect(onDisk).toHaveLength(2);
  });
});
