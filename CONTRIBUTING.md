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
