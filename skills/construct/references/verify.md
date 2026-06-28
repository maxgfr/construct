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

## The gap that needs eyes

Greps prove *reference*; execution proves *green*; neither proves a test
faithfully encodes its acceptance criterion. That is the milestone
adversarial review in `references/build-playbook.md`: a fresh reader compares
each criterion in `SRD.json` against what the tests actually assert. Engine
for structure, agent for honesty — same split as `check` vs. grounding.
