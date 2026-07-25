# Retrieval performance — measured baseline

Measured with `node scripts/bench.mjs --network` on the committed bundle, using
`tests/fixtures/sample-brief.json` (3 candidate technologies, 3 competitors, 2
OSS seeds: `omnivore` and `wallabag` — ~663 MB of clones). macOS, home network.
Every run produced the **same 27 evidence items from the same 13 requests**, so
the numbers below compare cost, not coverage.

Re-measure with:

```
rm -rf "$(node -e 'console.log(require("os").tmpdir())')/construct"   # clone cache
node scripts/construct.mjs cache clean --all                          # page cache
node scripts/bench.mjs --network
```

(`$TMPDIR/construct` is the clone cache — note that on macOS `os.tmpdir()` is
*not* `/tmp`.)

## Before (v2.6.0)

| Phase | Wall-clock | Requests |
|---|---:|---:|
| **research** | **17 907 ms** | 13 |
| market | 17 184 ms | 4 |
| oss | 13 666 ms | 0 |
| tech | 9 391 ms | 9 |
| render + check | 81 ms | — |

Two things stand out, and they are the same thing:

- **market spent 17 s on four requests.** Pages were fetched one at a time.
- **oss spent 13.7 s issuing no HTTP requests at all.** That time was `git
  clone` — run through `spawnSync`, which blocks Node's event loop. The angles
  are launched with `Promise.all`, so while the clone ran, market's and tech's
  in-flight fetches could not progress. The concurrency was nominal.

## After

Cold means: no clones on disk, no cached pages. Warm means a repeat run — which
is exactly what the skill's dig-deeper loop does on every fold-in.

| Run | Total | research | market | oss | tech | Requests | Cache hits |
|---|---:|---:|---:|---:|---:|---:|---:|
| before | 18 063 ms | 17 907 ms | 17 184 | 13 666 | 9 391 | 13 | 0 |
| after, cold | **9 319 ms** | 9 170 ms | 1 742 | 9 122 | 1 700 | 13 | 0 |
| after, warm | **1 921 ms** | 1 773 ms | 1 739 | 1 567 | 1 468 | 8 | 5 |

- **Cold: 1.9× faster.** The remaining 9.1 s is the git clone of two large
  repos — real I/O that has to happen once. It no longer freezes anything else.
- **market 10× faster, tech 5.5× faster**, on identical request counts: that is
  the un-blocking plus the bounded-concurrency fetch pool.
- **Warm: 9.4× faster than the original.** The fold-in re-run the workflow
  mandates went from ~18 s to ~1.9 s.

## What changed

| Change | Where |
|---|---|
| `git clone` / `gh` moved off `spawnSync` | `src/util.ts` (`shAsync`), `src/clone.ts`, `src/providers/github.ts` |
| Bounded-concurrency fetch pool | `src/research/pool.ts`, applied in `web.ts`, `tech.ts`, `oss.ts` |
| On-disk page cache (TTL + ETag revalidation) | `src/research/cache.ts` |
| SearXNG reachability memoised (1 probe, not 5) | `src/research/web.ts` |
| Issues and PRs queried together per seed | `src/research/oss.ts` |
| Embedding calls overlapped | `src/research/semantic.ts` |
| Evidence tokens memoised per item | `src/srd.ts` |

## Guarding it

`tests/perf-contract.test.ts` asserts the properties that produced these
numbers — the pool's width, that page fetches actually overlap, that one
reachable URL costs one request, and that a repeat fetch costs zero. A change
that re-serialises a loop turns them red; nothing else in the suite would
notice, because a serial loop and a pool return identical results.

Per-angle cost is also recorded into every run's `evidence/meta.json` and
summarised at the foot of `EVIDENCE.md`, so a slow run can be diagnosed after
the fact instead of only while watching it.
