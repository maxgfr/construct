# Build playbook — from a validated SRD to a verified app

The engine plans and verifies; **you write every line of app code**. The
contract is `BUILD-PLAN.json` (next to `BUILD-PLAN.md`): the engine derives
its structure from the SRD on every render, and you own the progress fields.
`construct verify` is the referee between the two.

## The contract

Engine-derived (a re-render refreshes these — never hand-edit):
`id`, `title`, `milestone`, `frIds`, `acceptance` (pointers into `SRD.json` —
read the criteria there, they are never copied), `dependsOn`,
`conventions.frTagPattern`.

Agent-owned (a re-render preserves these, keyed by the feature title):
`conventions.testCommand`, `conventions.appDir`, and per task `artifacts`,
`tests`, `verify.commands`, `status` (`todo` → `in-progress` → `done`).

**One-writer rule (build phase).** `BUILD-PLAN.json` is a run-folder file; only
the orchestrator writes it — exactly as only `construct research`/`review` write
the dossier and verdicts. When you fan a build out (below), a subagent NEVER
edits `BUILD-PLAN.json` (or `SRD.json`): it builds in its own worktree and
*returns* its artifacts/tests/status, and you alone fold those in, then run
`verify`. Parallel writers would clobber each other's `status`/`artifacts` and
corrupt the merge-by-title contract.

**The FR-tag convention is load-bearing.** Every test you write must name the
FR id it exercises (in the describe/it string or a comment) — e.g.
`describe("FR-001 save an article", …)`. This is exactly what
`construct verify` greps (`conventions.frTagPattern`, default `FR-\d{3}`).
No tag → the FR reads as untested, and `--strict` fails the build for
must-haves.

## Setup (once)

1. Read `BUILD-PLAN.json`; topologically order the tasks by `dependsOn`
   (milestones already order must → should → could).
2. Do `T-000`: scaffold the app repo, choose and wire the test harness, CI.
   Set `conventions.appDir` (app directory, relative to the run folder or
   absolute) and `conventions.testCommand` (e.g. `pnpm test`). Mark `T-000`
   done with its artifacts.

## The task loop (every FR task)

1. **Pick** the next task whose `dependsOn` are all done. Set
   `status: "in-progress"`.
2. **Read the spec, not your memory:** the FR's description and each
   acceptance criterion via the task's `acceptance` pointers into `SRD.json`.
3. **TDD against the criteria.** For each acceptance criterion, write a
   failing test whose name carries the FR id and mirrors the Given/When/Then.
   Implement until green. Failure-path criteria get failure-path tests.
4. **Record:** fill `artifacts` (the source files that implement it) and
   `tests` (the test files), both app-relative. Add any extra
   `verify.commands` worth running for this task (lint, a smoke script).
5. **Set `status: "done"`**, then referee:
   ```
   node scripts/construct.mjs verify --out <run>
   ```
   Static, fast — run it after EVERY task. Fix any error before moving on.
6. **Per milestone**, run the full gate:
   ```
   node scripts/construct.mjs verify --out <run> --run-tests --strict
   ```
   It executes `testCommand` + every done task's `verify.commands`, and fails
   if a built must-have FR has no referencing test.

## Parallel build within a milestone (optional)

The task DAG is built for this: within a milestone, tasks carry no edges to each
other (only cross-milestone shared-entity edges exist), so a milestone's ready
frontier is independent. When you can spawn subagents AND isolate their file
writes, build the frontier in parallel (Pattern 5 in
`references/orchestration.md`):

1. **Gate `T-000` first.** Every task depends on it; there is no frontier until
   the skeleton, test harness, `conventions.appDir` and `conventions.testCommand`
   are in place.
2. **Get the frontier.** `node scripts/construct.mjs status --out <run> --json`
   returns `frontier` (buildable now) and `blocked` (with what each waits on) —
   don't hand-compute it from the DAG.
3. **Serialise the file-collision subset.** The DAG models *data-entity*
   dependencies, not *file* collisions. Two "independent" tasks that both edit an
   app-shared file — a route table, the DI container, a DB schema/migration, a
   barrel/index export, CI config, or the **test-harness** config — will conflict.
   Pull those out and run them serially; fan out only the file-disjoint remainder.
4. **Map.** One subagent per remaining ready task, each in its **own git
   worktree**. Give it the task's `frIds`, the acceptance criteria from
   `SRD.json`, and `conventions`. It TDDs the task (every test names its FR id),
   runs the test command in its worktree, and **returns** — it writes nothing in
   the run folder. Output contract: `{ taskId, frIds, artifacts[], tests[],
   verifyCommands[], diffRef, testResult, notes }`.
5. **Reduce (you, alone).** Merge worktrees back **one at a time** (you own
   conflict resolution — a clean attribution per merge beats debugging a tangle),
   fold each task's `status:"done"` + `artifacts` + `tests` + `verify.commands`
   into `BUILD-PLAN.json`, and run `node scripts/construct.mjs verify --out <run>`
   (static) after each fold. **Reserve the strict gate
   (`verify --run-tests --strict`) for after the whole frontier is merged** —
   `verify`'s FR-tag grep is global, so a mid-frontier `--strict` false-fails
   must-haves whose tests aren't merged yet.
6. **Loop** to the next frontier — folding `status:"done"` eagerly is what
   unblocks the next milestone's entity-dependent tasks.

**No worktrees or no subagents?** The serial task loop above is unchanged.
Parallel build is a pure speedup over file-disjoint tasks; it changes nothing
about correctness.

## The milestone review (adversarial)

After each milestone passes `verify --run-tests --strict`, spawn one reviewer
subagent (or do a hostile self-pass). Give it ONLY: the milestone's FR ids,
their acceptance criteria from `SRD.json`, and the diff (or file list) of
what you built. Its question: **which acceptance criterion is not actually
exercised by any test?** A test that names an FR but asserts something weaker
than the criterion is the main target — `verify` greps names, the reviewer
checks honesty. Fix what it finds before starting the next milestone.

## When reality pushes back

- **An FR proves unimplementable / wrong as specified:** do not silently
  build something else. Amend the brief (or `SRD.json` + the rendered docs
  together), re-render, and re-run `check`. The plan merge keys progress by
  feature title, so other tasks keep their status. Then retag any tests whose
  FR ids shifted — `verify` warns about stale tags.
- **A re-render renumbered FR ids:** `verify` reports "tests reference FR
  id(s) absent from the SRD". Retag those tests before trusting coverage.
- **A dependency is blocked:** mark the task back to `todo`, note why to the
  user, and pick another ready task.

## What "done" means

A milestone is done when: every task is `done`, `verify --run-tests --strict`
exits 0, and the milestone review found nothing unaddressed. The build is
done when every milestone is — then `construct status` shows
`build: N/N tasks done`, and you present the app against the SRD's success
metrics, not just its file tree.
