# Orchestration — using subagents to research wider and review harder

construct's engine is single-process and deterministic; the *intelligence
scaling* happens in how you, the orchestrating agent, drive it. When your
environment offers parallel subagents (e.g. a Task/Agent tool), use the
patterns below. When it does not, every pattern degrades to a sequential
self-pass: do each role's job yourself, one at a time, explicitly switching
perspective — the prompts work unchanged as personal checklists.

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

## Pattern 1 — research fan-out (per analyze gap)

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

After render + enrichment, spawn ONE reviewer subagent with **no context
beyond** the run folder path and `references/adversarial-review.md`. Fresh
eyes are the point: do not share your reasoning, your research summaries, or
what you are proud of. Its job is to break the SRD, not improve it.

Then triage its findings: fix every `[blocker]`, judge each `[advisory]`,
re-run `check`. Loop while new blockers appear, cap at 3 rounds, surface
whatever remains to the user. Details and the output contract live in
`references/adversarial-review.md`.

## Pattern 3 — judge panel (contested ADRs, `complex` level only)

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

## Budget guidance

- Fan-out (pattern 1): cheap per agent; bound the loop by gap priority, not
  agent count.
- Red team (pattern 2): one agent per round, ≤3 rounds. Always worth round 1.
- Judge panel (pattern 3): 3 agents per ADR — only at `complex` level, only
  for contested ADRs, normally ≤2 panels per SRD.

No subagent capability available? Run the same three patterns as sequential
self-passes in the order 1 → 2 → 3. The discipline (output contracts, one
writer, fix-then-recheck) is what raises quality; parallelism only buys speed.
