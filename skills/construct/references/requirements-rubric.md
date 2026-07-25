# Requirement quality — the standard `check` holds you to

`construct check` does not judge requirements by taste. It anchors to
**ISO/IEC/IEEE 29148:2018 §5.2.4**, the international standard for how a
requirement must be written, and to **ISO/IEC 25010:2023** for what the
non-functional categories mean. Every lint message names the characteristic it
found violated, so a finding is a standard to meet — not an opinion to argue
with.

## The seven characteristics

| Characteristic | What it demands | What failing it looks like here |
|---|---|---|
| **unambiguous** | One reading only. No adjective standing in for a number. | "the system surfaces a clear, specific error"; "search is fast" |
| **verifiable** | A test (or an inspection) can decide pass/fail. | "the result is persisted and visible to the user"; "handled gracefully" |
| **singular** | One requirement, one need. No "and also". | an FR whose acceptance criteria describe two unrelated features |
| **complete** | Nothing left to be supplied later. | "define the contract during authoring"; a list ending in "etc." |
| **consistent** | No contradiction with another requirement or with scope. | a must-have FR delivering something SCOPE lists as out-of-scope |
| **traceable** | Reachable forward and backward. | an FR referencing no entity or interface; an NFR no FR links to |
| **feasible** | Achievable within the stated constraints. | a 99.99% target on a side-project budget with one developer |

`check` mechanises what a deterministic engine honestly can — **unambiguous**,
**verifiable**, **complete** on renderer-emitted text, and **traceable** through
the reference-closure rules. **Singular**, **consistent** and **feasible** need a
reader: they are attacks 3, 7 and 4 of `references/adversarial-review.md`. Do not
read a green gate as "these seven hold".

## Two severities, and why they differ

- **Scaffold findings are errors at `--level complex`.** These match text *only
  the renderer emits* — the four `concreteOutcome` branches, both `failurePath`
  variants, the seeded interface contract, the default success metric, the
  default assumption. Zero false positives by construction, the same reasoning
  that lets an unresolved 🧠 hard-fail. And `complex` is the level that claims
  build-readiness: an SRD whose criteria nobody wrote certifies nothing. At
  `light` the same findings warn.
- **Vagueness findings always warn.** They are a heuristic over prose you wrote,
  so they can be wrong. A heuristic that blocks a build is a heuristic people
  learn to route around — and the moment it is routed around, it stops catching
  the real ones.

So: a green `complex` gate means *no renderer scaffold survives*. It does not
mean the requirements are good. That judgement is still yours, and the
adversarial review is where it happens.

## Non-functional categories (ISO/IEC 25010:2023)

The required NFR categories map onto 25010's product-quality characteristics:

| construct category | 25010 characteristic | The metric must bound |
|---|---|---|
| performance | Performance efficiency | latency at a percentile, under a stated load and on stated hardware |
| reliability | Reliability | availability window, plus RPO/RTO for recovery |
| security | Security | the authz surface, secret handling, and the dependency policy |
| usability | Interaction capability | a task, a time, and an unaided success rate |
| observability | *(operational, not in 25010)* | what can be diagnosed without reproducing the failure |
| cost | *(constraint, not in 25010)* | unit economics against the brief's stated budget |
| privacy | Security → confidentiality | the data rights the user actually gets, and retention |
| accessibility | Interaction capability → accessibility | the conformance level and the flows it covers |

`observability` and `cost` are deliberately outside 25010 — they are operational
and commercial constraints rather than product-quality characteristics, and
saying so is more useful than forcing them into a taxonomy that does not hold
them.

## Working a finding

Each message carries the location, the offending text, the characteristic, and
the fix:

```
FR-004 acceptance #2: still the renderer's scaffold [29148 §5.2.4 unambiguous]
  — "the system rejects it with a clear, actionable error and no side effects".
  Fix: name which input is rejected, the message, and what state is left untouched.
```

Rewrite the criterion; do not rewrite it *around the regex*. The bad→good
rewrites in `references/acceptance-criteria.md` show the target, and
`references/forbidden-patterns.md` lists what never survives.
`assets/example-srd/` in the repo is a complete SRD that passes this gate — read
its acceptance criteria when you want to calibrate how specific is specific
enough.
