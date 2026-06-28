# Grounding coverage — the advisory report

`construct check --out <run>` runs two independent passes:

1. **Structural gate (HARD).** Fails the build (exit ≠ 0) on an incomplete SRD:
   unresolved `🧠`/TODO, an FR with no acceptance criteria, a dangling
   entity/interface/NFR reference, a missing required NFR category, or a
   malformed ADR. This must pass.
2. **Grounding coverage (ADVISORY).** Never changes the exit code. It tells you
   how well-grounded the SRD is, so you can decide where to invest more research.

This split is deliberate: **completeness is enforced; grounding is judged.** A
structurally-perfect SRD with thin grounding still "passes" — the report is there
to keep you honest, not to block you.

## Reading the report

```
Grounding coverage (advisory — does not fail the build):
  functional:     4/5 grounded (80%)
  non-functional: 3/7 grounded (43%)
  decisions:      2/2 grounded (100%)
  citations: 11 · resolved: 11 · dangling: 0 · uncited evidence: 2
```

- **functional / non-functional / decisions** — the fraction of FRs / NFRs / ADRs
  carrying at least one citation that resolves to `evidence.json`.
- **citations / resolved** — total `[E#]` referenced by the SRD vs. how many
  resolve. A gap means **dangling** ids (evidence that moved or was removed).
- **uncited evidence** — items in the dossier nothing in the SRD references.
  Informational: maybe irrelevant, maybe a missed insight worth using.

## Raising coverage that matters

Don't chase 100%. Chase grounding on the **decisions a reader would challenge**:

- The **stack ADR** and any build-vs-buy call → cite `docs`/`oss`/`so`.
- The **differentiators** in the competitive landscape → cite `market`/`oss`.
- **NFR targets** you claim as numbers → cite where the number came from.
- **Must-have FRs** whose feasibility was in doubt → cite the `tech`/`oss`
  evidence that settles it.

A `could`-have feature with no citation is fine. A core architecture decision
with no citation is a flag. Fix dangling ids regardless — they signal a citation
that lost its evidence.

## Improving it

Re-run or drill the relevant angle (`research-playbook.md`), then add the new
`[E#]` to the requirement/decision it grounds (`citation-format.md`), and
re-check.
