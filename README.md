# construct

Turn a product idea into a **grounded, buildable SRD suite** — a Software
Requirements Document whose requirements and decisions rest on **real research**
(competitors, open-source prior art, technology docs, known pitfalls), not the
model's memory. A [skills.sh](https://skills.sh) agent skill.

`construct` is the companion to [`reconstruct`](https://github.com/maxgfr/reconstruct)
(rebuild a repo into PRDs) and [`ultradoc`](https://github.com/maxgfr/ultradoc)
(answer questions grounded in a repo). Same engineering: a single committed,
**zero-dependency** Node bundle + a thick agent playbook, fully tested, released
by Conventional Commits.

## What it does

1. **Interview** the user about the product (one question at a time) → `brief.json`.
2. **Research** the idea across keyless angles → an evidence dossier with `[E#]` ids:
   - **market** — competitors & positioning (SearXNG → DuckDuckGo → your WebSearch),
   - **oss** — comparable open-source projects + their issues/PRs (GitHub/GitLab),
   - **tech** — candidate-technology docs + StackOverflow pitfalls,
   - **semantic** *(optional)* — a local-embedding relevance pass (Qdrant + Ollama).
3. **Analyze** the dossier: name every feature/competitor/tech/seed that would
   render ungrounded, with the drill command that fixes each gap.
4. **Render** a complete SRD tree (vision, scope, numbered functional requirements
   with Given/When/Then, non-functional requirements, system context, an
   *inferred* data model and interfaces, ADRs, competitive landscape, build plan,
   traceability) + `SRD.json` + a machine-readable `BUILD-PLAN.json` task DAG. At
   `--level complex` it also renders a **design system** (`design/`: principles,
   design tokens, components, screens/flows, an accessibility contract); pass
   `--no-design` to skip it.
5. **Check** it: a **hard** structural-completeness gate, an **advisory**
   grounding-coverage report (opt-in `--min-grounding` threshold), and — via
   `review` + `check --semantic` — an opt-in **claim-support** gate that fails
   on any cited evidence that doesn't actually back its claim.
6. **Verify** the build *(optional)*: the agent implements the app task-by-task
   from `BUILD-PLAN.json` (`status --json` lists the buildable task frontier so
   independent same-milestone tasks can be built in parallel); `construct verify`
   referees it against the SRD — declared files exist, every requirement is
   referenced by a test, and (with `--run-tests`) the declared test commands pass.

No API keys. No `npm install` at skill-use time.

## Install

```
npx skills add maxgfr/construct
```

## Use (standalone CLI)

```
node scripts/construct.mjs init --idea "a self-hosted read-it-later app" --out ./readpile
# …fill ./readpile/brief.json via the interview…
node scripts/construct.mjs research --out ./readpile --angles market,oss,tech
node scripts/construct.mjs analyze  --out ./readpile          # what's thin? drill it
node scripts/construct.mjs render   --out ./readpile --level complex
node scripts/construct.mjs check    --out ./readpile          # add --min-grounding 70 to enforce
node scripts/construct.mjs review   --out ./readpile          # adjudicate each cited [E#] → verdicts.json
node scripts/construct.mjs check    --out ./readpile --semantic   # gate refuted/unsupported claims
node scripts/construct.mjs verify   --out ./readpile --app ./readpile-app --run-tests --strict
```

Add `--merge` to also emit a single-file `SRD.md`. Run `--help` for the full
surface, or see [`SKILL.md`](skills/construct/SKILL.md) for the agent playbook and
[`DOCUMENTATION.md`](DOCUMENTATION.md) for internals.

## Output

```
00-overview/   VISION.md · SCOPE.md
requirements/  FUNCTIONAL.md · NON-FUNCTIONAL.md
architecture/  SYSTEM-CONTEXT.md · DATA-MODEL.md · INTERFACES.md · decisions/NNNN-*.md
design/        PRINCIPLES.md · DESIGN-TOKENS.md (+ design-tokens.json) · COMPONENTS.md · SCREENS.md · ACCESSIBILITY.md   (complex; --no-design to skip)
competitive/   LANDSCAPE.md
BUILD-PLAN.md · BUILD-PLAN.json (task DAG for the build phase) · TRACEABILITY.md
evidence/      EVIDENCE.md · evidence.json · meta.json   ·   brief.json · SRD.json
VERIFY.md · VERIFY.todo.json · VERIFY.json (claim-support review, from `review`)
```

## Grounding is advisory; completeness is enforced

`construct check` separates the two axes. The **structural gate** fails the build
on an incomplete SRD (unresolved `🧠` decisions, an FR with no acceptance
criteria, a dangling reference, a missing required NFR category, a malformed
ADR). The **grounding coverage** is a report — it tells you how well-cited the
SRD is so you can invest research where it matters, but it never fails the build
by default. When you *do* want it enforced, `--min-grounding <0-100>` opts into
a second gate that fails below the threshold.

Coverage counts citations; it does not check they *hold*. `construct review`
builds a claim↔evidence worklist (one pair per cited `[E#]`); an agent (or a
fan-out of skeptic subagents — see `references/orchestration.md`) adjudicates
each as `supported | partial | refuted | unsupported`, and `check --semantic`
turns that into a third opt-in gate that fails on a refuted or unsupported
claim.

## Optional local stack

```
node scripts/construct.mjs semantic up   # Qdrant + Ollama + SearXNG, fully local, no key
```

See [`references/semantic-setup.md`](skills/construct/references/semantic-setup.md).

## License

MIT © maxgfr
