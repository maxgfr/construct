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
// The skill is packaged under skills/construct/ (not at the repo root) so that
// `npx skills add` bundles the engine + references with the SKILL.md — a root
// SKILL.md would be installed alone. See scripts/verify-skill-bundle.mjs.
const SKILL_DIR = join(ROOT, "skills", "construct");
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

describe("SKILL.md is installable by the `skills` CLI", () => {
  const raw = readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8");
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
    for (const ref of mentioned) expect(existsSync(join(SKILL_DIR, ref)), `${ref} is mentioned in SKILL.md but missing`).toBe(true);
  });

  it("mentions every references/*.md playbook", () => {
    const files = readdirSync(join(SKILL_DIR, "references")).filter((f) => f.endsWith(".md"));
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

// ---------------------------------------------------------------------------
// Flag-coverage gate — the fix for how the docs drifted in the first place.
//
// Three SKILL.md claims contradicted the engine, and seven flags existed in
// cli.ts while being documented nowhere in the shipped bundle. None of it was
// carelessness: a fix landed in the CLI help and the references and simply
// missed SKILL.md, and nothing noticed. Correcting the prose without
// mechanising the invariant would only reset the clock.
//
// So: every flag the engine accepts must be documented in the bundle, and every
// flag the bundle mentions must exist in the engine.
// ---------------------------------------------------------------------------
describe("the shipped bundle documents the engine it ships", () => {
  const skillMd = readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8");
  const refs = readdirSync(join(SKILL_DIR, "references"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => readFileSync(join(SKILL_DIR, "references", f), "utf8"));
  const bundle = [skillMd, ...refs].join("\n");

  // Parse the flag sets straight out of the CLI so the gate tracks the engine
  // rather than a copy of it.
  const cli = readFileSync(join(ROOT, "src", "cli.ts"), "utf8");
  function flagSet(name: string): string[] {
    const m = new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`).exec(cli);
    if (!m) throw new Error(`could not find ${name} in src/cli.ts`);
    return [...m[1]!.matchAll(/"([a-z0-9-]+)"/g)].map((x) => x[1]!);
  }
  const engineFlags = [...flagSet("VALUE_FLAGS"), ...flagSet("BOOL_FLAGS")];

  // Flags belonging to OTHER tools that the references legitimately quote
  // (docker compose in semantic-setup.md, and construct's own --help).
  const FOREIGN_FLAGS = new Set(["profile", "help", "version"]);

  it("finds a non-trivial flag surface to check", () => {
    expect(engineFlags.length).toBeGreaterThan(20);
  });

  it("documents every flag the engine accepts", () => {
    // Whole-token match: a bare `includes("--run")` would be satisfied by
    // `--run-tests` and quietly pass an undocumented alias.
    const documented = (f: string) => new RegExp(`--${f}(?![a-z0-9-])`).test(bundle);
    const undocumented = engineFlags.filter((f) => !documented(f));
    expect(undocumented, `flags accepted by src/cli.ts but documented nowhere in the skill bundle: ${undocumented.join(", ")}`).toEqual([]);
  });

  it("mentions no flag the engine does not accept", () => {
    const mentioned = [...new Set([...bundle.matchAll(/--([a-z][a-z0-9-]*)/g)].map((m) => m[1]!))];
    const known = new Set([...engineFlags, ...FOREIGN_FLAGS]);
    const phantom = mentioned.filter((f) => !known.has(f));
    expect(phantom, `the skill bundle documents flags src/cli.ts does not accept: ${phantom.join(", ")}`).toEqual([]);
  });

  it("documents every command the engine dispatches", () => {
    const m = /const COMMANDS = new Set\(\[([\s\S]*?)\]\)/.exec(cli);
    const commands = m ? [...m[1]!.matchAll(/"([a-z-]+)"/g)].map((x) => x[1]!) : [];
    expect(commands.length).toBeGreaterThan(5);
    const undocumented = commands.filter((c) => !skillMd.includes(c));
    expect(undocumented, `commands dispatched by the engine but absent from SKILL.md: ${undocumented.join(", ")}`).toEqual([]);
  });
});
