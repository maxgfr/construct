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

  it("keeps a well-formed optional design block (only non-empty fields)", () => {
    const b = normalizeBrief({
      idea: "y",
      design: { platforms: ["web", "ios"], accessibilityTarget: "RGAA 4.1", tone: "  friendly ", brandConstraints: "" },
    });
    expect(b.design).toEqual({ platforms: ["web", "ios"], accessibilityTarget: "RGAA 4.1", tone: "friendly" });
    expect(b.design!.brandConstraints).toBeUndefined();
  });

  it("drops a non-object design block with a warning and leaves design undefined", () => {
    const warnings: string[] = [];
    const b = normalizeBrief({ idea: "y", design: "nope" }, (w) => warnings.push(w));
    expect(b.design).toBeUndefined();
    expect(warnings.join(" ")).toMatch(/design is not an object/);
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

describe("normalizeBrief — modules", () => {
  const declared = {
    idea: "y",
    modules: [
      { id: "capture", name: "Capture" },
      { id: "search", name: "Search", dependsOn: ["capture"] },
    ],
  };

  it("keeps declared modules and per-feature module assignments", () => {
    const b = normalizeBrief({
      ...declared,
      featureWishlist: [
        { title: "Save an article", priority: "must", module: "capture" },
        { title: "Find it again", priority: "must", module: "search" },
      ],
    });
    expect(b.modules).toEqual([
      { id: "capture", name: "Capture" },
      { id: "search", name: "Search", dependsOn: ["capture"] },
    ]);
    expect(b.featureWishlist.map((f) => f.module)).toEqual(["capture", "search"]);
  });

  it("omits the modules field entirely when none are declared", () => {
    const b = normalizeBrief({ idea: "y" });
    expect("modules" in b).toBe(false);
  });

  it("slugifies module ids and feature module refs", () => {
    const b = normalizeBrief({
      idea: "y",
      modules: [{ id: "User Auth", name: "User Auth" }],
      featureWishlist: [{ title: "Log in", module: "User Auth" }],
    });
    expect(b.modules![0]!.id).toBe("user-auth");
    expect(b.featureWishlist[0]!.module).toBe("user-auth");
  });

  it("falls back to the slugged name when a module has no id, and drops one with neither", () => {
    const warnings: string[] = [];
    const b = normalizeBrief({ idea: "y", modules: [{ name: "Deal Flow" }, { description: "nameless" }] }, (w) => warnings.push(w));
    expect(b.modules).toEqual([{ id: "deal-flow", name: "Deal Flow" }]);
    expect(warnings.join(" ")).toMatch(/modules\[1\] has no usable id or name — dropped/);
  });

  it("drops a duplicate module id with a warning", () => {
    const warnings: string[] = [];
    const b = normalizeBrief({ idea: "y", modules: [{ id: "auth" }, { id: "auth", name: "Auth again" }] }, (w) => warnings.push(w));
    expect(b.modules!.length).toBe(1);
    expect(warnings.join(" ")).toMatch(/duplicate module id "auth" — dropped/);
  });

  it("drops an unknown or self dependsOn ref with a warning", () => {
    const warnings: string[] = [];
    const b = normalizeBrief({ idea: "y", modules: [{ id: "a" }, { id: "b", dependsOn: ["a", "ghost", "b"] }] }, (w) => warnings.push(w));
    expect(b.modules![1]!.dependsOn).toEqual(["a"]);
    expect(warnings.join(" ")).toMatch(/module "b": dependsOn "ghost" names no declared module — dropped/);
    expect(warnings.join(" ")).toMatch(/module "b": dependsOn cannot reference itself — dropped/);
  });

  it("drops a feature module ref that names no declared module, keeping the feature", () => {
    const warnings: string[] = [];
    const b = normalizeBrief({ ...declared, featureWishlist: [{ title: "Orphan thing", module: "ghost" }] }, (w) => warnings.push(w));
    expect(b.featureWishlist[0]!.title).toBe("Orphan thing");
    expect(b.featureWishlist[0]!.module).toBeUndefined();
    expect(warnings.join(" ")).toMatch(/featureWishlist\[0\]\.module "ghost" names no declared module — dropped/);
  });

  it("warns and ignores a modules value that is not an array", () => {
    const warnings: string[] = [];
    const b = normalizeBrief({ idea: "y", modules: "nope" }, (w) => warnings.push(w));
    expect(b.modules).toBeUndefined();
    expect(warnings.join(" ")).toMatch(/modules is not an array — ignored/);
  });
});

describe("validateBrief — modules", () => {
  it("warns when modules are declared but some features are unassigned", () => {
    const b = normalizeBrief({
      idea: "y",
      goals: ["ship"],
      modules: [{ id: "capture" }],
      featureWishlist: [{ title: "Assigned", module: "capture" }, { title: "Unassigned" }],
    });
    const v = validateBrief(b);
    expect(v.ok).toBe(true);
    expect(v.warnings.join(" ")).toMatch(/1 feature\(s\) have no module/);
  });

  it("warns when a declared module has no features", () => {
    const b = normalizeBrief({
      idea: "y",
      goals: ["ship"],
      modules: [{ id: "capture" }, { id: "empty-one" }],
      featureWishlist: [{ title: "Assigned", module: "capture" }],
    });
    const v = validateBrief(b);
    expect(v.warnings.join(" ")).toMatch(/module "empty-one" has no features/);
  });
});
