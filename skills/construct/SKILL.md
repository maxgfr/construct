---
name: construct
description: "Use when the user wants to turn a product idea into a serious, buildable requirements document (an SRD/PRD) — or build the app from one. Triggers: write an SRD or PRD, spec out a product, write/define requirements, idea to spec, brainstorm an idea, build from spec, one PRD per module, PRD folder. construct interviews the user, grounds every major decision in real research — competitors and market signal, comparable open-source projects and their issues/PRs, candidate-tech docs and StackOverflow pitfalls — then renders a complete SRD suite: vision, scope, functional requirements with Given/When/Then acceptance criteria, NFRs, data model, interfaces, ADRs, competitive landscape, build plan, traceability. Modules mode renders one PRD per module (prd/<module>/PRD.md); render --prd emits one PRD per requirement. A hard structural gate plus an advisory grounding report validate it; for building, it emits a BUILD-PLAN.json task DAG and construct verify referees the app against the SRD."
license: MIT
metadata:
  version: 2.2.1
---

# construct — a product idea, grounded into a buildable SRD

`construct` turns a product idea into a **Software Requirements Document suite**
whose requirements and decisions are **grounded in real research**, not the
model's memory. The deterministic engine (`scripts/construct.mjs`, zero-dep
Node) does the searching, dossier assembly, SRD rendering and validation **with
code**; your job is to run the interview, drive the research, and enrich the
rendered scaffold into a precise, well-grounded SRD.

> **The core rule:** prefer a *grounded* requirement to a *guessed* one. Use the
> research the engine retrieves (competitors, OSS prior art, tech docs,
> StackOverflow) to justify scope, NFRs and architecture decisions, and cite the
> evidence with `[E#]`. Grounding is **advisory** here — `construct check`
> reports coverage but never fails on it — so the rigor is yours to apply.

## The script

One committed, dependency-free bundle: `node scripts/construct.mjs <command>`.
No `npm install`, no API keys. Run `--help` for the full surface. Key commands:

- `init --idea "<one-liner>" --out <run>` — scaffold a run folder + `brief.json`.
- `brainstorm --out <run> [--merge] [--json]` — optional DIVERGENT step before
  the interview: scaffold a board of candidate ideas (`brainstorm.json` +
  `BRAINSTORM.md`), then `--merge` folds every **kept** idea into `brief.json`
  and every **parked** idea into `openQuestions` (a gate-blocking 🧠). Idempotent.
  See `references/brainstorm-playbook.md`.
- `research --out <run> [--angles market,oss,tech,semantic] [--q "<focus>"] [--semantic]`
  — gather evidence across angles into `<run>/evidence/` (an `EVIDENCE.md` +
  `evidence.json` dossier with `[E#]` ids). Default angles: `market,oss,tech`.
- `analyze --out <run> [--json]` — the "what's thin?" report: names every
  feature/competitor/tech/seed that will render UNGROUNDED as-is, and prints the
  drill command that fixes each gap. Informational, never gates.
- `web|oss|tech|so --out <run> [--q "<focus>"] [--url ...] [--seeds ...]
  [--docs-url <u,...>]` — drill ONE angle to stdout (no dossier). Use these to
  dig deeper on a thin thread; `--docs-url` grounds known docs pages directly.
- `render --out <run> [--level light|complex] [--merge] [--prd]` — render the
  SRD tree + `SRD.json` from `brief.json` + the dossier. When the brief declares
  `modules`, also renders **one PRD per module** (`prd/<module>/PRD.md` + index)
  and FUNCTIONAL.md becomes the cross-module index. `--prd` additionally emits
  one standalone PRD per requirement under `requirements/prd/`.
- `check --out <run> [--min-grounding <0-100>] [--semantic] [--json]` — the HARD
  structural gate (exit ≠ 0 on an incomplete SRD) plus the ADVISORY grounding-
  coverage report. `--min-grounding N` opts into a second gate that fails below
  N% grounded claims; `--semantic` folds in `VERIFY.json` (see `review`) and
  fails on any refuted/unsupported claim. (Distinct from `research --semantic`,
  which only re-ranks evidence by embedding relevance.)
- `review --out <run> [--apply <verdicts.json>] [--max-review N] [--json]` — the
  claim-support harness. With no `--apply` it writes a claim↔evidence worklist
  (`VERIFY.todo.json` + `VERIFY.md`): every grounded claim paired with each cited
  `[E#]` snippet to adjudicate. `--apply <verdicts.json>` reduces your verdicts
  (`supported|partial|refuted|unsupported`) into `VERIFY.json`, which
  `check --semantic` gates on. Fan it out per `references/orchestration.md`.
- `verify --out <run> [--app <dir>] [--run-tests] [--strict] [--json]` — the
  build referee: BUILD-PLAN.json well-formed and acyclic, every task ref
  resolves into SRD.json, done tasks' files exist, every requirement is
  referenced by a test. `--run-tests` also executes the declared test
  commands; `--strict` fails a built must-have with no referencing test.
- `status --out <run> [--json]` — what exists in the run so far; `--json` adds
  the build frontier (which BUILD-PLAN tasks are buildable now vs. blocked).
- `orchestrate --out <run> [--phase research|claim-review|adr-judges|build]
  [--adr <id>] [--eco] [--list]` — emit the run's multi-agent orchestration
  from its CURRENT state into `<run>/orchestration/`: one launchable workflow
  script per ready fan-out phase, the dispatch contracts (`agents/<role>.md`)
  and a sequential `RUNBOOK.md` fallback. See *Orchestration — route by
  harness* below.
- `semantic up|down|status` — optional local Docker stack (Qdrant + Ollama +
  SearXNG).

## Workflow

You are invoked once and expected to return a complete, grounded SRD. Drive the
loop to completion; only pause to ask the user a real decision.

0. **Brainstorm — optional, divergent, before the interview.** When the user
   can't yet articulate a crisp idea, or wants to explore options first, run
   `construct brainstorm --out <run>` (after `init`) and generate candidate
   ideas WITH the user across the six angles, then `--merge` the kept ones into
   `brief.json`. Skip it when the user already knows what they want. Follow
   `references/brainstorm-playbook.md`.

1. **Interview the user — one question at a time.** Establish the product before
   researching. Follow `references/interview-playbook.md`: problem, target
   users, core value, must/should/could features, constraints (budget, timeline,
   team, compliance), candidate technologies, and any competitor / OSS seeds.
   Recommend an answer with each question; don't dump a questionnaire. Write the
   answers into `brief.json` (start it with `construct init`).
   **Module decomposition:** when the product is naturally modular (roughly >6
   features, or the user names a modular architecture like `src/modules/…`),
   propose a module split and record it — `brief.modules` (id/name/description/
   dependsOn) plus a `module` on every feature. Render then emits **one PRD per
   module** and `check` enforces the partition (all-or-nothing: every feature
   assigned). Module ids become folder names — keep them slug-like, and keep
   feature titles unique across modules (BUILD-PLAN progress is keyed by title).

2. **Research — ground the idea.** Run:
   ```
   node scripts/construct.mjs research --out <run> --angles market,oss,tech
   ```
   This discovers competitors on the web, mines comparable OSS projects (and
   their issues/PRs for real pitfalls), and pulls candidate-tech docs +
   StackOverflow. Read `<run>/evidence/EVIDENCE.md`.

3. **Dig deeper — until `analyze` is clean or the user stops you.** Run:
   ```
   node scripts/construct.mjs analyze --out <run>
   ```
   It names exactly what is thin — features, competitors, candidate tech and OSS
   seeds with no matchable evidence — and prints the drill command that fixes
   each gap. **Fan out:** if you can spawn parallel subagents, dispatch one per
   gap (the engine emits this ready to launch:
   `node scripts/construct.mjs orchestrate --out <run> --phase research`);
   each gets the brief one-liner, the gap, its drill command and its own
   WebSearch, and returns a ≤5-line summary plus URLs worth grounding. Subagents
   MUST NOT write into the run folder — drills print to stdout; only
   `construct research` writes the dossier, and only YOU run it. Fold findings
   in with a single research re-run that PINS the proven URLs:
   `construct research --out <run> --angles market,oss,tech --url <u,...>
   [--docs-url <d,...>]` → re-run `analyze`. **A research run rebuilds the
   dossier from exactly the angles/URLs it is given** — always pass every angle
   (and raise `--per-source` if pins would exceed the budget), or evidence from
   earlier runs is lost. (No subagents? Work the gaps yourself, one drill at a
   time.) Tell the user what you found and **let them steer** — prioritise
   must-have features and load-bearing decisions, stop when they say it's
   enough. See `references/orchestration.md` and
   `references/research-playbook.md`.

4. **Render the SRD.** When the brief is solid and the dossier is rich:
   ```
   node scripts/construct.mjs render --out <run> --level complex
   ```
   Pick `complex` whenever a build is even possible; switching levels later
   renumbers FR ids (see `references/srd-authoring.md`).
   This writes the SRD tree (see below). The data model and interfaces come
   pre-seeded by inference from the brief — **verify them, don't trust them**.
   Then **enrich it**: resolve every `🧠 Decide:` callout, sharpen the templated
   acceptance criteria and NFR metrics into testable, bounded statements
   (follow `references/acceptance-criteria.md` — `check` warns while any remain
   templated), correct/extend the data model and interfaces, and add `[E#]`
   citations from the dossier to the requirements and decisions they rest on.
   See `references/srd-authoring.md` and `references/citation-format.md`.
   At `complex`, also enrich the **design system** (`design/`): replace the
   seeded design tokens with the product's real brand values, verify the
   component and screen/flow inventory, and sharpen the accessibility criteria
   to the target standard (derived from the brief, default WCAG 2.2 AA). See
   `references/design-system-authoring.md`.

5. **Adversarial review — let fresh eyes break it.** Spawn one reviewer
   subagent with NO context beyond the run folder path and
   `references/adversarial-review.md` (no subagents? do the pass yourself,
   strictly following that checklist as a hostile reader). It must try to
   *break* the SRD — ambiguity, untestable criteria, missing failure paths,
   citation-washing, contradictions — and return tagged findings. Fix every
   `[blocker]`, use judgement on `[advisory]`, then re-run `check`. Loop while
   new blockers appear (cap: 3 rounds, then surface what remains to the user).
   For a genuinely contested, hard-to-reverse ADR at `complex` level, also run
   the 3-judge panel from `references/orchestration.md` (emit it:
   `orchestrate --out <run> --phase adr-judges --adr <id>`).

6. **Validate (three layers).**
   - *Structural (hard):* `node scripts/construct.mjs check --out <run>`. It
     fails on any unresolved `🧠`, no functional requirements at all, an FR with
     no acceptance criteria, a dangling entity/interface/NFR reference, a missing
     required NFR category, or a malformed ADR. Fix until it passes.
   - *Grounding (advisory):* the same command prints coverage — what fraction of
     requirements/decisions cite evidence. Raise it where it matters (the load-
     bearing decisions); see `references/grounding-coverage.md`. By default it
     never fails the build, so use judgement. When the user wants grounding
     *enforced*, add the opt-in gate: `check --out <run> --min-grounding 70`.
   - *Claim-support (advisory → opt-in gate):* coverage counts citations; it does
     not check they hold. `construct review --out <run>` builds a claim↔evidence
     worklist; adjudicate each pair (fan out per `references/orchestration.md`
     Pattern 4 — emitted by `orchestrate --out <run> --phase claim-review`),
     assemble `verdicts.json`, `review --apply verdicts.json`, then
     `check --out <run> --semantic` to gate refuted/unsupported claims. Worth one
     pass over the load-bearing FRs/ADRs before presenting.
   Loop steps 3–6 until `check` passes structurally, the reviewer finds no new
   blockers, and the grounding is honest.

7. **Present.** Give the user the SRD suite: the vision, the competitive
   landscape, the grounded requirements and the key decisions (with their `[E#]`
   evidence and links). Pin any unknowns explicitly rather than guessing.

8. **Build (when the user wants the app, not just the SRD).** The render also
   emitted `BUILD-PLAN.json` — a machine-readable task DAG (T-000 skeleton +
   one task per FR, must → should → could, entity-aware dependencies) whose
   `acceptance` entries POINT into `SRD.json`. **You write all app code; the
   engine referees.** Follow `references/build-playbook.md`:
   - Do `T-000` (scaffold, test harness, CI); set `conventions.appDir` and
     `conventions.testCommand` in `BUILD-PLAN.json`.
   - Per task, in topological order: read the acceptance criteria from
     `SRD.json`; TDD them — **every test names its FR id** (e.g.
     `describe("FR-001 …")`; that's what `verify` greps); record `artifacts` +
     `tests`; set `status: "done"`; run
     `node scripts/construct.mjs verify --out <run>` and fix any error before
     the next task.
   - Same-milestone tasks carry no edges to each other, so their ready frontier
     (`status --out <run> --json`) can be built in parallel — one isolated git
     worktree per task; you alone fold results into `BUILD-PLAN.json` (Pattern 5
     in `references/orchestration.md`; fan out:
     `orchestrate --out <run> --phase build`).
   - Per milestone: `verify --out <run> --run-tests --strict`, then a
     milestone adversarial review — fresh eyes hunting for an acceptance
     criterion no test actually exercises (see the playbook;
     `references/verify.md` explains what verify can and cannot prove).
   - If an FR proves wrong while building, amend the brief, re-render
     (progress merges by feature title), retag shifted FR ids, re-`check`.

## Orchestration — route by harness

Four phases fan out over per-unit, file-backed state: **research** (one researcher per
`analyze` gap), **claim-review** (one skeptic per `VERIFY.todo.json` claim↔evidence pair),
**adr-judges** (the fixed 3-lens panel over ONE contested ADR) and **build** (one
worktree-isolated builder per ready BUILD-PLAN task). The engine manages the fan-out —
`orchestrate` emits the orchestration from the CURRENT run state, with absolute paths and
the real worklist units baked in:

```
node scripts/construct.mjs orchestrate --out <run> [--phase research|claim-review|adr-judges|build] [--adr <id>] [--eco] [--list]
```

| Your harness | How to run each fan-out phase |
|---|---|
| Has the Workflow tool | `orchestrate --out <RUN> --phase <p>`, then `Workflow({ scriptPath: "<RUN>/orchestration/<p>.workflow.mjs" })`. Subagents RETURN fragments; fold them in yourself — the pinned `research` re-run, `review --apply`, the ADR majority reduce, the BUILD-PLAN fold — then gate as usual. |
| Subagents but no Workflow tool | Same `orchestrate`; dispatch one subagent per batch following `<RUN>/orchestration/agents/<role>.md` (the workflow script shows batches + prompts). One writer: you fold results in. |
| Eco mode, or no subagents | `orchestrate --out <RUN> --eco` → follow `<RUN>/orchestration/RUNBOOK.md` sequentially, playing each role yourself. Correctness-identical; only wall-clock differs. |

Fan-out is an optimization, never a requirement — the gates (`check`, `review --apply`,
`verify`) are harness-independent and every phase has a sequential fallback with identical
artifacts. Subagents never write the run folder: the emitted contracts end with the
one-writer rule, and the fold always stays with you, the orchestrator (builders write code
only in their own isolated git worktrees — never the run folder). The judge panel is
opt-in — `--phase adr-judges --adr <id>` panels ONE genuinely contested ADR — and the
adversarial SRD review (Pattern 2) deliberately stays a single fresh-eyes reviewer, never
a fan-out. Re-run `orchestrate` whenever a worklist changes (emission is deterministic and
idempotent); `--phase <p>` before its worklist exists fails and names the command that
produces it. The underlying patterns live in `references/orchestration.md`.

## What it produces (the SRD tree, under `--out`)

```
00-overview/   VISION.md · SCOPE.md (+ 🧠 open decisions)
requirements/  FUNCTIONAL.md (FR-NNN · priority · Given/When/Then · [E#];
               an index linking each FR to its module PRD in modules mode)
               NON-FUNCTIONAL.md (NFR-NNN by category · metric · [E#])
               prd/PRD-FR-NNN-*.md (+ README index — only with --prd)
prd/           README.md · <module>/PRD.md   (modules mode only: one PRD per
               module — full FR blocks, NFR refs, data/interface slices, deps)
architecture/  SYSTEM-CONTEXT.md · DATA-MODEL.md · INTERFACES.md
               decisions/NNNN-*.md  (ADRs)
design/        PRINCIPLES.md · DESIGN-TOKENS.md (+ design-tokens.json) · COMPONENTS.md
               SCREENS.md · ACCESSIBILITY.md      (complex only; --no-design to skip)
competitive/   LANDSCAPE.md (competitors + OSS prior art)
BUILD-PLAN.md · BUILD-PLAN.json (task DAG for the build phase; tasks carry their
               module in modules mode)
TRACEABILITY.md (FR ↔ module ↔ NFR ↔ ADR ↔ entity ↔ interface ↔ component ↔ screen)
evidence/      EVIDENCE.md · evidence.json · meta.json   ·   brief.json · SRD.json
```

`light` keeps it lean; `complex` adds the full NFR set, a second ADR, failure-
path acceptance criteria, the full traceability matrix and a **design-system
subtree** (`design/`: principles, tokens, components, screens/flows, an
accessibility contract — `--no-design` opts out). Add `--merge` for a single-file
`SRD.md` (always the full FR blocks, even in modules mode).

## Optional semantic mode (fully local, no API key)

The market/OSS/tech angles need nothing but network access. For a relevance pass
over the gathered evidence you can enable a local embedding model:

```
node scripts/construct.mjs semantic up        # docker: Qdrant + Ollama + SearXNG
node scripts/construct.mjs research --out <run> --angles market,oss,tech,semantic --semantic
```

Everything runs in local Docker containers — no key, no data leaves the machine.
If the stack isn't up, `--semantic` logs a notice and keeps the lexical ranking.
See `references/semantic-setup.md`.

## References

- `references/brainstorm-playbook.md` — the optional divergent step: generating candidate ideas across six angles and merging the kept ones into the brief.
- `references/interview-playbook.md` — how to elicit the brief, one question at a time.
- `references/research-playbook.md` — picking angles and digging deeper to "good enough".
- `references/orchestration.md` — the three-tier dynamic-workflow model and the subagent patterns: research fan-out, red team, judge panel, claim-support review fan-out, build fan-out (and the one-writer rule). The fan-out patterns are emitted ready-to-launch by `construct orchestrate`.
- `references/adversarial-review.md` — the red-team checklist and its findings contract.
- `references/srd-authoring.md` — resolving 🧠 callouts, writing testable requirements and ADRs.
- `references/design-system-authoring.md` — enriching the `complex` design system: tokens, components, screens/flows and the accessibility contract.
- `references/acceptance-criteria.md` — bad→good Given/When/Then rewrites and measurable NFR metric patterns.
- `references/citation-format.md` — the `[E#]` grounding convention.
- `references/grounding-coverage.md` — what the advisory coverage report means and how to raise it.
- `references/build-playbook.md` — the build loop: task TDD, FR-tag convention, milestone gates, the milestone review.
- `references/verify.md` — what each `verify` check proves and what still needs eyes.
- `references/provider-apis.md` — how OSS issues/PRs are fetched per host, keyless.
- `references/web-discovery.md` — the layered keyless web search.
- `references/semantic-setup.md` — the optional local Docker stack.
