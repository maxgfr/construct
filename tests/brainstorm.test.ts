import { describe, it, expect } from "vitest";
import { initBrainstorm, mergeBrainstorm, brainstormCounts, loadBrainstorm } from "../src/brainstorm.js";
import { initBrief } from "../src/brief.js";
import type { Brainstorm, BrainstormIdea, Brief } from "../src/types.js";

function idea(partial: Partial<BrainstormIdea>): BrainstormIdea {
  return { id: "B-001", angle: "feature", title: "an idea", status: "proposed", ...partial };
}
function bs(ideas: BrainstormIdea[]): Brainstorm {
  return { schemaVersion: 1, idea: "a habit tracker", createdAt: "T", ideas };
}
function freshBrief(): Brief {
  return initBrief("a habit tracker", "T");
}

describe("initBrainstorm", () => {
  it("seeds an empty brainstorm from the idea", () => {
    const b = initBrainstorm("  a read-later app ", "2026-01-01T00:00:00.000Z");
    expect(b.schemaVersion).toBe(1);
    expect(b.idea).toBe("a read-later app");
    expect(b.ideas).toEqual([]);
    expect(b.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("brainstormCounts", () => {
  it("counts ideas by status", () => {
    const c = brainstormCounts(bs([idea({ id: "B-001", status: "kept" }), idea({ id: "B-002", status: "parked" }), idea({ id: "B-003", status: "proposed" })]));
    expect(c).toEqual({ proposed: 1, kept: 1, parked: 1, rejected: 0 });
  });
});

describe("mergeBrainstorm — folding kept ideas into the brief", () => {
  const now = "2026-07-08T00:00:00.000Z";

  it("appends a kept featureWishlist idea with its priority and notes", () => {
    const warnings: string[] = [];
    const b = bs([idea({ id: "B-001", status: "kept", target: "featureWishlist", title: "Streak freeze", priority: "should", notes: "one skip a week" })]);
    const { brief, brainstorm, merged } = mergeBrainstorm(freshBrief(), b, now, (w) => warnings.push(w));
    expect(brief.featureWishlist).toContainEqual({ title: "Streak freeze", priority: "should", notes: "one skip a week" });
    expect(merged).toBe(1);
    expect(brainstorm.ideas[0]!.mergedAt).toBe(now);
  });

  it("defaults a kept featureWishlist idea's priority to could", () => {
    const b = bs([idea({ id: "B-001", status: "kept", target: "featureWishlist", title: "Dark mode" })]);
    const { brief } = mergeBrainstorm(freshBrief(), b, now);
    expect(brief.featureWishlist[0]!.priority).toBe("could");
  });

  it("appends a kept string-array target (competitors) deduped case-insensitively", () => {
    const brief = { ...freshBrief(), competitors: ["Habitica"] };
    const b = bs([
      idea({ id: "B-001", status: "kept", target: "competitors", title: "habitica" }),
      idea({ id: "B-002", status: "kept", target: "competitors", title: "Streaks" }),
    ]);
    const { brief: out } = mergeBrainstorm(brief, b, now);
    expect(out.competitors).toEqual(["Habitica", "Streaks"]); // the dupe is not re-added
  });

  it("folds an openQuestions idea as 'title — notes'", () => {
    const b = bs([idea({ id: "B-001", status: "kept", target: "openQuestions", title: "Pricing model", notes: "freemium vs one-time" })]);
    const { brief } = mergeBrainstorm(freshBrief(), b, now);
    expect(brief.openQuestions).toContain("Pricing model — freemium vs one-time");
  });

  it("moves a parked idea into openQuestions and stamps it merged", () => {
    const b = bs([idea({ id: "B-001", status: "parked", title: "Social leaderboards" })]);
    const { brief, parkedFolded, brainstorm } = mergeBrainstorm(freshBrief(), b, now);
    expect(brief.openQuestions.some((q) => /Social leaderboards/.test(q))).toBe(true);
    expect(parkedFolded).toBe(1);
    expect(brainstorm.ideas[0]!.mergedAt).toBe(now);
  });

  it("warns and skips a kept idea with no target (retryable — not stamped)", () => {
    const warnings: string[] = [];
    const b = bs([idea({ id: "B-001", status: "kept", target: undefined, title: "Vague" })]);
    const { brainstorm, skipped } = mergeBrainstorm(freshBrief(), b, now, (w) => warnings.push(w));
    expect(warnings.join(" ")).toMatch(/B-001.*no target/i);
    expect(skipped).toBeGreaterThan(0);
    expect(brainstorm.ideas[0]!.mergedAt).toBeUndefined(); // retry possible after setting a target
  });

  it("does not merge a goals idea that conflicts with an existing nonGoal", () => {
    const warnings: string[] = [];
    const brief = { ...freshBrief(), nonGoals: ["A social network"] };
    const b = bs([idea({ id: "B-001", status: "kept", target: "goals", title: "A social network" })]);
    const { brief: out, brainstorm } = mergeBrainstorm(brief, b, now, (w) => warnings.push(w));
    expect(out.goals).not.toContain("A social network");
    expect(warnings.join(" ")).toMatch(/conflict/i);
    expect(brainstorm.ideas[0]!.mergedAt).toBeUndefined(); // not stamped → resolvable later
  });

  it("leaves rejected and proposed ideas untouched", () => {
    const b = bs([
      idea({ id: "B-001", status: "rejected", target: "featureWishlist", title: "No" }),
      idea({ id: "B-002", status: "proposed", target: "featureWishlist", title: "Maybe" }),
    ]);
    const { brief, merged } = mergeBrainstorm(freshBrief(), b, now);
    expect(brief.featureWishlist).toEqual([]);
    expect(merged).toBe(0);
  });

  it("is idempotent — a second merge folds nothing new", () => {
    const b = bs([
      idea({ id: "B-001", status: "kept", target: "featureWishlist", title: "Streak freeze" }),
      idea({ id: "B-002", status: "parked", title: "Leaderboards" }),
    ]);
    const first = mergeBrainstorm(freshBrief(), b, now);
    expect(first.merged + first.parkedFolded).toBeGreaterThan(0);
    const second = mergeBrainstorm(first.brief, first.brainstorm, now);
    expect(second.merged).toBe(0);
    expect(second.parkedFolded).toBe(0);
    expect(second.brief.featureWishlist.length).toBe(first.brief.featureWishlist.length);
    expect(second.brief.openQuestions.length).toBe(first.brief.openQuestions.length);
  });
});

describe("loadBrainstorm — tolerant normalization", () => {
  it("coerces invalid angle/status/target and assigns missing ids, warning each", () => {
    const warnings: string[] = [];
    const raw = { schemaVersion: 1, idea: "x", createdAt: "T", ideas: [{ title: "no id", angle: "bogus", status: "nope", target: "invalid" }, { title: "" }] };
    const b = normalizeForTest(raw, (w) => warnings.push(w));
    expect(b.ideas[0]!.id).toMatch(/^B-\d{3}$/);
    expect(b.ideas[0]!.angle).toBe("wildcard");
    expect(b.ideas[0]!.status).toBe("proposed");
    expect(b.ideas[0]!.target).toBeUndefined();
    expect(b.ideas.find((i) => i.title === "")).toBeUndefined(); // the title-less idea is dropped
    expect(warnings.length).toBeGreaterThan(0);
  });
});

// loadBrainstorm reads from disk; exercise its normalizer via a tiny temp file.
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
function normalizeForTest(raw: unknown, warn: (m: string) => void): Brainstorm {
  const dir = mkdtempSync(join(tmpdir(), "ct-bs-"));
  try {
    writeFileSync(join(dir, "brainstorm.json"), JSON.stringify(raw));
    return loadBrainstorm(dir, warn)!;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
