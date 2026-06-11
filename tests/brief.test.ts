import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initBrief, saveBrief, loadBrief, validateBrief, normalizeBrief } from "../src/brief.js";

describe("initBrief", () => {
  it("seeds an empty brief with the idea", () => {
    const b = initBrief("  a read-it-later app ", "2026-01-01T00:00:00.000Z");
    expect(b.idea).toBe("a read-it-later app");
    expect(b.schemaVersion).toBe(1);
    expect(b.featureWishlist).toEqual([]);
    expect(b.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("save/load round-trip", () => {
  it("persists and reloads a brief", () => {
    const dir = mkdtempSync(join(tmpdir(), "construct-brief-"));
    const b = initBrief("x", "now");
    b.featureWishlist.push({ title: "Do a thing", priority: "must" });
    saveBrief(dir, b);
    const back = loadBrief(dir);
    expect(back.featureWishlist[0]).toMatchObject({ title: "Do a thing", priority: "must" });
    rmSync(dir, { recursive: true, force: true });
  });

  it("throws a helpful error when brief.json is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "construct-brief-"));
    expect(() => loadBrief(dir)).toThrow(/No brief\.json/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("normalizeBrief", () => {
  it("tolerates missing arrays/objects", () => {
    const b = normalizeBrief({ idea: "y" });
    expect(b.goals).toEqual([]);
    expect(b.candidateTech).toEqual([]);
    expect(b.product).toEqual({ name: undefined, problem: undefined, users: [], valueProp: undefined });
  });

  it("collapses internal whitespace/newlines on free text (blocks markdown injection)", () => {
    const b = normalizeBrief({
      idea: "an  app",
      featureWishlist: [{ title: "Do a thing\n# Fake heading\n- fake item", priority: "must" }],
      competitors: ["A | B"],
    });
    expect(b.featureWishlist[0]!.title).toBe("Do a thing # Fake heading - fake item");
    expect(b.featureWishlist[0]!.title).not.toContain("\n");
    expect(b.idea).toBe("an app");
  });

  it("warns about every coercion that drops or rewrites data", () => {
    const warnings: string[] = [];
    const b = normalizeBrief(
      {
        idea: "y",
        goals: ["ok", 42],
        featureWishlist: [{ title: "Real feature" }, { notes: "no title" }, { title: "Hot one", priority: "high" }],
        competitors: "not-an-array",
      },
      (w) => warnings.push(w),
    );
    expect(warnings.sort()).toEqual(
      [
        "goals: dropped 1 non-string/empty entry.",
        "featureWishlist[1] has no usable title — dropped.",
        'featureWishlist[2].priority "high" is not must|should|could — treated as should.',
        "competitors is not an array — ignored.",
      ].sort(),
    );
    // The returned shape is the same as before — tolerant, never crashing.
    expect(b.goals).toEqual(["ok"]);
    expect(b.featureWishlist.map((f) => f.title)).toEqual(["Real feature", "Hot one"]);
    expect(b.featureWishlist[1]!.priority).toBeUndefined();
    expect(b.competitors).toEqual([]);
  });

  it("stays silent when nothing is coerced", () => {
    const warnings: string[] = [];
    normalizeBrief({ idea: "y", goals: ["a"], featureWishlist: [{ title: "T", priority: "must" }] }, (w) => warnings.push(w));
    expect(warnings).toEqual([]);
  });
});

describe("validateBrief", () => {
  it("fails an empty brief", () => {
    const v = validateBrief(initBrief("", "now"));
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/idea is empty/);
  });

  it("passes a brief with intent and warns on thin signal", () => {
    const b = initBrief("a thing", "now");
    b.goals.push("ship it");
    const v = validateBrief(b);
    expect(v.ok).toBe(true);
    expect(v.warnings.join(" ")).toMatch(/featureWishlist/);
  });
});
