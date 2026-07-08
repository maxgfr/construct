# Brainstorm playbook — diverging before you converge

The interview (`references/interview-playbook.md`) is **convergent**: it elicits
decisions the user already holds and records them. Brainstorm is the optional
**divergent** step that comes first — it *generates* candidate ideas WITH the
user, so the brief starts from a considered set of options instead of the first
thing that came to mind.

The engine persists and merges; **you** run the session.

## When to run it

- **Scope gate escape hatch.** The interview's scope gate says "no articulable
  idea → help them get to one first." That help is this playbook: run
  `construct brainstorm` and diverge until a real product shape emerges.
- **The user wants to explore.** "I have a rough idea but want to think it
  through", "what else could this be?", "help me brainstorm" → start here,
  then hand off to the interview once the wishlist has taken shape.
- **Skip it** when the user already knows exactly what they want — go straight
  to the interview. Brainstorm is never mandatory.

## The commands

- `construct brainstorm --out <run>` scaffolds `brainstorm.json` + a
  `BRAINSTORM.md` board (needs an initialized run — `init` first; the idea is
  seeded from `brief.idea`). Re-running it re-renders the board from the JSON
  without clobbering your ideas.
- `construct brainstorm --out <run> --merge` folds every **kept** idea into
  `brief.json` by its `target`, and every **parked** idea into `openQuestions`.
  Idempotent — an already-merged idea is never folded twice.

## Running the session

Generate ideas **one angle at a time**, 3–5 per angle, WITH the user — propose,
let them react, and recommend a status for each. The six angles, in order:

1. **reframe** — different framings of the problem itself ("is this really about
   X, or about Y?").
2. **segment** — distinct user segments this could serve (each may want a
   different product).
3. **feature** — concrete capabilities the product could have.
4. **differentiator** — what would make it stand out vs the alternatives.
5. **anti-goal** — things it should deliberately NOT do (these protect scope).
6. **wildcard** — deliberately unconventional swings; most get rejected, a few
   reframe everything.

Write each idea into `brainstorm.json` as
`{ id, angle, title, notes?, status, target?, priority? }`. Assign ids
sequentially (`B-001`, `B-002`, …).

## Adjudicating — the statuses

Every idea carries a `status`:

- **proposed** — generated, not yet decided. `construct check` warns while any
  remain (advisory — it never gates).
- **kept** — fold it into the brief on `--merge`. A kept idea MUST have a
  `target` (see below), or the merge warns and skips it (retryable — set a
  target and re-merge).
- **parked** — a real idea, deferred. On `--merge` it becomes an `openQuestions`
  entry — which renders as a **🧠 Decide callout that BLOCKS the structural
  gate** until resolved. Park deliberately: you are committing the team to
  decide it before the SRD can pass `check`.
- **rejected** — considered and dropped. Left untouched; never merged.

## Targets — where a kept idea lands

Set `target` on every kept idea:

| target | brief field | note |
|---|---|---|
| `featureWishlist` | a new feature | honours `priority` (default `could`) |
| `competitors` | market angle seed | |
| `goals` | an outcome | conflicts with an existing nonGoal → skipped |
| `nonGoals` | an anti-goal | conflicts with an existing goal → skipped |
| `candidateTech` | a stack/service to evaluate | |
| `openQuestions` | a deferred decision (🧠) | `title — notes` if notes exist |

Merges dedupe case-insensitively by title, so re-running is safe.

## Handing off

Once the wishlist has taken shape, `--merge`, then switch to
`references/interview-playbook.md` to fill in the remaining brief fields
(problem, users, valueProp, constraints, …) and resolve any 🧠 the parked ideas
introduced. From there the normal loop continues: research → render → check.
