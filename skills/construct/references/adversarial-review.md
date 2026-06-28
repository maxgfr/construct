# Adversarial SRD review — the red-team checklist

You are reviewing a rendered SRD run folder **to break it, not to improve
it**. Assume the author was rushed and optimistic. Read only what is in the
run folder; judge only what is written, not what was probably meant. You have
read access only — change nothing.

Read in this order: `SRD.json` (the model), then `00-overview/`,
`requirements/`, `architecture/` (including `decisions/`), `competitive/`,
`BUILD-PLAN.md`, `TRACEABILITY.md`, and `evidence/EVIDENCE.md` for what the
citations actually say.

## The attacks

Work through all eight. For each hit, capture the file and the exact text.

1. **Ambiguity hunt.** Every "fast", "easy", "secure", "scalable", "simple",
   "robust", "intuitive", "seamless" without a number or a falsifiable
   definition next to it. An adjective is not a requirement.
2. **Untestable Then-clauses.** For each acceptance criterion: could a
   developer write an automated test from it without asking a question? "Then
   it works correctly" / "is handled gracefully" / "is persisted and visible"
   fail this. Flag criteria still carrying renderer-template phrasing.
3. **Must-haves without failure paths.** Every `must` FR needs at least one
   criterion covering invalid input, an unreachable dependency, or a partial
   failure — with the *specific* expected behaviour, not "an error is shown".
4. **Ungrounded load-bearing decisions.** For each ADR: if this decision is
   wrong, does the product fail? If yes and it cites no `[E#]` — or the cited
   evidence does not actually support the decision text (read the snippet!) —
   flag it. Citation-washing is a blocker, absence is at least advisory.
5. **Orphaned model elements.** Entities no FR references; interfaces with no
   related FRs; NFRs no FR links to; FRs absent from every build-plan
   milestone. Inferred-then-never-verified entities (bare `id`/`createdAt`
   attributes on a load-bearing entity) count.
6. **Interface gaps vs. SYSTEM-CONTEXT.** Every external boundary named in the
   system-context prose must have a matching interface with a contract sketch;
   every integration-touching FR must have a failure-path criterion for that
   boundary being down.
7. **Scope contradictions.** VISION promises vs. SCOPE's out-of-scope vs. what
   the FRs actually deliver vs. nonGoals. A success metric no FR can move is a
   contradiction. So is a must-have FR serving no stated user.
8. **Evidence honesty.** Spot-check 3–5 citations against
   `evidence/EVIDENCE.md`: does the snippet really say what the citing claim
   implies? Marketing pages grounding technical qualities, and one snippet
   cited for opposite claims, are blockers.

## Output contract

Return ONLY a numbered findings list, hardest-hitting first. Each finding:

```
N. [blocker|advisory] <file>: "<exact text attacked>"
   Attack: <why this fails — one or two sentences>
   Demand: <the minimal change that would survive this attack>
```

- `[blocker]` — the SRD misleads a builder or cannot be implemented as
  written (untestable must-have, contradiction, citation-washing, missing
  failure path on a must, load-bearing orphan).
- `[advisory]` — weakens the SRD but a competent builder recovers (vague
  could-have, thin-but-honest grounding, style).

No praise, no summary of strengths, no rewriting the SRD yourself. If you
find nothing after genuinely attempting all eight attacks, return exactly:
`No findings — attacks 1–8 attempted.`
