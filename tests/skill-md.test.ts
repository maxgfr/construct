import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { VERSION } from "../src/types.js";

// Guards that the published SKILL.md stays installable via `npx skills add`.
// The `skills` CLI discovers a skill by reading SKILL.md, extracting the
// frontmatter with this exact regex and `parse()`-ing it with `yaml`. If that
// parse throws — or name/description are missing — it SILENTLY drops the skill.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

describe("SKILL.md is installable by the `skills` CLI", () => {
  const raw = readFileSync(join(ROOT, "SKILL.md"), "utf8");
  const match = raw.match(FRONTMATTER_RE);
  const frontmatter = match?.[1] ?? "";

  it("has a frontmatter block", () => {
    expect(match).not.toBeNull();
    expect(frontmatter.length).toBeGreaterThan(0);
  });

  it("parses as YAML without throwing", () => {
    expect(() => parse(frontmatter)).not.toThrow();
  });

  it("exposes a non-empty name and description", () => {
    const data = parse(frontmatter) as Record<string, unknown>;
    expect(data.name).toBe("construct");
    expect(typeof data.description).toBe("string");
    expect((data.description as string).length).toBeGreaterThan(0);
  });

  // Claude Code caps skill descriptions at 1024 characters when matching a
  // request to a skill; a longer description risks truncation at the exact
  // moment the skill needs to be recognized.
  it("keeps the description under the 1024-char matcher limit", () => {
    const data = parse(frontmatter) as Record<string, unknown>;
    expect((data.description as string).length).toBeLessThanOrEqual(1024);
  });

  it("only references playbooks that exist on disk", () => {
    const mentioned = [...new Set(raw.match(/references\/[a-z0-9-]+\.md/g) ?? [])];
    expect(mentioned.length).toBeGreaterThan(0);
    for (const ref of mentioned) expect(existsSync(join(ROOT, ref)), `${ref} is mentioned in SKILL.md but missing`).toBe(true);
  });

  it("mentions every references/*.md playbook", () => {
    const files = readdirSync(join(ROOT, "references")).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(raw.includes(`references/${f}`), `references/${f} exists but SKILL.md never mentions it`).toBe(true);
  });

  it("keeps version in lockstep across SKILL.md, package.json and src/types.ts", () => {
    const data = parse(frontmatter) as { metadata?: { version?: string } };
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
    expect(data.metadata?.version).toBe(pkg.version);
    expect(VERSION).toBe(pkg.version);
  });
});
