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
   - **market** — competitors & positioning (SearXNG → DuckDuckGo → your WebSearch;
     pages cleaned through a local Firecrawl when its stack is up),
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
# optional: diverge first, then fold kept ideas into the brief
node scripts/construct.mjs brainstorm --out ./readpile            # scaffold BRAINSTORM.md
node scripts/construct.mjs brainstorm --out ./readpile --merge    # kept → brief.json
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

## Use it as an MCP server

The skill shells out to the CLI and parses its output. An MCP server skips both:
your agent calls construct as typed tools, with JSON schemas in and structured
results out. Same engine, same page cache, no wrapper.

```bash
# stdio — the default, and what Claude Code / Claude Desktop / Cursor expect
claude mcp add construct -- node /abs/path/to/scripts/construct.mjs mcp

# or over HTTP, on loopback
node scripts/construct.mjs mcp --transport http --port 7342
claude mcp add --transport http construct http://127.0.0.1:7342/mcp
```

```jsonc
// Claude Desktop takes stdio servers only — a remote URL here will not work.
{ "mcpServers": { "construct": { "command": "node", "args": ["/abs/path/to/scripts/construct.mjs", "mcp"] } } }
// Cursor, HTTP:
{ "mcpServers": { "construct": { "url": "http://127.0.0.1:7342/mcp" } } }
```

It serves all three MCP primitives, because a skill is three things: the engine
(**tools**), the method (**prompts**), and the documentation the method refers
to (**resources**). Here that matters more than usual: `check` gates structure
and grounding is advisory, so a client given only the tools produces a
well-shaped SRD full of decisions nobody researched — and every gate goes green.

### Tools

| Tool | What it does |
|------|--------------|
| `construct_status` | What exists in the run, and the exact next command |
| `construct_research` | The only command that grounds anything — market, OSS, tech → a dossier |
| `construct_research_angle` | Probe ONE angle (web/oss/tech/so), persist nothing |
| `construct_analyze` | What is thin, and the command that fills each gap |
| `construct_render` | The SRD suite: requirements, ACs, NFRs, ADRs, build plan, traceability |
| `construct_check` | The structural gate (grounding coverage is advisory) |
| `construct_review` | Claim↔evidence worklist — where advisory grounding becomes real |
| `construct_verify` | Referee a built app against its SRD |
| `construct_cache` | What the page cache holds |
| `construct_read` | A file, or a line range, from the run |

`--allow-write` additionally exposes `construct_init`, which scaffolds a run
folder on disk. Pass `--out <run>` at startup to dedicate the server to one SRD
— `run` then becomes optional on every tool.

### Prompts — the workflow, not just the tools

| Prompt | Arguments | What it drives |
|--------|-----------|----------------|
| `interview_idea` | `idea` | The questions whose answers change what gets built — one at a time, following the surprising answer |
| `enrich_srd` | `run` | evidence → testable requirements → check → review |
| `judge_adr` | `run`, `decision?` | Ground a technology choice in its docs, its open issues, and what people hit in production |

Each states the thing the gates cannot: **the rigor is yours**. A green
`construct_check` means the SRD is well-*formed*, not well-*researched*.

### Resources — the skill's own documentation

`SKILL.md` and all 19 `references/*.md` are served under `skill://`, read off
disk at request time — so a documentation fix reaches every client without a
rebuild.

Two things worth knowing:

- **`construct_research` is the slow one** — a network fan-out across angles,
  minutes on a first run. Re-runs are nearly free thanks to the page cache.
- **The HTTP transport binds `127.0.0.1` and refuses anything else** unless you
  pass `--allow-remote`. This server fetches arbitrary URLs and reads local
  files; an exposed port is a fetch-anything primitive for whoever finds it.

## Optional local stacks

```
node scripts/construct.mjs semantic up    # Qdrant + Ollama + SearXNG, fully local, no key
node scripts/construct.mjs firecrawl up   # Firecrawl, fully local, no key (~3 GB, own profile)
```

The first adds embedding-based re-ranking (`--semantic`) and keyless web
discovery. The second swaps the built-in regex HTML stripper for **browser-based
main-content extraction** on every page fetch — the only way a JS-rendered page
yields evidence at all. Both are optional and degrade quietly: when a stack is
down, research runs exactly as it did before and says so in the dossier notes.

See [`references/semantic-setup.md`](skills/construct/references/semantic-setup.md)
and [`docker/firecrawl/README.md`](docker/firecrawl/README.md).

## License

MIT © maxgfr

## PDF sources

A `.pdf` URL or an `application/pdf` response goes through an **extractor
ladder** (`src/research/pdf/`): `npx @firecrawl/pdf-inspector@1` → `npx @firecrawl/anydoc@0.1` (the PDF on
stdin, in a child process) → the self-hosted Firecrawl → `pdftotext` → a
built-in dependency-free reader — stopping at the first rung whose output passes
a quality gate, and REFUSING rather than quoting a PDF none of them could read.

**Office documents** — `.docx`/`.doc`/`.odt`/`.rtf`, `.pptx`/`.ppt`/`.odp`,
`.xlsx`/`.xls`/`.ods`, `.epub`, `.csv` — go through their own two-rung ladder
(`src/research/doc/`): `npx @firecrawl/anydoc@0.1` (the bytes on stdin, converted to
GitHub-Flavored Markdown) → the self-hosted Firecrawl. Same gate, same refusal.

The refusal is the point: these are ZIP and OLE containers, so the fall-through
this replaced did not degrade the evidence, it fabricated it — a `.docx` was
quoted into requirements as if it were prose, as kilobytes of replacement characters, silently. anydoc needs
Node 20+, so an unavailable converter is a normal outcome rather than a
misconfiguration; `CONSTRUCT_DOC_ENGINE=none` disables the ladder.

Without it a PDF body was returned verbatim: its bytes decoded as UTF-8, cached,
and quoted into requirements as if it were prose. The gate rejects text laced
with C0/C1 control bytes or U+FFFD at ANY length — the built-in reader can emit
16 MB of image-stream garbage for a 12 MB paper, which every length-limited
check waves through.

`CONSTRUCT_NO_NPX=1` drops the npx rung; `CONSTRUCT_PDF_ENGINE=<rung>` pins one.

## Shared container stack

The stack is **shared with the sibling skills** (ultrasearch, construct,
ultradoc): one compose project, one set of containers, one set of volumes. They
used to define three separate projects on the same host ports, so only one could
be up at a time — starting a second failed on the port *after* leaving its
sidecars running. Bringing it up from any of them now targets the same
containers, so the second is a no-op and the RAM is paid once.

Upgrading from a version with per-skill container names? Remove the old ones
once — this file can no longer stop them, and they still hold the ports:

```bash
docker rm -f $(docker ps -aq --filter name='^(ultrasearch|construct|ultradoc)-')
```
