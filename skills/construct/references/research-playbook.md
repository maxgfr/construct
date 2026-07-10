# Research playbook — angles, depth, and "good enough"

Research grounds the SRD's positioning, scope, NFRs and architecture decisions in
real signal. Run the broad pass, read the dossier, then **dig deeper on what
matters** and stop when the user says it's enough.

## The angles

```
construct research --out <run> --angles market,oss,tech[,semantic] [--q "<focus>"]
```

| Angle | What it grounds | Emits |
|-------|-----------------|-------|
| `market` | positioning, competitors, pricing, demand | `market` |
| `oss` | prior art + real pitfalls from comparable repos | `oss`, `issue`, `pr` |
| `tech` | feasibility: candidate-tech docs + known pitfalls | `docs`, `so` |
| `semantic` | re-ranks the above by relevance (local embeddings) | (rescoring) |

Default is `market,oss,tech`. Add `semantic` (with `--semantic`) once the local
stack is up.

## The loop

1. **Broad pass.** Run `research` with the default angles. Read
   `<run>/evidence/EVIDENCE.md` end-to-end.
2. **Spot the thin threads.** A decision with no evidence, a competitor you
   can't characterise, a candidate tech with no docs grounding, a feature whose
   feasibility is unproven.
3. **Drill.** Expand one thread at a time (prints to stdout, writes nothing):
   - `construct web  --out <run> --q "<competitor> pricing model"`
   - `construct oss  --out <run> --seeds https://github.com/o/r`
   - `construct tech --out <run> --q "<tech> <hard requirement>"`
   - `construct tech --out <run> --docs-url <u,...>` — you already know the
     docs page(s); fetch and ground them directly, no discovery, never trimmed.
   - `construct so   --out <run> --q "<tech> <known failure mode>"`
   Or use your own **WebSearch**, then ground the page:
   `construct web --out <run> --url <url>`.
   All drills honour `--per-source <n>` (default 6); raise it to dig deeper on
   one thread, lower it to keep a bloated dossier focused.
4. **Fold it in.** Re-run `research` (or keep drilling) so new findings land in
   the dossier with fresh `[E#]` ids.
5. **Report and let the user steer.** Summarise what you found and what's still
   thin. Keep digging on what they care about; **stop when they say it's good
   enough** ("c'est bon"). Don't gold-plate threads that won't change a decision.

## Stopping heuristic — what "good enough" means

"Stop when the user says so" needs a default you can recommend. After each
`analyze` round, propose stopping when all three hold:

1. no `must` feature gap remains;
2. every candidateTech has docs or StackOverflow grounding;
3. each load-bearing ADR input (stack, datastore, build-vs-buy) has ≥1 primary
   source.

Cap yourself at **3 analyze→drill rounds** unless the user asks for more. A
`could` feature gap is never worth a round on its own (mirrors the priority
rule in `references/orchestration.md`). Surface what's still thin and let the
user overrule in either direction.

## When research returns nothing

The engine degrades honestly — empty angles land as notes in `EVIDENCE.md`
("SearXNG unreachable", "No comparable OSS projects found"), never as fake
items. Recovery path, in order:

1. Re-check the brief: vague `candidateTech`/`competitors` produce vague
   queries. Sharpen them, re-run `research`.
2. Search yourself (your own WebSearch), then ground the best pages by pinning
   them into a `research` re-run: `construct research --out <run> --url <u,...>`
   (add `--docs-url <d,...>` for docs pages). The `web`/`tech` drills only print
   to stdout — `research --url`/`--docs-url` is what persists to the dossier.
3. Still nothing? Record an explicit assumption or `openQuestion` and move
   on. A 0%-grounded SRD renders and passes the structural gate; the advisory
   coverage report will say so honestly. Never fabricate a citation.

## Resuming an interrupted run

Everything lives on disk under `--out`; nothing is in memory. Start with
`construct status --out <run>` to see what exists (`brief.json`,
`evidence/`, `SRD.json`, `BUILD-PLAN.json`). Then:

- `analyze`, `check`, and all drills are read-only — always safe.
- `research` rebuilds the dossier atomically and **re-assigns `[E#]` ids** —
  if an SRD was already rendered, re-check its citations afterwards.
- `render` re-renders and renumbers FR/NFR ids, but BUILD-PLAN task progress
  merges by feature title, so build state survives.

## Heuristics

- Ground the **load-bearing** decisions first: the stack choice, the
  build-vs-buy calls, the differentiators. A cited "could-have" matters less.
- Prefer a *primary* source: a competitor's own page, the tech's official docs,
  an actual issue thread — over a listicle.
- An honest "no evidence found, treating as an assumption" beats a fabricated
  citation. Record it as an assumption or an `openQuestion`, not as fact.
- More angles ≠ better. Three well-drilled threads beat ten shallow ones.
