import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stackCommand } from "../src/research/semantic.js";

// The skill installs standalone (`npx skills add` copies skills/construct/), and
// it used to have to carry the Docker stack files with it — the installed layout
// found the compose by walking up from the bundle, and `firecrawl.env` is an
// `env_file:` reference, so `--profile extract up` failed outright without it.
//
// The engine embeds all three and writes them out on demand, so the requirement
// inverts: a copy left here would be a second source of truth that goes stale
// silently, and `up` would prefer whichever the walk happened to reach first.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = join(root, "skills", "construct");

describe("skill bundle — the Docker stack is the engine's", () => {
  for (const rel of ["docker-compose.yml", "docker"]) {
    it(`does not carry a stale ${rel}`, () => {
      expect(existsSync(join(skillDir, rel)), `skills/construct/${rel} should be gone`).toBe(false);
      expect(existsSync(join(root, rel)), `${rel} should be gone from the repo root too`).toBe(false);
    });
  }

  it("still drives the stack, from a file the engine materialises", () => {
    const calls: string[][] = [];
    const r = stackCommand("firecrawl", "status", {
      has: () => true,
      run: (cmd, args) => (calls.push([cmd, ...args]), { ok: true, stdout: "", stderr: "" }),
    });
    expect(r.code).toBe(0);
    const file = calls[0]![calls[0]!.indexOf("-f") + 1]!;
    expect(existsSync(file)).toBe(true);
    // The env_file the compose references by relative path, beside it.
    expect(existsSync(join(dirname(file), "docker", "firecrawl", "firecrawl.env"))).toBe(true);
  });
});
