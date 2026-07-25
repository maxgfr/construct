# `example-srd/` — a finished construct SRD

Nothing else in this repo shows what a *completed* run looks like. The fixtures
under `tests/fixtures/` are inputs; the README shows commands. This directory is
the output: a full `--level complex` SRD suite for **Readpile** (a self-hosted
read-it-later app), authored to the point where it passes the gate.

It exists to answer one question an agent or a reader keeps having to guess at:
*how good does a requirement have to be before `construct check` accepts it?*

## What it is

Rendered from `brief.json` + `evidence/evidence.json` (the same fixtures the
tests use), then **authored** — which is the step the skill's workflow assigns
to the agent, and the step the scaffold cannot do for you:

- 15 acceptance criteria across 5 functional requirements, each with an
  observable outcome and a bound a test could assert;
- a failure path on every requirement, naming the specific behaviour rather than
  "an error is shown";
- 7 NFRs with real targets (p95 < 300 ms on 2 vCPU, RPO ≤ 24 h, < $10/month) —
  no "a measurable target is agreed and tracked";
- 3 ADRs with their alternatives and the consequence the team actually eats;
- a data model of 3 entities with real attributes, and 2 interfaces with real
  contracts and failure modes;
- brand design tokens instead of the seeded neutrals.

## What it proves

CI runs, on every commit:

```
construct render --out assets/example-srd --from-srd   # tree must match SRD.json
construct check  --out assets/example-srd --min-grounding 66
```

So the example proves three things: the rendered tree is in sync with the gated
manifest, an authored SRD passes the hard structural gate, and ≥ 66% of its
requirements and decisions carry a citation that resolves.

## What it does NOT prove — and why that is left visible

- **The claim-support gate has not been run on it.** `check --semantic` requires
  adjudicating each claim↔evidence pair, and the fixture dossier is synthetic —
  adjudicating synthetic evidence would teach the wrong lesson about what a
  verdict means. `check` reports this honestly as `Semantic gate: SKIPPED` with
  10 cited claims never adversarially verified. Run `construct review` against a
  real dossier to see that half.
- **Grounding sits at 66%, not 100%.** All 5 functional requirements and all 3
  ADRs cite resolving evidence; only 2 of 7 NFRs do. That is the honest shape of
  a real run: the load-bearing decisions are grounded, and the security /
  reliability / cost targets are engineering judgement the dossier does not
  cover. `references/grounding-coverage.md` argues for exactly this — chase
  grounding on the decisions a reader would challenge, not on a percentage.
- **No app was built from it.** `BUILD-PLAN.json` is emitted and well-formed,
  but every task is `todo`; `construct verify` has nothing to referee yet.

Papering over any of these would make the example a better advertisement and a
worse reference.

## Regenerating it

`scripts/author-example.mjs` holds the authoring pass, so the example can be
rebuilt after a renderer change rather than hand-patched:

```
rm -rf assets/example-srd && mkdir -p assets/example-srd/evidence
cp tests/fixtures/sample-brief.json assets/example-srd/brief.json
cp tests/fixtures/sample-evidence.json assets/example-srd/evidence/evidence.json
node scripts/construct.mjs render --out assets/example-srd --level complex
node scripts/author-example.mjs assets/example-srd/SRD.json
node scripts/construct.mjs render --out assets/example-srd --from-srd
node scripts/construct.mjs check --out assets/example-srd --min-grounding 66
```

The authored content lives in the script, not in the rendered markdown — the
same rule the skill gives its users: edit `SRD.json`, then `render --from-srd`.
