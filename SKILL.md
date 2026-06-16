---
name: construct
description: "Use when the user wants to turn a product idea into a serious, buildable requirements document (an SRD/PRD) — or build the app from one. Triggers: write an SRD or PRD, spec out a product, write requirements, define requirements, product specification, software requirements document, turn an idea into requirements, greenfield product spec, idea to spec, build from spec, implement the SRD. construct interviews the user, grounds every major decision in real research — competitors and market signal, comparable open-source projects and their issues/PRs, candidate-technology docs and StackOverflow pitfalls — then renders a complete SRD suite: vision, scope, numbered functional requirements with Given/When/Then acceptance criteria, NFRs, data model, interfaces, ADRs, competitive landscape, build plan, traceability. A hard structural gate plus an advisory grounding report validate it; for building, it emits a BUILD-PLAN.json task DAG and `construct verify` referees the app against the SRD."
license: MIT
metadata:
  version: 1.3.0
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
- `research --out <run> [--angles market,oss,tech,semantic] [--q "<focus>"] [--semantic]`
  — gather evidence across angles into `<run>/evidence/` (an `EVIDENCE.md` +
  `evidence.json` dossier with `[E#]` ids). Default angles: `market,oss,tech`.
- `analyze --out <run> [--json]` — the "what's thin?" report: names every
  feature/competitor/tech/seed that will render UNGROUNDED as-is, and prints the
  drill command that fixes each gap. Informational, never gates.
- `web|oss|tech|so --out <run> [--q "<focus>"] [--url ...] [--seeds ...]
  [--docs-url <u,...>]` — drill ONE angle to stdout (no dossier). Use these to
  dig deeper on a thin thread; `--docs-url` grounds known docs pages directly.
- `render --out <run> [--level light|complex] [--merge]` — render the SRD tree +
  `SRD.json` from `brief.json` + the dossier.
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
- `semantic up|down|status` — optional local Docker stack (Qdrant + Ollama +
  SearXNG).

## Workflow

You are invoked once and expected to return a complete, grounded SRD. Drive the
loop to completion; only pause to ask the user a real decision.

1. **Interview the user — one question at a time.** Establish the product before
   researching. Follow `references/interview-playbook.md`: problem, target
   users, core value, must/should/could features, constraints (budget, timeline,
   team, compliance), candidate technologies, and any competitor / OSS seeds.
   Recommend an answer with each question; don't dump a questionnaire. Write the
   answers into `brief.json` (start it with `construct init`).

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
   gap; each gets the brief one-liner, the gap, its drill command and its own
   WebSearch, and returns a ≤5-line summary plus URLs worth grounding. Subagents
   MUST NOT write into the run folder — drills print to stdout; only
   `construct research` writes the dossier, and only YOU run it. Fold findings
   in serially: `construct web --url <u,...> --out <run>` → re-run `research` →
   re-run `analyze`. (No subagents? Work the gaps yourself, one drill at a
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

5. **Adversarial review — let fresh eyes break it.** Spawn one reviewer
   subagent with NO context beyond the run folder path and
   `references/adversarial-review.md` (no subagents? do the pass yourself,
   strictly following that checklist as a hostile reader). It must try to
   *break* the SRD — ambiguity, untestable criteria, missing failure paths,
   citation-washing, contradictions — and return tagged findings. Fix every
   `[blocker]`, use judgement on `[advisory]`, then re-run `check`. Loop while
   new blockers appear (cap: 3 rounds, then surface what remains to the user).
   For a genuinely contested, hard-to-reverse ADR at `complex` level, also run
   the 3-judge panel from `references/orchestration.md`.

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
     Pattern 4), assemble `verdicts.json`, `review --apply verdicts.json`, then
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
     in `references/orchestration.md`).
   - Per milestone: `verify --out <run> --run-tests --strict`, then a
     milestone adversarial review — fresh eyes hunting for an acceptance
     criterion no test actually exercises (see the playbook;
     `references/verify.md` explains what verify can and cannot prove).
   - If an FR proves wrong while building, amend the brief, re-render
     (progress merges by feature title), retag shifted FR ids, re-`check`.

## What it produces (the SRD tree, under `--out`)

```
00-overview/   VISION.md · SCOPE.md (+ 🧠 open decisions)
requirements/  FUNCTIONAL.md (FR-NNN · priority · Given/When/Then · [E#])
               NON-FUNCTIONAL.md (NFR-NNN by category · metric · [E#])
architecture/  SYSTEM-CONTEXT.md · DATA-MODEL.md · INTERFACES.md
               decisions/NNNN-*.md  (ADRs)
competitive/   LANDSCAPE.md (competitors + OSS prior art)
BUILD-PLAN.md · BUILD-PLAN.json (task DAG for the build phase)
TRACEABILITY.md (FR ↔ NFR ↔ ADR ↔ entity ↔ interface)
evidence/      EVIDENCE.md · evidence.json · meta.json   ·   brief.json · SRD.json
```

`light` keeps it lean; `complex` adds the full NFR set, a second ADR, failure-
path acceptance criteria and the full traceability matrix. Add `--merge` for a
single-file `SRD.md`.

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

- `references/interview-playbook.md` — how to elicit the brief, one question at a time.
- `references/research-playbook.md` — picking angles and digging deeper to "good enough".
- `references/orchestration.md` — the three-tier dynamic-workflow model and the subagent patterns: research fan-out, red team, judge panel, claim-support review fan-out, build fan-out (and the one-writer rule).
- `references/adversarial-review.md` — the red-team checklist and its findings contract.
- `references/srd-authoring.md` — resolving 🧠 callouts, writing testable requirements and ADRs.
- `references/acceptance-criteria.md` — bad→good Given/When/Then rewrites and measurable NFR metric patterns.
- `references/citation-format.md` — the `[E#]` grounding convention.
- `references/grounding-coverage.md` — what the advisory coverage report means and how to raise it.
- `references/build-playbook.md` — the build loop: task TDD, FR-tag convention, milestone gates, the milestone review.
- `references/verify.md` — what each `verify` check proves and what still needs eyes.
- `references/provider-apis.md` — how OSS issues/PRs are fetched per host, keyless.
- `references/web-discovery.md` — the layered keyless web search.
- `references/semantic-setup.md` — the optional local Docker stack.
