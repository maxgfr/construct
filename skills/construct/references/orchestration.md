# Orchestration — dynamic workflows for wider research and harder review

> **The engine now EMITS these patterns.** `construct orchestrate --out <run>
> [--phase research|claim-review|adr-judges|build] [--adr <id>] [--eco] [--list]`
> generates, from the run's CURRENT state, one launchable workflow script per
> fan-out pattern below (Pattern 1 → `research`, Pattern 4 → `claim-review`,
> Pattern 3 → `adr-judges`, Pattern 5 → `build`), the dispatch contracts
> (`<run>/orchestration/agents/<role>.md`, each ending with the one-writer rule)
> and a sequential `RUNBOOK.md` for tier 3 — absolute paths and the real
> worklist units baked in. Pattern 2 (the adversarial review) is deliberately
> not emitted: it is ONE fresh-eyes reviewer, not a fan-out. The prose below
> stays the source of truth at every tier.

construct's engine is single-process and deterministic; the *intelligence
scaling* happens in how you, the orchestrating agent, drive it. Each pattern
below is a **dynamic workflow** — a shape (parallel fan-out, bounded loop, or
serial reduce) wrapped around construct's deterministic commands — and you run
it at whichever of three tiers your environment supports:

1. **Workflow primitive** — if your harness offers a declarative orchestration
   construct (a typed pipeline / parallel-map / loop step with built-in
   concurrency control), express the pattern in it: each role becomes a step
   with an explicit input and output contract, and the engine commands are the
   leaf calls.
2. **Parallel subagents** — if your harness offers a spawn primitive (a
   Task/Agent-style tool) but no declarative workflow, drive the same fan-out
   and serial fold-in by hand.
3. **Sequential self-pass** — if neither exists, play each role yourself, one at
   a time, switching perspective explicitly. The role prompts work unchanged as
   personal checklists.

**The prose is tier-agnostic on purpose.** A workflow step, a spawned subagent,
and a self-pass are three executions of the *same* role contract and the *same*
serial fold-in. Higher tiers buy speed and structure; they never change what is
correct. Two rules survive every tier and are non-negotiable: the **one-writer
rule** (below) and each pattern's **output contract**. Honour those and any tier
is safe; violate them and no tier is.

## The serialization rule (read this first)

**Drill commands never write the dossier; only `construct research` does.**
`web|oss|tech|so` print evidence to stdout. This is what makes parallel
research safe — and it implies a hard rule:

- Subagents NEVER write into the run folder. They drill, search, read, and
  *return text* (a summary + URLs worth grounding).
- YOU — the orchestrator — are the only writer. You fold findings in
  serially: `construct web --url <u1,u2> --out <run>` to inspect pages, then
  one `construct research` re-run to rebuild the dossier, then `analyze` to
  re-measure. One writer, many readers — no races, no clobbered evidence.
- Never run two `construct research` (or any dossier-writing command) at the
  same time on one run folder: the second clobbers `evidence/` and re-assigns
  the `[E#]` ids the first one's citations point at. Exactly one `research`
  re-run per fold-in.
- The same rule governs **every** run-folder write, not just the dossier:
  `review` / `review --apply` (the claim-support worklist + `VERIFY.json`,
  Pattern 4) and, in the build phase, `BUILD-PLAN.json` (Pattern 5). Subagents
  read and return text; you alone write the run folder, serially.

## Pattern 1 — research fan-out (per analyze gap)

*Shape: parallel-map (one branch per `analyze` gap) → serial reduce (fold-in) →
loop (re-`analyze` until clean). Map branches are read-only and independent; the
reduce is the sole writer.*

After the first `research`, run `construct analyze --out <run> --json`. For
each gap, dispatch one subagent **in parallel**. Each subagent's prompt
carries exactly:

1. the product one-liner (`brief.idea`),
2. the gap, verbatim (e.g. `tech: "PostgreSQL" has no docs/StackOverflow grounding`),
3. the matching drill command from `analyze` (run it with
   `node scripts/construct.mjs ... --json` and read the items),
4. permission to use its own WebSearch for what the drill misses,
5. the output contract: *return only* (a) a ≤5-line summary of what was
   found and why it matters to this product, and (b) a list of URLs worth
   grounding, best first. **Do not write any file.**

Collect the returned URL lists, then fold in serially (you, alone):

```
node scripts/construct.mjs web --url <u1,u2,...> --out <run> --q "<gap focus>"
node scripts/construct.mjs research --out <run>
node scripts/construct.mjs analyze --out <run>
```

Loop until `analyze` reports no gaps on must-have features and load-bearing
decisions, or the user says stop. Prioritise: a `must` feature gap is worth
two more rounds; a `could` feature gap is worth zero.

## Pattern 2 — adversarial review (red team)

*Shape: bounded loop (review → fix → re-`check`). The review body is ONE role —
a single fresh-eyes reader holding the whole SRD. Do not split the eight attacks
across reviewers: the sharpest findings (a contradiction between two sections, a
citation-wash) only surface to a reader who sees all of it at once.*

After render + enrichment, spawn ONE reviewer subagent with **no context
beyond** the run folder path and `references/adversarial-review.md`. Fresh
eyes are the point: do not share your reasoning, your research summaries, or
what you are proud of. Its job is to break the SRD, not improve it.

Then triage its findings: fix every `[blocker]`, judge each `[advisory]`,
re-run `check`. **Loop until dry** — terminate when a round surfaces no new
blocker. Backstop: if you hit 3 rounds still finding blockers, stop and take the
remainder to the user as a real decision (an SRD that won't go dry in 3 rounds
has a structural problem worth a human). Details and the output contract live in
`references/adversarial-review.md`.

## Pattern 3 — judge panel (contested ADRs, `complex` level only)

*Shape: fixed parallel-map (one branch per lens, fan-out of 3) → majority reduce.
No loop; each branch is pure — inputs are pasted in, no run-folder access.*

Token-expensive; reserve it for ADRs that are genuinely contested — the user
hesitated, the evidence conflicts, or the decision is hard to reverse
(datastore, hosting model, sync architecture). Never panel a trivial ADR.

For one contested ADR, spawn three judges in parallel. Each receives ONLY the
ADR text and the snippets of the `[E#]` evidence it cites (paste them — the
judge must not need the run folder), plus one lens:

- **Feasibility** — can this team build it in this timeline on this stack?
- **Operations & cost** — what does it cost to run, observe, upgrade, exit?
- **User value** — does this decision serve the stated users and value prop?

Output contract per judge: a score 1–5 and a one-paragraph rationale, nothing
else. Decide by majority (≥2 judges scoring ≥3): record the panel outcome in
the ADR's *Alternatives considered* section (one line per lens), and flip
`status: proposed → accepted` only on a pass. On a fail, take the strongest
rationale back to the user as a real decision to make.

## Pattern 4 — claim-support review fan-out (SRD grounding)

*Shape: deterministic worklist (engine) → parallel-map per claim↔evidence pair →
serial reduce (merge fragments → `review --apply`) → deterministic gate
(`check --semantic`).*

`construct review --out <run>` mechanises grounding adjudication: it pairs every
grounded SRD claim with each cited `[E#]` item's snippet (EVERY cited pair by
default; `--max-review N` caps at the N highest-score pairs and names the
dropped ones in VERIFY.md) and writes the worklist to
`VERIFY.todo.json` + `VERIFY.md`. **Each pair is independent** — the ideal
fan-out unit, and the engine already accepts the sharded-then-merged shape.

1. **You** run `construct review` (a run-folder write — never two at once on one
   run, same rule as `research`).
2. **Fan out:** map one branch per pair (or per small batch — keep fan-out ≤ the
   cap). Paste each pair's fields into the branch: `claimId`, `kind`, the claim
   text, `evidenceId`, `source`, and `digest` (the snippet). The branch reads
   only what you pasted (it may open the source URL for more context), judges the
   claim↔evidence link, and returns **only** the verdict fragment below. **No
   branch writes any file or touches the run folder.**
3. **Reduce (you, alone):** concatenate the returned fragments into one
   `verdicts.json` — order-independent, each pair keyed by `claimId`+`evidenceId`,
   so no coordination is needed (`verdicts.json` is your scratch file, not a
   run-folder write — it can live anywhere). Then
   `construct review --apply verdicts.json --out <run>` writes `VERIFY.json` (a
   run-folder write, yours alone).
4. **Gate:** `construct check --out <run> --semantic` fails structurally on any
   refuted/unsupported claim. Fix (re-cite, re-research, or weaken the claim),
   then loop from step 1 if citations changed.

**Output contract (per pair) — return ONLY this JSON, no prose:**

```
{ "claimId": "<verbatim>", "evidenceId": "<verbatim>",
  "verdict": "supported|partial|refuted|unsupported",
  "note": "<≤200 chars: why>" }
```

`supported` = the cited evidence directly backs the claim; `partial` = it backs a
weaker version; `unsupported` = irrelevant / doesn't bear on it; `refuted` = it
contradicts the claim. Copy the ids verbatim and use one of the four tokens (an
invalid token reads as unadjudicated, not as a failure).

**One-writer subtlety:** `VERIFY.todo.json` / `VERIFY.json` are run-folder files
— only you write them, via `review` and `review --apply`. Subagents never run
`review`; they return text fragments you merge.

**Edge cases.** Dangling citations are excluded from the worklist (that is a
`check` coverage problem, not a support problem — don't conflate). A dropped or
garbled branch leaves its pair *unadjudicated* — `review --apply` cross-checks
the worklist, so a pair you omit from `verdicts.json` is still reported as
unadjudicated (not silently passed); `check --semantic` warns but does not fail.
Re-dispatch dropped pairs if the claim is load-bearing. The `verdicts.json` must
be a JSON array or `{ "pairs": [...] }` — any other shape is rejected outright
(it would otherwise overwrite `VERIFY.json` with a vacuous pass). A re-render or
re-`research` re-assigns `[E#]`/claim ids, so **regenerate the worklist before
fanning out** — never adjudicate a stale `VERIFY.todo.json`.

**No subagents?** Work `VERIFY.md` top to bottom yourself, filling each verdict,
then the same `review --apply` → `check --semantic`. The fan-out is the only
thing that changed.

## Pattern 5 — build fan-out within a milestone

*Shape: compute the ready frontier → parallel-map (one isolated git worktree per
ready task) → serial reduce (fold status/artifacts/tests; `verify`) → loop to the
next frontier.*

Same-milestone build tasks carry no dependency edges between them
(`BUILD-PLAN.json` only adds cross-milestone shared-entity edges), so a
milestone's **ready frontier** is independent and parallelisable. After `T-000`
is `done`, get the frontier from `construct status --out <run> --json`
(`frontier` = buildable now), map one subagent per ready task into its own git
worktree, and have each TDD its task and **return** its diff/artifacts/tests — it
never edits `BUILD-PLAN.json`. You alone fold the results in and run `verify`.
The DAG models only *data-entity* dependencies, not *file* collisions, so
serialise the frontier subset that would touch app-shared files (routing, schema,
the test harness). Full mechanics, the one-writer rule for `BUILD-PLAN.json`, and
the failure modes live in `references/build-playbook.md`.

## Budget guidance

- Fan-out (pattern 1): cheap per agent; bound the loop by gap priority, not
  agent count.
- Red team (pattern 2): one agent per round, loop until dry, ≤3 rounds. Always
  worth round 1.
- Judge panel (pattern 3): 3 agents per ADR — only at `complex` level, only
  for ADRs meeting Pattern 3's contested bar (the user hesitated, the
  evidence conflicts, or the decision is hard to reverse). Hard cap: ≤2
  panels per SRD; if a third ADR seems contested, take it to the user as a
  question instead.
- Claim-support (pattern 4): cheap per branch; every cited pair is in the
  worklist by default (`--max-review N` caps explicitly — the dropped pairs
  are named in VERIFY.md and stay unadjudicated). Batch pairs to keep fan-out
  modest. Always worth one pass over the load-bearing FRs/ADRs before
  presenting.
- Build (pattern 5): one agent per ready task, bounded by the frontier width
  minus the shared-file tasks you serialise. Speedup only — never run the
  milestone gate (`verify --run-tests --strict`) until the whole frontier is
  folded in.

At the **workflow-primitive** tier, set the parallel step's max-concurrency to
the pattern's fan-out cap (gaps, pairs, or frontier width). The reduce step stays
serial and single-writer regardless of tier — never let the primitive's
concurrency touch the fold-in.

No subagent capability available? Run every pattern as a sequential self-pass in
order. The discipline (output contracts, one writer, fix-then-recheck) is what
raises quality; parallelism only buys speed.
