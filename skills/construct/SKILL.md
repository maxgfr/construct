---
name: construct
description: "Use when the user wants to turn a product idea into a serious, buildable requirements document (an SRD/PRD) — or build the app from one. Triggers: write an SRD or PRD, spec out a product, write/define requirements, idea to spec, brainstorm an idea, build from spec, one PRD per module, PRD folder. construct interviews the user, grounds every major decision in real research — competitors and market signal, comparable open-source projects and their issues/PRs, candidate-tech docs and StackOverflow pitfalls — then renders a complete SRD suite: vision, scope, functional requirements with Given/When/Then acceptance criteria, NFRs, data model, interfaces, ADRs, competitive landscape, build plan, traceability. Modules mode renders one PRD per module (prd/<module>/PRD.md); render --prd emits one PRD per requirement. A hard structural gate plus an advisory grounding report validate it; for building, it emits a BUILD-PLAN.json task DAG and construct verify referees the app against the SRD."
license: MIT
metadata:
  version: 3.13.0
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

## The loop, in one line

```
[brainstorm] → interview → research → analyze → drill → render → enrich → red-team → check → present → [build]
```

`construct status --out <run>` prints what exists **and the exact next command**.
Use it whenever you resume a run, or lose the thread.

## When NOT to run construct

Check the fit before question 1; a wrong fit wastes the whole loop.

- **An existing codebase.** construct specs *greenfield* products. To document or
  evolve a repo that already exists, use `reconstruct` instead.
- **Several products in one ask.** One run = one product. Name the split,
  recommend which to spec first, park the rest.
- **No articulable idea.** `init` needs a one-liner. If the user cannot state the
  problem in a sentence, run `construct brainstorm` and diverge until a real
  shape emerges — don't start a run on "an AI thing".
- **They just want a diagram, a name, or an estimate.** Answer directly; an SRD
  suite is not the deliverable they asked for.

## Route by situation

| The user… | Start at | Read |
|---|---|---|
| has a rough idea, wants to explore | step 0, `brainstorm` | `references/brainstorm-playbook.md` |
| has a clear idea | step 1, the interview | `references/interview-playbook.md` |
| already has `brief.json` | step 2, `research` | `references/research-playbook.md` |
| has a rendered SRD, wants it sharper | step 4 enrich, then step 5 | `references/srd-authoring.md` |
| has a validated SRD, wants the app | step 8, `verify` as referee | `references/build-playbook.md` |
| names >6 features or a modular layout | step 1 + module split | `references/srd-authoring.md` |
| wants grounding *enforced*, not advised | `check --min-grounding N`, then `review` | `references/grounding-coverage.md` |
| wants a throwaway spec, not a build | `render --level light` | `references/srd-authoring.md` |

A first run chains 1 → 2 → 3 → 4 → 5 → 6 → 7. Resuming usually starts at
`status`, then re-enters wherever it says.

## The happy path, in eight commands

```
node scripts/construct.mjs init     --idea "<one-liner>" --out ./my-idea   # then interview → brief.json
node scripts/construct.mjs research --out ./my-idea --angles market,oss,tech
node scripts/construct.mjs analyze  --out ./my-idea                        # what is thin + the drill for each gap
node scripts/construct.mjs research --out ./my-idea --angles market,oss,tech --url <proven,urls>
node scripts/construct.mjs render   --out ./my-idea --level complex
#   … enrich SRD.json, then:
node scripts/construct.mjs render   --out ./my-idea --from-srd
node scripts/construct.mjs check    --out ./my-idea
node scripts/construct.mjs review   --out ./my-idea                        # adjudicate → check --semantic
```

## The script

One committed, dependency-free bundle: `node scripts/construct.mjs <command>`.
No `npm install`, no API keys. `--help` has the full surface; this is the map.

| Command | What it does |
|---|---|
| `init --idea "<s>" --out <run>` | scaffold the run folder + `brief.json` |
| `brainstorm --out <run> [--merge]` | optional divergent board; `--merge` folds kept ideas into the brief, parked ones into `openQuestions` (a gate-blocking 🧠) |
| `research --out <run> [--angles …] [--url …] [--docs-url …]` | gather evidence into `<run>/evidence/`. **This is the only command that grounds anything.** |
| `analyze --out <run>` | what is thin — every claim that will render UNGROUNDED, with the drill that fixes it. Never gates. |
| `web \| oss \| tech \| so --out <run>` | drill ONE angle. **Prints to stdout; persists nothing** — including `--url`/`--docs-url`. |
| `render --out <run> [--level light\|complex]` | render the SRD tree + `SRD.json`. **`--level` defaults to `light`** — pass `complex` whenever a build is even possible. |
| `render --out <run> --from-srd` | re-emit the tree from an **edited `SRD.json`**. This is how you persist enrichment. |
| `check --out <run>` | the hard structural gate + the advisory grounding report |
| `review --out <run> [--apply <f>]` | the claim↔evidence worklist, then the verdict ledger `check --semantic` gates on |
| `verify --out <run> [--app <dir>] [--run-tests] [--strict]` | the build referee: plan well-formed, refs resolve, every requirement referenced by a test (`--app` defaults to `conventions.appDir`) |
| `status --out <run> [--json]` | what exists + **the next command**; `--json` adds the build frontier |
| `orchestrate --out <run> [--phase …] [--eco]` | emit this run's fan-out (see below) |
| `semantic up\|down\|status` | the optional local Docker stack |
| `firecrawl up\|down\|status` | the optional local Firecrawl stack — keyless main-content extraction. While it runs, every page is cleaned through it instead of the built-in HTML stripper; while it does not, nothing changes. |
| `cache status\|clean [--all]` | the page cache that makes a `research` re-run nearly free |

Three behaviours worth knowing before they surprise you:

- **`--prd` is sticky.** A later `render` that omits it **refuses to run** rather
  than destroy `requirements/prd/` — re-pass `--prd`, or `--no-prd` to delete it
  deliberately.
- **`check --semantic` is fail-closed.** A missing, unreadable or incompletely
  adjudicated `VERIFY.json` FAILS, as does one adjudicated against a different
  render. `--allow-unverified` degrades that to a warning — say so when you use it.
- **`check` hard-fails at `complex` on renderer scaffold.** That level certifies
  build-readiness; un-authored acceptance criteria certify nothing.
  (`references/requirements-rubric.md`.)

**Conventions.** `--out <run>` (alias `--run`); `--q <focus>` (alias
`--question`). `--refresh` ignores the page cache and re-clones OSS repos;
`--offline` works from the cache alone and reports a miss honestly.
`--web-engine auto|searxng|ddg|claude|firecrawl` pins discovery (`firecrawl` is
explicit-only — `auto` never probes it); `--firecrawl <url|off>` points the
extraction layer elsewhere, or forces the built-in extractor. `--concurrency <n>`
(default 4) bounds in-flight fetches per angle; `--max-tech <n>` (default 3) how
many candidate technologies `tech` grounds; `--per-source <n>` (default 6) how
much evidence each source keeps; `--source <kind>` reclassifies `web --url`
pages. Most commands take `--json` — prefer it whenever you branch on the result.

**Exit codes.** `0` ok · `1` a gate failed (act on it) · `2` usage error, or a
phase whose worklist does not exist yet (the message names the command that
produces it). `analyze` never gates.

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
   researching. Follow `references/interview-playbook.md` (and
   `references/brief-example.md` for a filled brief + the exchanges that
   produced its hardest fields): problem, target
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
   dossier from exactly the angles/URLs it is given** — always pass every angle,
   or evidence from earlier runs is lost. Pinned URLs are never dropped by the
   budget, and any budget cut is named in the dossier notes. `[E#]` ids are
   stable across re-runs, so citations already written into the SRD keep pointing
   at the same source. (No subagents? Work the gaps yourself, one drill at a
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
   (follow `references/acceptance-criteria.md` — at `complex` a surviving
   renderer-templated criterion is a **hard error**, not a warning: that level
   certifies build-readiness), correct/extend the data model and interfaces, and
   add `[E#]` citations from the dossier to the requirements and decisions they
   rest on. **Persist enrichment by editing `SRD.json` and re-emitting with
   `render --out <run> --from-srd`** — that keeps the markdown and the gated
   manifest in sync; hand-editing a rendered `.md` alone is overwritten by the
   next render. See `references/srd-authoring.md` and
   `references/citation-format.md`.
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
   `[blocker]`, use judgement on `[advisory]`, then re-run `check`. **Loop until
   dry** — stop when a round surfaces no NEW blocker (one clean round is enough;
   don't spend three by default). Backstop: if you are still finding blockers
   after 3 rounds, stop and take what remains to the user — an SRD that won't go
   dry in 3 rounds has a structural problem worth a human.
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
   - *Claim-support (opt-in gate, then fail-closed):* coverage counts citations;
     it does not check they hold. `construct review --out <run>` builds a
     claim↔evidence worklist; adjudicate each pair (fan out per
     `references/orchestration.md` Pattern 4 — emitted by
     `orchestrate --out <run> --phase claim-review`), assemble `verdicts.json`,
     `review --apply verdicts.json`, then `check --out <run> --semantic`.
     **Run `--semantic` only after `review --apply`:** it asserts the support
     gate actually engaged, so a missing/incomplete `VERIFY.json` — or one
     adjudicated against an earlier render — fails the check rather than passing
     it quietly. Worth one pass over the load-bearing FRs/ADRs before presenting.
   Loop steps 3–6 until `check` passes structurally, the reviewer finds no new
   blockers, and the grounding is honest.

7. **Present.** Lead with the decisions, not the artifact: what the research
   changed, the load-bearing ADRs with their cost and their `[E#]`, the scope
   boundary, and what is still unknown — pinned explicitly rather than smoothed
   over. Report the gates honestly: a green `check` means structurally complete,
   not good, and coverage counts citations rather than checking they hold. Then
   ask what they want next; don't start building unprompted. Follow
   `references/presenting.md`.

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

## When something goes wrong

| Symptom | What to do |
|---|---|
| `check` fails on a 🧠 callout | Make the decision. Fold it into an ADR, a requirement or scope, remove it from `brief.openQuestions`, re-render. It is a gate because a deferred decision is a bug in a spec. |
| `check` fails naming *the renderer's scaffold* | Those criteria/contracts were never authored. Rewrite them (`references/requirements-rubric.md`), or drop to `--level light` if this is a throwaway spec. |
| `render` refuses: "requirements/prd exists" | A previous render used `--prd`. Re-pass `--prd` to regenerate it, or `--no-prd` to delete it deliberately. |
| `check --semantic` exits 1 with no obvious cause | It is fail-closed. Run `review`, adjudicate every pair, `review --apply`, *then* `--semantic`. A re-render since the review also invalidates it. |
| `orchestrate --phase <p>` exits 2 | That phase's worklist does not exist yet; the message names the command that produces it. |
| Research returns nothing | Sharpen vague `candidateTech`/`competitors` and re-run. Then use your own WebSearch and pin the pages: `research --url <u,...>`. **Stop after two empty attempts** — record an assumption or an `openQuestion` and move on. A thin, honest SRD beats a fabricated citation. |
| Tests reference FR ids the SRD no longer has | A re-render renumbered them. Retag the tests; `verify` lists the stale ids. |
| A run is unexpectedly slow | `construct cache status`. A cold cache costs a full fetch per page; `--offline` works from the cache alone. Per-angle cost is in `evidence/meta.json` and at the foot of `EVIDENCE.md`. |

## Common mistakes

- **Treating a drill as grounding.** `web`/`oss`/`tech`/`so` PRINT. Only
  `research --url` / `research --docs-url` persist evidence you can cite.
- **Re-running `research` with fewer angles.** It rebuilds the dossier from
  exactly what you give it — always pass every angle, or earlier evidence is lost.
- **Rendering at the default `light` when a build is possible.** Switching later
  renumbers FR ids and invalidates test tags.
- **Editing a rendered `.md` and stopping there.** The next render overwrites it.
  Edit `SRD.json`, then `render --from-srd`.
- **Letting a subagent write the run folder.** One writer — you. Subagents return
  text.
- **Presenting before `check` passes.** A coverage percentage is not a gate; an
  unresolved 🧠 is.

## How to know you're done

The SRD is done when all of these hold — check them explicitly, don't assume:

1. `construct check` exits 0.
2. Every `must` requirement has a failure-path criterion naming specific
   behaviour, not "an error is shown".
3. Every load-bearing decision (stack, datastore, build-vs-buy, the
   differentiators) cites evidence that actually says what the claim implies —
   you spot-checked at least three.
4. The data model and interfaces were *verified*, not left as the renderer
   inferred them.
5. A red-team round surfaced no new blocker.
6. Whatever is still unknown is written down as an assumption or an
   `openQuestion` — not quietly guessed.

**The self-test:** could a developer who has never spoken to you build the
must-haves from this SRD alone, getting the contracts right rather than the gist?
If any answer needs a conversation, the SRD is not done.

## Orchestration — route by harness

Four phases fan out over per-unit, file-backed state: **research** (one researcher per
`analyze` gap), **claim-review** (one skeptic per `VERIFY.todo.json` pair), **adr-judges**
(a fixed 3-lens panel over ONE contested ADR) and **build** (one worktree-isolated builder
per ready task). `orchestrate` emits them from the run's CURRENT state, with absolute paths
and the real worklist units baked in:

```
node scripts/construct.mjs orchestrate --out <run> [--phase research|claim-review|adr-judges|build] [--adr <id>] [--eco] [--list]
```

| Your harness | How to run each phase |
|---|---|
| Has the Workflow tool | `orchestrate --phase <p>`, then `Workflow({ scriptPath: "<RUN>/orchestration/<p>.workflow.mjs" })` |
| Subagents, no Workflow tool | Same `orchestrate`; dispatch one subagent per batch per `<RUN>/orchestration/agents/<role>.md` |
| Eco mode, or no subagents | `orchestrate --eco` → follow `<RUN>/orchestration/RUNBOOK.md` sequentially |

**Two rules survive every tier.** Subagents never write the run folder — they return
fragments and YOU fold them in (builders write code only in their own git worktree). And
fan-out is an optimization, never a requirement: every phase has a sequential fallback with
identical artifacts, so the gates are harness-independent. Patterns, output contracts and
budget guidance: `references/orchestration.md`.

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
evidence/      EVIDENCE.md · evidence.json · meta.json · ids.json (the [E#]
               ledger — do not hand-edit; it is what keeps citations stable)
VERIFY.md · VERIFY.todo.json · VERIFY.json   (the claim-support worklist and its
               adjudicated ledger — written by `review` / `review --apply`)
orchestration/ <phase>.workflow.mjs · agents/<role>.md · RUNBOOK.md
               (written by `orchestrate`; `out/` is where subagents may return)
brief.json · SRD.json
```

`evidence/`, `VERIFY.md` and `orchestration/` are retrieved or generated text —
`check` deliberately does not scan them for 🧠/TODO, so an evidence snippet can
quote anything without tripping the gate.

`light` keeps it lean; `complex` adds the full NFR set, a second ADR, failure-
path acceptance criteria, the full traceability matrix and a **design-system
subtree** (`design/`: principles, tokens, components, screens/flows, an
accessibility contract — `--no-design` opts out). Add `--merge` for a single-file
`SRD.md` (always the full FR blocks, even in modules mode).

## Optional local stacks (fully local, no API key)

`construct semantic up` brings up a local Docker stack (Qdrant + Ollama + SearXNG); then
`research --angles market,oss,tech,semantic --semantic` re-ranks the gathered evidence by
embedding relevance. Nothing leaves the machine, and if the stack is down `--semantic` logs
a notice and keeps the lexical ranking.

`construct firecrawl up` brings up the second, heavier stack (~3 GB, its own
`extract` profile — never started by `semantic up`). While it runs, every page
the research pipeline fetches is cleaned through Firecrawl's main-content
markdown instead of the built-in HTML stripper, which is what makes a
JS-rendered page yield any evidence at all. Also keyless. Every failure path
falls back to the built-in extractor and says so in the dossier notes, so the
worst case of a stopped stack is the behaviour you had before.
See `references/semantic-setup.md`.

## References

- `references/brainstorm-playbook.md` — the optional divergent step: generating candidate ideas across six angles and merging the kept ones into the brief.
- `references/interview-playbook.md` — how to elicit the brief, one question at a time.
- `references/brief-example.md` — a filled `brief.json`, the exchanges that produced its hardest fields, and what makes it work.
- `references/research-playbook.md` — picking angles and digging deeper to "good enough".
- `references/orchestration.md` — the three-tier dynamic-workflow model and the subagent patterns: research fan-out, red team, judge panel, claim-support review fan-out, build fan-out (and the one-writer rule). The fan-out patterns are emitted ready-to-launch by `construct orchestrate`.
- `references/adversarial-review.md` — the red-team checklist and its findings contract.
- `references/srd-authoring.md` — resolving 🧠 callouts, writing testable requirements and ADRs.
- `references/design-system-authoring.md` — enriching the `complex` design system: tokens, components, screens/flows and the accessibility contract.
- `references/requirements-rubric.md` — the ISO/IEC/IEEE 29148:2018 characteristics `check` holds requirements to, the two severities, and what a green gate does and does not mean.
- `references/acceptance-criteria.md` — bad→good Given/When/Then rewrites and measurable NFR metric patterns.
- `references/forbidden-patterns.md` — the phrasings that never survive review, and the shape that replaces each.
- `references/citation-format.md` — the `[E#]` grounding convention.
- `references/grounding-coverage.md` — what the advisory coverage report means and how to raise it.
- `references/build-playbook.md` — the build loop: task TDD, FR-tag convention, milestone gates, the milestone review.
- `references/verify.md` — what each `verify` check proves and what still needs eyes.
- `references/presenting.md` — step 7: what to say when you hand the SRD over, and how to report the gates honestly.
- `references/provider-apis.md` — how OSS issues/PRs are fetched per host, keyless.
- `references/web-discovery.md` — the layered keyless web search.
- `references/semantic-setup.md` — the optional local Docker stack.
