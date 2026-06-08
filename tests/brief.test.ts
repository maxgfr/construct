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
