# Citation format — grounding the SRD with `[E#]`

Every grounded claim in the SRD cites the evidence it rests on by id. Grounding
is **advisory** in `construct` — `check` reports coverage but never fails on it —
so the discipline is yours. A cited decision is one a reader can verify; an
uncited one is one they must trust.

## The grammar

- **`[E1]`** — the canonical form. `E` + the evidence item's number, exactly as
  it appears in `<run>/evidence/EVIDENCE.md` / `evidence.json`.
- Stack them for multiple sources: `… because competitors X and Y both do this
  [E3][E7].`
- Put the citation **next to the claim it supports**, not at the end of a
  paragraph. Each claim carries its own evidence.

## Where citations live in the model

The renderer attaches ids to these fields (and you add more during authoring):

| Field | Renders as |
|-------|-----------|
| `FR.rationaleEvidence` | `## FR-001 — … [E#]` |
| `NFR.rationaleEvidence` | `## NFR-001 — … [E#]` |
| `ADR.evidence` | on the **Decision** line |
| `CompetitorRow.evidence` / `OssRow.evidence` | the Evidence column in LANDSCAPE.md |

## Rules of thumb

- Cite the **load-bearing** claims: the stack choice, the differentiators, the
  feasibility calls, the NFR targets you derived from real numbers.
- Don't fabricate. If no evidence supports a claim, either retrieve more (see
  `research-playbook.md`), mark it an assumption, or raise it as an
  `openQuestion` — never invent an `[E#]`.
- A dangling `[E#]` (one not in `evidence.json`) shows up in the coverage report
  as a warning. It won't fail the build, but fix it — it means a citation lost
  its evidence.

## What `check` reports (advisory)

`construct check --out <run>` prints, per section, the fraction of requirements
and decisions that carry a *resolving* citation, plus any dangling ids and any
evidence never cited. Raise coverage where it matters; see
`grounding-coverage.md`.
