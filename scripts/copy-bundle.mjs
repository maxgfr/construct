#!/usr/bin/env node
// Mirror the source-of-truth bundle (scripts/construct.mjs, produced by tsup)
// byte-for-byte into the skill package. The skill ships standalone — `npx
// skills add` copies the skill directory (skills/construct/), so the engine
// has to live next to its SKILL.md, not just at the repo root. A plain copy
// (no transform) keeps the two files identical, which is what `check:build`
// asserts so the published skill can never drift from the tested bundle.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skill = join(root, "skills", "construct");

// The engine bundle + the optional Docker stacks (compose file, the SearXNG
// settings and the Firecrawl env). All of them must ship INSIDE the skill dir so
// the installed skill is self-contained — the compose lives at skills/construct/
// so it is `../docker-compose.yml` from the bundle, and its `./docker/searxng`
// and `./docker/firecrawl` bind mounts resolve to the shipped siblings.
// `firecrawl.env` in particular is an `env_file:` reference: without it, `docker
// compose --profile extract up` fails outright from an installed skill.
const pairs = [
  ["scripts/construct.mjs", "scripts/construct.mjs"],
  ["docker-compose.yml", "docker-compose.yml"],
  ["docker/searxng/settings.yml", "docker/searxng/settings.yml"],
  ["docker/firecrawl/firecrawl.env", "docker/firecrawl/firecrawl.env"],
  ["docker/firecrawl/README.md", "docker/firecrawl/README.md"],
];

for (const [from, to] of pairs) {
  const source = join(root, from);
  const target = join(skill, to);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  console.log(`copy-bundle: ${source} -> ${target}`);
}
