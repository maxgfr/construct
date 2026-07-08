# construct — internals

`construct` follows the same shape as `reconstruct` / `ultradoc`: a **thin,
deterministic, zero-dependency engine** + a **thick agent playbook** (`SKILL.md`
+ `references/`). The engine does only what code does well — schema persistence,
keyless retrieval, deterministic rendering, validation — and leaves judgement
(the interview, digging deeper, writing good requirements) to the agent.

## The bundle

`src/` (TypeScript, strict) is bundled by **tsup** into one committed ESM file,
`scripts/construct.mjs` (`#!/usr/bin/env node`, target node18, no runtime deps).
CI verifies the committed bundle is reproducible (`pnpm run check:build`).

## Pipeline

```
init → [brainstorm] → (interview, agent-driven) → research → analyze → render → check → review → verify
brief.json  brainstorm.json                       evidence/   gap report  SRD tree + SRD.json  report  claim-support  build referee
                                                                          + BUILD-PLAN.json
```

### `init`
Writes a `brief.json` skeleton (`src/brief.ts`). The brief is a passive schema
store — the analog of reconstruct's `plan.json`. The interview that fills it is
agent-driven (`references/interview-playbook.md`).

### `brainstorm`  (`src/brainstorm.ts`)
The optional DIVERGENT step before the convergent interview. `brainstorm`
scaffolds `brainstorm.json` + `BRAINSTORM.md` — a board of `{ id, angle, title,
status, target? }` ideas across six angles (reframe/segment/feature/
differentiator/anti-goal/wildcard). The agent generates ideas WITH the user and
marks each `proposed|kept|parked|rejected`. `brainstorm --merge` folds every
**kept** idea into the brief by its `target` (featureWishlist/competitors/goals/
nonGoals/candidateTech/openQuestions) and every **parked** idea into
`openQuestions` (a gate-blocking 🧠). `mergeBrainstorm` is pure and idempotent —
an idea carries `mergedAt` once folded and is skipped forever after; a
goals↔nonGoals conflict or a targetless kept idea warns and is left unstamped so
it can be resolved and re-merged. `check` warns (never gates) while any idea is
still `proposed`.

### `research`  (`src/research/`)
Runs the selected angles concurrently (`registry.ts::runAngles`), optionally
rescoring by semantic similarity, then assigns stable `[E#]` ids and writes the
dossier (`dossier.ts`) to `<run>/evidence/`.

| Angle | Module | Emits | Reuses |
|-------|--------|-------|--------|
| market | `market.ts` | `market` | `web.ts` (SearXNG/DDG/WebSearch), `fetch.ts` |
| oss | `oss.ts` | `oss`, `issue`, `pr` | `clone.ts`, `walk.ts`, `providers/*`, `fetch.ts` |
| tech | `tech.ts` | `docs`, `so` | `web.ts`, `stackoverflow.ts`, `fetch.ts` |
| semantic | `semantic.ts` | (rescoring) | Ollama embeddings + in-process cosine |

All network I/O goes through `fetch.ts` (`httpGet`/`httpJson`) and all
subprocesses through `util.ts::sh` — the two mock seams that make the rest
offline-testable. Every angle degrades honestly to an empty result with a note
rather than aborting the run.

### `analyze`  (`src/analyze.ts`)
The post-research gap signal. Pure read of `brief.json` + the dossier that
reuses the render's own `matchEvidence`, so every reported gap is a claim that
WILL render ungrounded: features with no matchable evidence, competitors the
market angle never surfaced, candidate tech without docs/SO grounding, unmined
OSS seeds — each with the drill command that fixes it. Informational; exit 0.

### `render`  (`src/render.ts`, `src/srd.ts`, `src/templates.ts`, `src/plan.ts`)
`buildSRD(brief, evidence, {level})` assembles a pure, deterministic SRD model
(`src/srd.ts`): one FR per feature with templated Given/When/Then, the required
NFRs for the level, an *inferred* data model and interface set (recurring nouns
+ boundary detection, FR references closed symmetrically), ADRs from the
candidate stack, a competitive table, a build plan and a traceability matrix.
Evidence `[E#]` hooks are auto-attached by keyword overlap (`matchEvidence`).
At `complex` (unless `--no-design`), `buildSRD` also seeds an optional `design`
block — design principles, a brand-neutral token scaffold across the required
categories, a component inventory (linked to the FRs it realises), a screen/flow
map and an accessibility contract whose target standard is derived from the brief
(default WCAG 2.2 AA). `render.ts` writes it as the `design/` subtree plus a
machine-readable `design-tokens.json`; the traceability matrix gains
component/screen columns. `srd.design` is absent at `light`/`--no-design`, so
those outputs stay byte-identical.
`templates.ts` turns each model slice into Markdown (pure, golden-testable);
`render.ts` writes the tree + `SRD.json` + `BUILD-PLAN.json` (`src/plan.ts`:
`derivePlan` builds the task DAG from the SRD; `mergePlan` preserves the
building agent's progress across re-renders, keyed by feature title;
`readyFrontier`, exposed by `status --out <run> --json`, computes which tasks are
buildable now vs. blocked — same-milestone tasks carry no edges between them, so
a milestone's frontier can be fanned out in parallel).

Conventions: `> 🧠 **Decide:**` for open decisions; `[E#]` for grounded claims.

### `check`  (`src/check.ts`)
Two independent passes:
- **Structural gate (hard, exit ≠ 0):** no leftover `🧠`/TODO; every FR has
  acceptance criteria and resolving entity/interface/NFR references; required
  NFR categories present for the level; ADRs well-formed; required files present.
  When a `design` block is present it also checks the design files exist, every
  component/screen/flow resolves to an FR, all token categories are present, the
  inventory is non-empty and the accessibility block names a standard with
  testable criteria (advisory nudge while the tokens are still seeded defaults).
- **Grounding coverage (advisory):** per-section grounded fraction, dangling
  `[E#]`, uncited evidence, renderer-templated criteria nudges. Never changes
  the exit code — unless the caller opts into `--min-grounding <0-100>`, which
  adds a third gate failing below the threshold.
- **`--semantic` (opt-in):** folds the `VERIFY.json` claim-support verdicts (see
  `review`) into the gate, failing on a refuted/unsupported claim. Additive —
  plain `check` is byte-for-byte unchanged.

### `review`  (`src/review.ts`)
The claim-support harness — coverage proves a claim *is cited*; review proves the
citation *holds*. `runReview` pairs every grounded SRD claim with each cited
`[E#]` snippet into a worklist (`VERIFY.todo.json` + `VERIFY.md`), capped at
`--max-review` (highest-score first). An agent adjudicates each pair
(`supported | partial | refuted | unsupported`); `review --apply <verdicts.json>`
(a bare array or `{ pairs: [...] }`) reduces them into `VERIFY.json` — a claim
fails if a cited item refutes it or all its adjudicated items are unsupported.
Pairs omitted from the verdicts file are cross-referenced against the worklist
and surfaced as *unadjudicated*, never silently passed; a malformed verdicts file
is rejected rather than overwriting `VERIFY.json` with a vacuous pass.

### `verify`  (`src/verify.ts`)
The build referee. Static by default: `BUILD-PLAN.json` well-formed and
acyclic, every `frIds`/`acceptance` ref resolves into `SRD.json`, done tasks'
declared artifacts/tests exist under the app dir, and every FR is referenced by
a test (greps `conventions.frTagPattern` over test files via `walk.ts`; stale
tags after an id shift are flagged). `--run-tests` opts into executing
`conventions.testCommand` + per-task `verify.commands` (via `util.ts::sh`);
`--strict` fails a built must-have FR with no referencing test.

## The three axes

- **Angles** (`market | oss | tech | semantic`) — *how* you research.
- **Level** (`light | complex`) — *how deep* the SRD goes.
- **Grounding** — *advisory*; structural completeness is *enforced* (orthogonal).

## Data model

- `brief.json` — `Brief` (`src/types.ts`): idea, product, goals, constraints,
  candidateTech, competitors, ossSeeds, featureWishlist, nfrPriorities,
  openQuestions.
- `evidence/evidence.json` — `EvidenceItem[]` with stable `E#` ids.
- `SRD.json` — the full `SRD` manifest the `check` reads.
- `BUILD-PLAN.json` — `BuildPlanDoc`: engine-derived task structure (ids,
  milestones, `acceptance` pointers into `SRD.json`, dependency edges) +
  agent-owned progress (`status`, `artifacts`, `tests`, `verify.commands`,
  `conventions.testCommand`/`appDir`) that survives re-renders.

## Release

Conventional Commits → semantic-release (GitHub release only, no npm registry).
`scripts/sync-version.mjs` keeps the version in lockstep across `package.json`,
`src/types.ts` (`VERSION`) and `skills/construct/SKILL.md`. CI runs a Node 24 build-test job and a
Node 18 zero-dep floor job (the committed bundle renders + checks with no install).
