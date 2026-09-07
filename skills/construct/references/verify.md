# What `construct verify` proves — and what it cannot

`verify` is the deterministic referee between `BUILD-PLAN.json`, `SRD.json`
and the app directory. Knowing exactly what each check proves keeps you (and
the user) honest about the build.

## Static checks (always run, pure reads)

| Check | Proves | Does NOT prove |
|---|---|---|
| plan parses, schema version, unique ids | the plan is machine-readable | the plan is sensible |
| DAG acyclic, `dependsOn` resolve | the task order is executable | the order is optimal |
| `frIds` / `acceptance` refs resolve into SRD.json | the plan builds *this* SRD, no orphan claims | the SRD itself is right (that is `check`'s job) |
| done tasks' `artifacts`/`tests` exist under the app dir | the declared files are real | the files do what the task says |
| FR-tag grep over test files (`conventions.frTagPattern`) | each FR is *referenced* by at least one test | the test actually exercises the criterion — a test can name FR-001 and assert nothing |
| stale-tag warning | tags match the current SRD's FR ids | — |

Exit ≠ 0 on any hard error. `--strict` upgrades "a built must-have FR has no
referencing test" from warning to error — use it at every milestone gate.

## `--run-tests` (opt-in execution)

Runs `conventions.testCommand` and every done task's `verify.commands` inside
the app directory (your own toolchain — the engine installs nothing). Proves
**the suite passes**. Does not prove the suite is honest: a weakened
assertion, a skipped test, or a tautological expect all pass. It is opt-in
because executing user-declared commands is side-effectful — never run it on
a plan you have not read.

## Criterion execution: `--acceptance --run-tests`

Use this gate before claiming the complete app is implemented. First run
`verify --out <run> --acceptance --json` without execution. Its nonzero result
contains `acceptanceResults`: each current `{frId,index,criterion,fingerprint}`.
Read each full FR and its dedicated test, then add exactly one mapping to the
owning done task's `verify.criteria` array in `BUILD-PLAN.json`:

```json
{"frId":"FR-001","index":0,"fingerprint":"<from current acceptanceResults>","command":"node tests/save-one-value.test.mjs","timeoutMs":5000}
```

The task must declare that acceptance reference. Use a command selecting the
specific assertion/case; do not bind every criterion to an unrelated green suite.
Run `verify --out <run> --strict --acceptance --run-tests --json` and retain its
JSON as execution evidence. The command never reads a saved success report.
`passed` means that this freshly executed, bound command exited 0 with complete
bounded output; `failed` means execution failed/timed out/overflowed;
`not-tested` means no authorization or a missing, duplicate, stale, invalid or
unfinished mapping. Any non-passed criterion fails the gate, including criteria
of tasks not yet done. Empty criterion sets fail. Incremental milestone checks
may therefore remain static until the entire declared scope is implemented.

Fingerprints include the full current FR, not its displayed excerpt. After any
FR edit or re-render, review stale mappings and their tests before rebinding;
never copy fresh hashes blindly onto old tests. Commands use the existing
platform-shell contract in the app directory, timeout 1–600000 ms (default 600000),
with at most 65536 captured bytes per stream. The criterion adapter preserves
native error/signal/timeout metadata; even a timed-out command exiting 0 fails.
On POSIX it terminates its own process group after execution, including ordinary
children. Detached descendants and Windows process trees are not supervised:
commands must terminate those themselves and must not start persistent services.
This is not a sandbox. Read the plan and obtain execution authorization.
The original static gate and generic `--run-tests` do not certify per-criterion
execution; they remain available for compatibility.

## The gap that needs eyes

Greps prove *reference*; execution proves *green*; neither proves a test
faithfully encodes its acceptance criterion. That is the milestone
adversarial review in `references/build-playbook.md`: a fresh reader compares
each criterion in `SRD.json` against what the tests actually assert. Engine
for structure, agent for honesty — same split as `check` vs. grounding.
