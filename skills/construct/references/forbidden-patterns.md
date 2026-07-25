# Forbidden patterns — phrasings that never survive review

`references/acceptance-criteria.md` shows what good looks like. This is the
negative space: constructions that are always wrong in a requirement, what they
smell like, and the shape that replaces them. `construct check` catches some of
these deterministically (see `references/requirements-rubric.md`); the rest are
what the adversarial reviewer hunts.

## In a `Then` clause

| Never write | Why it fails | Write instead |
|---|---|---|
| "is handled gracefully" | Names no observable outcome — 29148 *verifiable* | "returns HTTP 429 with a Retry-After header; the queued item is retried once after 30 s" |
| "works correctly" / "behaves as expected" | Restates the requirement | the post-condition: what exists, where, with what value |
| "an error is shown" | Which error? To whom? What happened to the data? | "the save is rejected naming the HTTP status; nothing partial is written; the input is preserved" |
| "is persisted and visible to the user" | The renderer's own tautology | "the record appears at the top of the list within 2 seconds" |
| "the action succeeds and …" | "Succeeds" is not a post-condition | drop it; state the post-condition directly |
| "fast" / "quickly" / "responsive" | Unbounded — 29148 *unambiguous* | a number and a unit, at a percentile, under a stated load |
| "scalable" / "performant" / "efficient" | A property of a system, not a testable outcome | the load it holds and the latency it holds it at |
| "secure" / "reliable" / "robust" | A category, not a criterion | the specific threat handled, or the availability figure |
| "intuitive" / "user-friendly" / "seamless" | Unfalsifiable | a task-completion measure with a time and a success rate |
| "etc." / "and so on" / "among others" | Leaves the builder guessing — 29148 *complete* | enumerate; if the list is genuinely open, say what governs membership |
| "as appropriate" / "as needed" | Defers the decision to whoever builds it | make the decision, or raise it as an `openQuestion` (🧠) |
| "should ideally" / "where possible" | Not a requirement at all | decide: is it a `must`, a `should`, or out of scope? |

## In a requirement description

- **Two capabilities in one FR** ("save an article *and* tag it"). Split them —
  29148 *singular*. Both the build plan and the traceability matrix key off one
  FR meaning one thing.
- **A requirement that names no actor.** "The data is synced" — by whom, through
  which surface? The build phase cannot test a subject-less sentence.
- **A requirement restating an NFR** ("search must be fast"). Performance belongs
  in an NFR with a metric; the FR states the capability.
- **An implementation dressed as a requirement** ("use a Redis queue"). That is
  an ADR. A requirement says what must be true, not how.

## In an NFR metric

- **"A measurable target is agreed and tracked."** This promises measurement
  instead of measuring. It is the renderer's placeholder; replace it.
- **A number with no source.** Prefer a bound from the brief or the evidence, and
  cite it. If you must invent one, say so in the metric itself ("target,
  unvalidated") rather than presenting a guess as a finding.
- **A target the product cannot fail.** "99% of requests succeed" with no load,
  no window and no measurement point is unfalsifiable in practice.

## In an ADR

- **A decision with no alternative considered.** Then it was not a decision.
- **Consequences that are all upside.** Every real architectural choice costs
  something; an ADR that names no cost has not been thought through, and it is
  the first thing a reviewer attacks.
- **A citation that does not bear on the decision** — a marketing page grounding
  a technical claim, or one snippet cited for two opposing claims. This is
  citation-washing, and it is a blocker, not a style note
  (`references/adversarial-review.md`, attack 4).

## The test

For any clause you are unsure about: **could a developer who has never spoken to
you write an automated test from this, without asking a single question?** If
the answer needs a conversation, the requirement is not done.
