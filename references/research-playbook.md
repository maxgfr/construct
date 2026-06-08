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
   - `construct so   --out <run> --q "<tech> <known failure mode>"`
   Or use your own **WebSearch**, then ground the page:
   `construct web --out <run> --url <url>`.
4. **Fold it in.** Re-run `research` (or keep drilling) so new findings land in
   the dossier with fresh `[E#]` ids.
5. **Report and let the user steer.** Summarise what you found and what's still
   thin. Keep digging on what they care about; **stop when they say it's good
   enough** ("c'est bon"). Don't gold-plate threads that won't change a decision.

## Heuristics

- Ground the **load-bearing** decisions first: the stack choice, the
  build-vs-buy calls, the differentiators. A cited "could-have" matters less.
- Prefer a *primary* source: a competitor's own page, the tech's official docs,
  an actual issue thread — over a listicle.
- An honest "no evidence found, treating as an assumption" beats a fabricated
  citation. Record it as an assumption or an `openQuestion`, not as fact.
- More angles ≠ better. Three well-drilled threads beat ten shallow ones.
