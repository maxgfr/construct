import { join } from "node:path";
import { oneWriterFooter, type PhaseInfo } from "./engine.js";
import type { AdrPanelPayload } from "./orchestrate.js";

// ---------------------------------------------------------------------------
// Templates for `construct orchestrate` — the generator that turns the run's
// CURRENT file-backed state into a launchable multi-agent Workflow per phase,
// the dispatch contracts it references, and a sequential RUNBOOK fallback.
// These emit the fan-out patterns of references/orchestration.md (Pattern 1
// research, Pattern 3 judge panel, Pattern 4 claim-support, Pattern 5 build);
// Pattern 2 (adversarial review) is deliberately NOT emitted — it is ONE
// fresh-eyes reviewer by design, never a fan-out.
// Everything here is emitted by string concatenation with the run's constants
// injected as JSON literals, so the workflow runs as-is under the Workflow
// tool: `export const meta` stays a pure literal, and no emitted line ever
// calls Date.now()/Math.random()/new Date() (they throw in that harness).
// ---------------------------------------------------------------------------

export const ADR_LENSES = ["feasibility", "operations-cost", "user-value"] as const;

// The one-writer rule is the engine's as of webindex v1.15.0 — it was the same
// paragraph in eight skills, differing only in whether a role gets a sanctioned
// write of its own and which commands it must not run. Both are parameters now.
//
// The engine-emitted commands are construct's own writers; the drill commands
// (`web|oss|tech|so`) print evidence to stdout and are deliberately absent from
// the list, because forbidding them would forbid the research itself.
function constructFooter(runAbs: string, sanctionedWrite?: string): string {
  // The drill commands are NOT in the forbidden list above, and saying so
  // explicitly matters: a researcher told "do not run any engine command that
  // writes" will otherwise avoid the very commands it was dispatched to run.
  const drillNote = "\nDrill commands never write the dossier — `web|oss|tech|so` print evidence to stdout and are safe.\n";
  return (
    oneWriterFooter(runAbs, {
      ...(sanctionedWrite ? { sanctioned: sanctionedWrite } : {}),
      writingCommands: ["research", "review", "review --apply", "render", "init", "brainstorm --merge"],
    }) + drillNote
  );
}

// Structured-output schemas the emitted workflows pass to agent(..., { schema }).
// The claim-review one mirrors what `review --apply` accepts ({ pairs: [...] }),
// so a fragment that validates here still gets re-checked (worklist
// cross-reference, invalid-token = unadjudicated) at fold time.
export const RESEARCH_SCHEMA = {
  type: "object",
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["gap", "summary", "urls"],
        properties: {
          gap: { type: "string", description: "the gap label, verbatim from your prompt" },
          summary: { type: "string", description: "<=5 lines: what was found and why it matters to this product" },
          urls: { type: "array", items: { type: "string" }, description: "URLs worth grounding, best first" },
        },
      },
    },
  },
};

export const CLAIM_REVIEW_SCHEMA = {
  type: "object",
  required: ["pairs"],
  properties: {
    pairs: {
      type: "array",
      items: {
        type: "object",
        required: ["claimId", "evidenceId", "verdict", "note"],
        properties: {
          claimId: { type: "string", description: "verbatim from the worklist" },
          evidenceId: { type: "string", description: "verbatim from the worklist" },
          verdict: { enum: ["supported", "partial", "refuted", "unsupported"] },
          note: { type: "string", description: "<=200 chars, grounded in the digest/source you read" },
        },
      },
    },
  },
};

export const ADR_JUDGE_SCHEMA = {
  type: "object",
  required: ["lens", "score", "rationale"],
  properties: {
    lens: { enum: [...ADR_LENSES] },
    score: { type: "integer", minimum: 1, maximum: 5 },
    rationale: { type: "string", description: "one paragraph, nothing else" },
  },
};

export const BUILDER_SCHEMA = {
  type: "object",
  required: ["taskId", "status", "summary", "artifacts", "tests"],
  properties: {
    taskId: { type: "string" },
    status: { enum: ["done", "blocked"] },
    summary: { type: "string", description: "what was built, TDD evidence (RED then GREEN)" },
    worktree: { type: "string", description: "absolute path of your git worktree holding the committed work" },
    artifacts: { type: "array", items: { type: "string" }, description: "app-relative paths implementing the task" },
    tests: { type: "array", items: { type: "string" }, description: "app-relative test files (each names its FR id)" },
    blockers: { type: "array", items: { type: "string" } },
  },
};

export function agentContracts(runAbs: string, engineAbs: string, idea: string): Record<string, string> {
  const footer = constructFooter(runAbs);
  const builderFooter = constructFooter(
    runAbs,
    "Your ONE sanctioned write surface is your own isolated git worktree — app code and app tests only. The run folder (BUILD-PLAN.json, SRD.json, evidence/) stays the orchestrator's.",
  );
  // The idea is interpolated into a Markdown inline-code span: an interior
  // backtick would close the span early (and read as executable in copy-paste
  // contexts) — strip backticks to apostrophes and flatten newlines.
  const inlineIdea = idea
    .replace(/`/g, "'")
    .replace(/\s*(?:\r\n|[\r\n])\s*/g, " ")
    .trim();
  const product = inlineIdea ? `\`${inlineIdea}\`` : "(no brief.json yet — the orchestrator will restate the one-liner in your prompt)";
  return {
    researcher: `# Contract: researcher

You research evidence gaps of a construct run — the features, competitors, candidate tech and OSS seeds that \`analyze\` proved will render UNGROUNDED as-is (references/orchestration.md Pattern 1).

Product one-liner: ${product}

Your prompt lists your gaps (\`GAPS\`), each with its matching drill command. For EACH of your gaps:

1. Run the drill (\`node ${engineAbs} web|oss|tech|so ... [--json]\`) and read the items. Drills print evidence to stdout and never write the dossier — they are safe to run in parallel.
2. Use your own WebSearch for what the drill misses (competitor pages, docs, issue threads, comparisons).
3. Judge relevance against the product one-liner and the gap — keep only what would actually ground this claim.

Return (structured output): \`{ "findings": [{ "gap", "summary", "urls" }] }\` — your GAPS only. Per gap: a ≤5-line summary of what was found and why it matters to this product, and the URLs worth grounding, best first. The orchestrator folds ALL returned URLs into ONE pinned \`research\` re-run (a research run rebuilds the dossier from exactly the angles/URLs it is given), then re-runs \`analyze\`.
${footer}`,
    "claim-reviewer": `# Contract: claim-reviewer

You are an adversarial skeptic verifying that each SRD claim is actually SUPPORTED by the evidence it cites (references/orchestration.md Pattern 4). Assume the citation is decorative until the evidence proves otherwise.

Worklist: \`${join(runAbs, "VERIFY.todo.json")}\` (\`{ pairs: [...] }\`; each pair has \`claimId\`, \`kind\`, \`claim\`, \`evidenceId\`, \`source\`, \`digest\`). Handle ONLY the pairs whose \`claimId::evidenceId\` key is named in your prompt (\`PAIRS=<key,…>\`). If a PAIRS key is no longer in the worklist, skip it and say so in your note.

For EACH of your pairs:

1. Read the pair's \`claim\` and its \`digest\` (the cited item's snippet). You may open the evidence source URL (see \`${join(runAbs, "evidence", "EVIDENCE.md")}\`) for more context. A digest flagged \`[low-signal snippet …]\` must be adjudicated skeptically — never grant \`supported\` on the URL alone.
2. Judge the claim↔evidence link:
   - \`supported\` — the cited evidence directly backs the claim.
   - \`partial\` — it backs a weaker version of the claim.
   - \`unsupported\` — it is irrelevant / does not bear on the claim.
   - \`refuted\` — it contradicts the claim.
   When unsure, choose the HARSHER verdict — a false pass is worse than a false fail.
3. \`note\` is REQUIRED — ≤200 chars grounded in what you actually read (quote or paraphrase the decisive text).

Return (structured output): \`{ "pairs": [{ "claimId", "evidenceId", "verdict", "note" }] }\` — ids VERBATIM, your PAIRS only. The fold cross-checks the worklist: an invalid verdict token reads as unadjudicated (not as a failure) and an omitted pair is reported unadjudicated — never silently passed.
${footer}`,
    "adr-judge": `# Contract: adr-judge

You are ONE lens of a 3-judge panel over ONE contested ADR (references/orchestration.md Pattern 3). Your prompt carries your \`LENS\`, the \`ADR\` (title, context, decision, consequences, alternatives) and the \`CITED EVIDENCE\` snippets — pasted in; you do not need the run folder.

The lenses:

- \`feasibility\` — can this team build it in this timeline on this stack?
- \`operations-cost\` — what does it cost to run, observe, upgrade, exit?
- \`user-value\` — does this decision serve the stated users and value prop?

Judge ONLY through your lens; the other two are someone else's job. If the ADR cites no evidence, judge from its text alone and say so in the rationale — that grounding gap is itself signal.

Return (structured output): \`{ "lens", "score", "rationale" }\` — a 1–5 integer score and a one-paragraph rationale, nothing else. The orchestrator decides by majority (≥2 judges scoring ≥3), records one line per lens in the ADR's *Alternatives considered*, and flips \`status: proposed → accepted\` only on a pass.
${footer}`,
    builder: `# Contract: builder

You build ONE task of \`${join(runAbs, "BUILD-PLAN.json")}\`, test-first, in your OWN isolated git worktree (references/orchestration.md Pattern 5 + references/build-playbook.md). Your prompt names your task (\`TASK=<id>\`). If your TASK id is no longer in the worklist, skip it and say so in your summary.

1. Read your task in the plan. Its \`acceptance\` entries POINT into \`${join(runAbs, "SRD.json")}\` (\`functional[frId].acceptance[index]\`) — the SRD stays the single source of truth for what "done" means.
2. Work ONLY inside your own git worktree (the workflow dispatches you with \`isolation: 'worktree'\`). TDD each acceptance criterion: failing test first, then make it pass — and **every test names its FR id** (e.g. \`describe("FR-001 …")\`; that is what \`verify\` greps for).
3. Run the app's test command yourself in the worktree. Do NOT run \`verify\` or the milestone gate — the orchestrator referees after folding the whole frontier.
4. NEVER edit \`BUILD-PLAN.json\`, \`SRD.json\` or anything in the run folder, and never touch files another frontier task owns — app-shared files (routing, schema, the test harness) are serialised by the orchestrator.

Return (structured output): \`{ "taskId", "status", "summary", "worktree", "artifacts", "tests", "blockers" }\` — \`status\` is \`done\` or \`blocked\`, \`worktree\` is the absolute path holding your committed work, \`artifacts\`/\`tests\` are app-relative. The orchestrator merges your worktree, folds artifacts/tests/status into BUILD-PLAN.json itself, and runs \`node ${engineAbs} verify --out ${runAbs}\`.
${builderFooter}`,
  };
}

// construct's OWN runbook prose. Handed to the engine as the preamble; the
// engine appends its per-phase listing underneath. No H1 and no `Run:` line —
// the engine emits both above this.
export function runbookPreamble(phases: PhaseInfo[], runAbs: string, engineAbs: string): string[] {
  const status = phases
    .map((p) => `| ${p.name} | \`${p.worklist}\` | ${p.ready ? `ready (${p.items} unit(s))` : "not ready"} | \`${p.prerequisite}\` |`)
    .join("\n");
  const engine = `node ${engineAbs}`;
  const agents = join(runAbs, "orchestration", "agents");
  return [
    `Generated by \`construct orchestrate\` from the CURRENT run state. This sequential path is
correctness-identical to the multi-agent workflows — same worklists, same contracts, same
gates; only wall-clock differs. Fan-out is an optimization, not a requirement (the
three-tier model of references/orchestration.md).

## Phase status

| Phase | Worklist | Status | Produce it with |
|---|---|---|---|
${status}

## The loop (play every role yourself, one unit at a time)

1. **Interview → brief** (if not done): \`${engine} init --idea "<one-liner>" --out ${runAbs}\`, then fill \`${join(runAbs, "brief.json")}\` one question at a time (references/interview-playbook.md).
2. **Research, then dig every gap** — \`${engine} research --out ${runAbs}\` builds the dossier; \`${engine} analyze --out ${runAbs}\` names each gap + its drill command. For EVERY gap, apply \`${join(agents, "researcher.md")}\` yourself (run the drill, WebSearch what it misses, keep the URLs worth grounding). Fold in serially with ONE pinned re-run: \`${engine} research --out ${runAbs} --angles market,oss,tech --url <u,...>\` → re-run \`analyze\`. Loop until clean or the user stops you.
3. **Render**: \`${engine} render --out ${runAbs} --level complex\`, then enrich the SRD (SKILL.md step 4).
4. **Claim-support review** — \`${engine} review --out ${runAbs}\` writes \`${join(runAbs, "VERIFY.todo.json")}\`. For EVERY pair, apply \`${join(agents, "claim-reviewer.md")}\` yourself (verdict + note into a \`verdicts.json\`). Then fold: \`${engine} review --apply verdicts.json --out ${runAbs}\` and gate: \`${engine} check --out ${runAbs} --semantic\` (must exit 0 before presenting).
5. **Judge panel — only for ONE genuinely contested ADR** — apply \`${join(agents, "adr-judge.md")}\` yourself three times (feasibility / operations-cost / user-value) over the pasted ADR + its cited evidence. Majority (≥2 lenses ≥3) → one line per lens under *Alternatives considered*, flip \`proposed → accepted\` in \`${join(runAbs, "SRD.json")}\`, re-emit: \`${engine} render --out ${runAbs} --from-srd\`.
6. **Build the frontier** — per ready task (\`${engine} status --out ${runAbs} --json\` → \`frontier\`), apply \`${join(agents, "builder.md")}\` yourself (sequentially you may work in the app dir directly — no worktree needed); fold artifacts/tests/status into \`${join(runAbs, "BUILD-PLAN.json")}\`, then \`${engine} verify --out ${runAbs}\`. Milestone gate once the frontier is folded: \`${engine} verify --out ${runAbs} --run-tests --strict\`.

The adversarial SRD review (Pattern 2) stays a single fresh-eyes pass by design — run it
per references/adversarial-review.md; it is deliberately not a fan-out and not emitted here.

With subagents available, prefer the emitted workflows instead: \`orchestrate --out ${runAbs} --phase <p>\` then \`Workflow({ scriptPath: "${join(runAbs, "orchestration", "<p>.workflow.mjs")}" })\` — you stay the sole writer either way.
`,
  ];
}
