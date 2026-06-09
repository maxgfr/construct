---
name: construct
description: "Use when the user wants to turn a product idea into a serious, buildable requirements document (an SRD/PRD) — e.g. 'write an SRD for my app idea', 'spec out this product', 'turn my idea into requirements', 'design the requirements for X'. construct interviews the user about the product, then GROUNDS every major decision in real research — competitors and market signal (keyless web: SearXNG → DuckDuckGo → your WebSearch), comparable open-source projects and their issues/PRs (GitHub/GitLab), candidate-technology official docs and StackOverflow pitfalls, and an optional local semantic pass (Qdrant + Ollama) — writing an evidence dossier the SRD cites. It then renders a complete SRD suite (vision, scope, numbered functional requirements with Given/When/Then acceptance criteria, non-functional requirements, system context, data model, interfaces, ADRs, competitive landscape, build plan, traceability) and validates it: a HARD structural completeness gate plus an ADVISORY grounding-coverage report. Triggers: SRD, PRD, software requirements document, spec a product, requirements from an idea, greenfield product spec, idea to requirements."
license: MIT
metadata:
  version: 1.0.1
---

# construct — a product idea, grounded into a buildable SRD

`construct` turns a product idea into a **Software Requirements Document suite**
whose requirements and decisions are **grounded in real research**, not the
model's memory. The deterministic engine (`scripts/construct.mjs`, zero-dep
Node) does the searching, dossier assembly, SRD rendering and validation **with
code**; your job is to run the interview, drive the research, and enrich the
rendered scaffold into a precise, well-grounded SRD.

> **The core rule:** prefer a *grounded* requirement to a *guessed* one. Use the
> research the engine retrieves (competitors, OSS prior art, tech docs,
> StackOverflow) to justify scope, NFRs and architecture decisions, and cite the
> evidence with `[E#]`. Grounding is **advisory** here — `construct check`
> reports coverage but never fails on it — so the rigor is yours to apply.

## The script

One committed, dependency-free bundle: `node scripts/construct.mjs <command>`.
No `npm install`, no API keys. Run `--help` for the full surface. Key commands:

- `init --idea "<one-liner>" --out <run>` — scaffold a run folder + `brief.json`.
- `research --out <run> [--angles market,oss,tech,semantic] [--q "<focus>"] [--semantic]`
  — gather evidence across angles into `<run>/evidence/` (an `EVIDENCE.md` +
  `evidence.json` dossier with `[E#]` ids). Default angles: `market,oss,tech`.
- `web|oss|tech|so --out <run> [--q "<focus>"] [--url ...] [--seeds ...]` — drill
  ONE angle to stdout (no dossier). Use these to dig deeper on a thin thread.
- `render --out <run> [--level light|complex] [--merge]` — render the SRD tree +
  `SRD.json` from `brief.json` + the dossier.
- `check --out <run>` — the HARD structural gate (exit ≠ 0 on an incomplete SRD)
  plus the ADVISORY grounding-coverage report.
- `status --out <run>` — what exists in the run so far.
- `semantic up|down|status` — optional local Docker stack (Qdrant + Ollama +
  SearXNG).

## Workflow

You are invoked once and expected to return a complete, grounded SRD. Drive the
loop to completion; only pause to ask the user a real decision.

1. **Interview the user — one question at a time.** Establish the product before
   researching. Follow `references/interview-playbook.md`: problem, target
   users, core value, must/should/could features, constraints (budget, timeline,
   team, compliance), candidate technologies, and any competitor / OSS seeds.
   Recommend an answer with each question; don't dump a questionnaire. Write the
   answers into `brief.json` (start it with `construct init`).

2. **Research — ground the idea.** Run:
   ```
   node scripts/construct.mjs research --out <run> --angles market,oss,tech
   ```
   This discovers competitors on the web, mines comparable OSS projects (and
   their issues/PRs for real pitfalls), and pulls candidate-tech docs +
   StackOverflow. Read `<run>/evidence/EVIDENCE.md`.

3. **Dig deeper — until it's good enough.** Where a thread is thin, drill it:
   `construct web|oss|tech|so --out <run> --q "<narrower question>"` (or use your
   own WebSearch and ground a page with `construct web --url <u> --out <run>`).
   Re-run `research` to fold new findings in. Tell the user what you found and
   **let them steer** — keep digging on what matters, stop when they say it's
   enough. See `references/research-playbook.md`.

4. **Render the SRD.** When the brief is solid and the dossier is rich:
   ```
   node scripts/construct.mjs render --out <run> --level complex
   ```
   This writes the SRD tree (see below). Then **enrich it**: resolve every
   `🧠 Decide:` callout, sharpen the generic acceptance criteria into real
   Given/When/Then, flesh out the data model and interfaces, and add `[E#]`
   citations from the dossier to the requirements and decisions they rest on.
   See `references/srd-authoring.md` and `references/citation-format.md`.

5. **Validate (two layers).**
   - *Structural (hard):* `node scripts/construct.mjs check --out <run>`. It
     fails on any unresolved `🧠`, no functional requirements at all, an FR with
     no acceptance criteria, a dangling entity/interface/NFR reference, a missing
     required NFR category, or a malformed ADR. Fix until it passes.
   - *Grounding (advisory):* the same command prints coverage — what fraction of
     requirements/decisions cite evidence. Raise it where it matters (the load-
     bearing decisions); see `references/grounding-coverage.md`. It never fails
     the build, so use judgement.
   Loop steps 3–5 until `check` passes structurally and the grounding is honest.

6. **Present.** Give the user the SRD suite: the vision, the competitive
   landscape, the grounded requirements and the key decisions (with their `[E#]`
   evidence and links). Pin any unknowns explicitly rather than guessing.

## What it produces (the SRD tree, under `--out`)

```
00-overview/   VISION.md · SCOPE.md (+ 🧠 open decisions)
requirements/  FUNCTIONAL.md (FR-NNN · priority · Given/When/Then · [E#])
               NON-FUNCTIONAL.md (NFR-NNN by category · metric · [E#])
architecture/  SYSTEM-CONTEXT.md · DATA-MODEL.md · INTERFACES.md
               decisions/NNNN-*.md  (ADRs)
competitive/   LANDSCAPE.md (competitors + OSS prior art)
BUILD-PLAN.md · TRACEABILITY.md (FR ↔ NFR ↔ ADR ↔ entity ↔ interface)
evidence/      EVIDENCE.md · evidence.json · meta.json   ·   brief.json · SRD.json
```

`light` keeps it lean; `complex` adds the full NFR set, a second ADR, failure-
path acceptance criteria and the full traceability matrix. Add `--merge` for a
single-file `SRD.md`.

## Optional semantic mode (fully local, no API key)

The market/OSS/tech angles need nothing but network access. For a relevance pass
over the gathered evidence you can enable a local embedding model:

```
node scripts/construct.mjs semantic up        # docker: Qdrant + Ollama + SearXNG
node scripts/construct.mjs research --out <run> --angles market,oss,tech,semantic --semantic
```

Everything runs in local Docker containers — no key, no data leaves the machine.
If the stack isn't up, `--semantic` logs a notice and keeps the lexical ranking.
See `references/semantic-setup.md`.

## References

- `references/interview-playbook.md` — how to elicit the brief, one question at a time.
- `references/research-playbook.md` — picking angles and digging deeper to "good enough".
- `references/srd-authoring.md` — resolving 🧠 callouts, writing testable requirements and ADRs.
- `references/citation-format.md` — the `[E#]` grounding convention.
- `references/grounding-coverage.md` — what the advisory coverage report means and how to raise it.
- `references/provider-apis.md` — how OSS issues/PRs are fetched per host, keyless.
- `references/web-discovery.md` — the layered keyless web search.
- `references/semantic-setup.md` — the optional local Docker stack.
