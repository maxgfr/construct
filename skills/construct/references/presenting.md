# Presenting the SRD

This is the only moment in the run that faces the user. Everything before it was
machinery; what they judge is this message. The failure mode is a wall of
structure — "5 FRs, 7 NFRs, 3 ADRs, check passes" — which tells them nothing
about whether the thing is worth building.

**Lead with the decisions, not the artifact.** They already know they asked for
an SRD. What they cannot see without reading the whole tree is what you decided
on their behalf, what the research changed, and what is still open.

## The shape

Six short blocks, in this order. Aim for something they can read in two minutes,
with the tree available if they want it.

1. **What this is, in one sentence.** The product, its user, its differentiator.
   Take it from VISION.md — if you cannot say it in a sentence, the vision is
   not done.
2. **What the research changed.** The most valuable thing you can tell them:
   two or three places where evidence moved a decision away from the obvious
   choice. "You listed PostgreSQL full-text search; the docs put typo tolerance
   behind significant custom work [E3], so the stack ADR adds Meilisearch and
   pays for a second service."
3. **The load-bearing decisions.** One line per ADR: the decision, the reason,
   the cost it carries, and its `[E#]`. Name the cost — an ADR presented as
   pure upside reads as unconsidered.
4. **Scope, as a boundary.** What is in the first release and, explicitly, what
   is out. The non-goals are the part they will argue with; surface them rather
   than burying them in SCOPE.md.
5. **What is still unknown.** Assumptions you recorded, threads the research
   could not settle, and anything you would want validated before building.
   **Pin these explicitly rather than smoothing them over** — an SRD that
   pretends to certainty it does not have is worse than one with a short list of
   honest gaps.
6. **What it costs to build.** The milestone shape from BUILD-PLAN.md — must →
   should → could, and how many tasks each holds. Not an estimate in days unless
   the brief gave you a basis for one.

Then: the run folder path, and the one-line state of the gates.

## Reporting the gates honestly

The user cannot tell a green gate from a strong SRD, so say which you have:

- `check` passing means **structurally complete and no renderer scaffold
  survives**. It does not mean the requirements are good.
- The grounding percentage is **coverage, not correctness** — it counts
  citations, not whether they hold.
- If you ran `review` + `check --semantic`, say so and give the verdict spread.
  If you did not, say that the citations are unverified rather than letting the
  percentage imply otherwise.
- If you used `--allow-unverified`, say it in this message. That flag turns a
  gate into a warning; the user is entitled to know it was turned off.

## What not to do

- **Don't recite the file tree.** They can list the directory.
- **Don't report counts as achievements.** "7 NFRs" is not a result; "the
  performance target is p95 < 300 ms on 2 vCPU, taken from the search engine's
  own benchmark [E3]" is.
- **Don't bury an open question in prose.** If a decision is deferred, it is a
  bullet in block 5 with the shape of the decision to be made.
- **Don't claim grounding you did not get.** "0 sources found for the pricing
  question; recorded as an assumption" is a fine thing to say, and the only
  honest one when it is true.

## Then ask one question

Close by asking what they want next — sharpen a thread, decide an open question,
or start the build (step 8). Do not start building unprompted: the SRD was the
deliverable they asked for, and the build is a much larger commitment.
