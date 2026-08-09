# Contributing

Thanks for helping improve `construct`.

## Setup

```
pnpm install
pnpm run typecheck   # tsc --noEmit (strict)
pnpm test            # vitest
pnpm run build       # bundle src/ → scripts/construct.mjs
pnpm run check:build # rebuild + assert the committed bundle is unchanged
pnpm run demo        # offline: render + check the sample brief
```

Requires Node ≥ 20 for the dev toolchain (vitest); the **published bundle** runs
on Node ≥ 18 — the CI floor job proves it.

## Architecture in one minute

Thin deterministic engine + thick agent playbook. See
[`DOCUMENTATION.md`](DOCUMENTATION.md). The two places to extend:

- **A new research angle** → add `src/research/<angle>.ts` returning
  `SourceResult[]`, register it in `src/research/registry.ts`. Keep all network
  I/O behind `research/fetch.ts` and subprocesses behind `util.ts::sh` so it stays
  testable offline.
- **SRD content/shape** → `src/srd.ts` (the model) and `src/templates.ts` (the
  Markdown). Both are pure — add a golden test in `tests/`.

The agent-facing guidance lives in `SKILL.md` + `references/*.md` — markdown, no
code. Prefer teaching the agent there over hard-coding behaviour in the engine.

## The vendored engines

Two engines are vendored under `src/vendor/`, each pinned by tag and SHA-256 and
inlined by tsup so the skill still ships as one file with no install:

- **codeindex** — the code you have locally.
- **webindex** — the web: HTTP, extraction, the PDF and office ladders, ranking,
  forges and package registries, the container stack, and the whole MCP protocol.

**Everything in `src/` reaches webindex through `src/engine.ts` — never
`src/vendor/*` directly.** That module calls `configure()` once, so you cannot
obtain an engine function without first importing the module that configured it.

Three scripts keep it honest, all wired into `check:build`:

| Script | What it refuses |
|---|---|
| `sync-engine.mjs --check` | A **tampered** vendor (bytes differ from the pin) or a **stale** one (pinned below `minRef`). The second matters because tsup inlines the bundle: a stale pin ships old behaviour with every test green. |
| `verify-engine-usage.mjs` | A local declaration that **shadows** an engine export — exported or not — unless it is argued for in `engine-forks.json`. Also a drop below the usage floor. |
| `verify-skill-bundle.mjs` | A skill directory that would not install, including a stale `docker/` copy the engine now writes out on demand. |

Two rules that are easy to get wrong:

- **Adopting an engine export and bumping `minRef` happen in the SAME commit.**
  Deleting a local copy while pinned to a release that lacks its replacement
  builds green and ships broken.
- **`engine-forks.json` is a ratchet.** Entries may leave, never arrive — each
  one carries the argument for why that fork still exists. A fork that no longer
  matches anything also fails, so the list cannot rot.

To pull a new engine release: `node scripts/sync-engine.mjs --ref vX.Y.Z`, then
`pnpm run check:build`.

## Tests (TDD)

Write a failing test first. The deterministic core (`brief`, `srd`, `render`,
`check`) is fully offline; the research layer mocks `fetch`/`sh`. Fixtures live in
`tests/fixtures/` (`sample-brief.json`, `sample-evidence.json`) — keep timestamps
out of golden comparisons (the body is deterministic; `generatedAt` is injected).

Rebuild the bundle (`pnpm run build`) before committing any `src/` change — the
committed `scripts/construct.mjs` is checked for reproducibility in CI.

## Commits & releases

[Conventional Commits](https://www.conventionalcommits.org/): `feat:` → minor,
`fix:` → patch, `feat!:`/`BREAKING CHANGE:` → major. semantic-release owns the
version, changelog, tag and GitHub release — never bump by hand.

```
feat(oss): mine related PRs for pitfalls
fix(check): treat empty entity refs as valid closure
docs(readme): clarify grounding-vs-completeness
```
