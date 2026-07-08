import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The skill installs standalone (`npx skills add` copies skills/construct/), so
// the semantic Docker stack files must ship INSIDE the skill dir — not just at
// the repo root, where they are unreachable once installed.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = join(root, "skills", "construct");

describe("skill bundle — semantic Docker stack ships with the skill", () => {
  const files = ["docker-compose.yml", join("docker", "searxng", "settings.yml")];

  for (const rel of files) {
    it(`ships ${rel} inside the skill, byte-identical to the repo root`, () => {
      const rootFile = join(root, rel);
      const skillFile = join(skillDir, rel);
      expect(existsSync(rootFile), `${rel} must exist at the repo root`).toBe(true);
      expect(existsSync(skillFile), `${rel} must be mirrored into skills/construct/`).toBe(true);
      expect(readFileSync(skillFile).equals(readFileSync(rootFile)), `${rel} in the skill must match the root copy`).toBe(true);
    });
  }
});
