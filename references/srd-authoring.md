# SRD authoring — turning the scaffold into a real SRD

`construct render` produces a *complete but generic* SRD scaffold: one functional
requirement per feature, templated acceptance criteria, the required NFRs, ADRs
from the candidate stack, a competitive table, a build plan and a traceability
matrix — with `[E#]` hooks auto-attached where evidence keyword-matched. Your job
is to raise it from "structurally complete" to "actually good."

## The conventions

- **`🧠 Decide:`** — an open decision (from `brief.openQuestions` or a field left
  blank). The **hard `check` fails** while any remain. Resolve each by making the
  decision: fold it into an ADR, a requirement, or scope — then remove it from
  the brief and re-render (or edit the rendered file and `SRD.json` together).
- **`[E#]`** — an inline citation to a dossier evidence item. Append it to any
  claim it grounds. Empty = ungrounded (the advisory coverage flags it).

## Where to spend effort

1. **Acceptance criteria.** Replace the generic Given/When/Then with concrete,
   *testable* behaviour, including failure paths. `check` warns while any still
   carry the renderer's template phrasing. Follow
   `references/acceptance-criteria.md` — worked bad→good rewrites and the
   four-point checklist (observable outcome, bounded numbers, concrete actor,
   no restated requirement).
2. **Data model** (`architecture/DATA-MODEL.md`). The scaffold is *seeded by
   inference* from the feature titles — entity names with minimal `id`/`createdAt`
   attributes. **Verify, don't trust:** rename wrong entities, add the missing
   ones, give each its real attributes, and keep `FR.entities` in sync so the
   traceability matrix and the closure check stay meaningful.
3. **Interfaces** (`architecture/INTERFACES.md`). Also seeded by inference (one
   per detected external boundary + the primary UI surface). Verify each, define
   its actual contract, and keep `FR.interfaces` in sync.
4. **ADRs.** The scaffold gives a stack ADR (and, at `complex`, a data ADR).
   Ground them with `[E#]` from `docs`/`oss`/`so`, and add any other *material*
   decision (auth, hosting, sync model, build-vs-buy).
5. **NFRs.** Tighten the metric for each to something measurable and
   product-specific (per-category patterns and examples in
   `references/acceptance-criteria.md`). Ground the load-bearing ones.
6. **Competitive landscape.** Replace the generic notes with what the evidence
   actually says — the differentiator, the gap you're filling.

## Keep the model and the tree in sync

`SRD.json` is the source of truth the `check` reads for structure. If you edit a
rendered `.md` by hand (e.g. add entities), mirror the change into `SRD.json`
(or re-render from an enriched brief). The structural gate verifies references
close: every `FR.entities/interfaces/nfrs` must name something that exists.

## Levels

- `light` — lean: core NFRs, one ADR, one acceptance criterion per FR.
- `complex` — full NFR set, a second ADR, a failure-path criterion per FR, the
  full 5-way traceability matrix. Use it for anything you intend to build.
