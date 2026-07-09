import { join } from "node:path";
import type { AdrPanelPayload, PhaseInfo } from "./orchestrate.js";

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

// Family-standard footer, reusing the one-writer rule of
// references/orchestration.md ("The serialization rule"): subagents return
// text; the orchestrator alone writes the run folder, serially.
function oneWriterFooter(runAbs: string, sanctionedWrite?: string): string {
  return `
## Return, don't write (the one-writer rule)

Return ONLY the structured output specified above. Subagents NEVER write into the run folder: do not write, edit, or delete any file there, and do not run any engine command that writes it (\`research\`, \`review\`, \`review --apply\`, \`render\`, \`init\`, \`brainstorm --merge\`). Drill commands never write the dossier — \`web|oss|tech|so\` print evidence to stdout and are safe. The orchestrator is the sole writer: it folds your returned fragments in serially and runs the gates itself. One writer, many readers — no races, no clobbered evidence.${sanctionedWrite ? `\n\n${sanctionedWrite}` : ""}

Exception for oversized prose: if a justification is too large to return, write ONLY to \`${join(runAbs, "orchestration", "out")}/<role>-<batch>.md\` (a file namespaced to you alone) and return its path.
`;
}

// Structured-output schemas the emitted workflows pass to agent(..., { schema }).
// The claim-review one mirrors what `review --apply` accepts ({ pairs: [...] }),
// so a fragment that validates here still gets re-checked (worklist
// cross-reference, invalid-token = unadjudicated) at fold time.
const RESEARCH_SCHEMA = {
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

const CLAIM_REVIEW_SCHEMA = {
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

const ADR_JUDGE_SCHEMA = {
  type: "object",
  required: ["lens", "score", "rationale"],
  properties: {
    lens: { enum: [...ADR_LENSES] },
    score: { type: "integer", minimum: 1, maximum: 5 },
    rationale: { type: "string", description: "one paragraph, nothing else" },
  },
};

const BUILDER_SCHEMA = {
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

interface PhaseSpec {
  role: string;
  title: string;
  schema: unknown;
  /** One subagent per batch of at most this many units (1 = one agent per unit). */
  batchSize: number;
  description: (n: number) => string;
  /** The JS expression (workflow-side) building the per-batch prompt extra. */
  extraExpr: string;
  /** Extra agent() options, e.g. the builder's sanctioned worktree isolation. */
  agentOpts?: string;
  /** The orchestrator's fold step, shown as a tail comment + in the runbook. */
  applyHint: (engineAbs: string, runAbs: string) => string[];
}

const PHASE_SPECS: Record<string, PhaseSpec> = {
  research: {
    role: "researcher",
    title: "Research fan-out",
    schema: RESEARCH_SCHEMA,
    batchSize: 8,
    description: (n) => `Research the ${n} evidence gap(s) construct analyze found (fan-out; the orchestrator folds URLs into ONE pinned research re-run)`,
    extraExpr: "'GAPS (yours only, each with its drill command):\\n- ' + batch.join('\\n- ')",
    applyHint: (engine, run) => [
      `node ${engine} research --out ${run} --angles market,oss,tech --url <u1,u2,...> [--docs-url <d,...>]`,
      `node ${engine} analyze --out ${run}`,
    ],
  },
  "claim-review": {
    role: "claim-reviewer",
    title: "Claim review",
    schema: CLAIM_REVIEW_SCHEMA,
    batchSize: 8,
    description: (n) =>
      `Adversarially verify the ${n} claim↔evidence pair(s) of a construct SRD (skeptic fan-out; the orchestrator folds the verdicts and gates)`,
    extraExpr: "'PAIRS=' + batch.join(',')",
    applyHint: (engine, run) => [`node ${engine} review --apply verdicts.json --out ${run}`, `node ${engine} check --out ${run} --semantic`],
  },
  "adr-judges": {
    role: "adr-judge",
    title: "Judge panel",
    schema: ADR_JUDGE_SCHEMA,
    batchSize: 1,
    description: () => "Judge ONE contested ADR through the 3-lens panel (feasibility / operations & cost / user value); majority reduce",
    extraExpr: "'LENS=' + batch[0] + '\\nADR = ' + JSON.stringify(ADR) + '\\nCITED EVIDENCE = ' + JSON.stringify(EVIDENCE)",
    applyHint: (engine, run) => [`node ${engine} render --out ${run} --from-srd`],
  },
  build: {
    role: "builder",
    title: "Build frontier",
    schema: BUILDER_SCHEMA,
    batchSize: 1,
    description: (n) => `Build the ${n} ready BUILD-PLAN task(s) of this milestone frontier — one TDD builder per task, each in its own git worktree`,
    extraExpr: "'TASK=' + batch.join(',')",
    agentOpts: ", isolation: 'worktree'",
    applyHint: (engine, run) => [`node ${engine} verify --out ${run}`],
  },
};

export function phaseSpec(name: string): PhaseSpec {
  const spec = PHASE_SPECS[name];
  if (!spec) throw new Error(`no phase spec for "${name}"`);
  return spec;
}

/** Chunk worklist units into batches, one subagent per batch (order-preserving, deterministic). */
export function toBatches(ids: string[], batchSize: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += batchSize) out.push(ids.slice(i, i + batchSize));
  return out;
}

const FOLD_PREAMBLE: Record<string, string[]> = {
  research: [
    "// One-writer rule: this workflow only COLLECTS research fragments (summaries + URLs).",
    "// The main agent folds them in serially with ONE pinned research re-run — a research run",
    "// REBUILDS the dossier from exactly the angles/URLs it is given, so pass every angle —",
    "// then re-measures the gaps:",
  ],
  "claim-review": [
    "// One-writer rule: this workflow only COLLECTS verdict fragments. The main agent merges",
    "// them into ONE verdicts.json (order-independent, keyed claimId::evidenceId — an omitted",
    "// pair is reported unadjudicated, never silently passed), then folds and gates:",
  ],
  "adr-judges": [
    "// One-writer rule: this workflow only COLLECTS the 3 lens verdicts. The main agent",
    "// majority-reduces them (pass = >=2 lenses scoring >=3): record one line per lens in the",
    "// ADR's *Alternatives considered*, flip status proposed -> accepted in SRD.json only on a",
    "// pass (on a fail, take the strongest rationale back to the user), then re-emit the tree:",
  ],
  build: [
    "// One-writer rule: builders write code ONLY in their own git worktrees. The main agent",
    "// merges each worktree (serialising tasks that touch app-shared files — routing, schema,",
    "// the test harness), folds artifacts/tests/status into BUILD-PLAN.json itself, then referees:",
  ],
};

export function phaseWorkflowScript(ph: PhaseInfo, runAbs: string, engineAbs: string, units: string[], adr?: AdrPanelPayload): string {
  const spec = phaseSpec(ph.name);
  const scriptPath = join(runAbs, "orchestration", `${ph.name}.workflow.mjs`);
  const meta = { name: `construct-${ph.name}`, description: spec.description(units.length), phases: [{ title: spec.title }] };
  const adrConsts = adr ? [`const ADR = ${JSON.stringify(adr.adr)}`, `const EVIDENCE = ${JSON.stringify(adr.evidence)}`] : [];
  const tail = FOLD_PREAMBLE[ph.name] ?? [];
  return [
    `export const meta = ${JSON.stringify(meta)}`,
    ``,
    `// NOT a plain Node script: launch via the Workflow tool — Workflow({ scriptPath: ${JSON.stringify(scriptPath)} }).`,
    `// Emitted by \`construct orchestrate\` from the CURRENT run state. The run is the source`,
    `// of truth: if its worklist changes, re-run \`orchestrate --phase ${ph.name}\` before launching.`,
    ``,
    `// Constants for THIS run (injected at emit time; no Date.now/Math.random in this harness).`,
    `const RUN = ${JSON.stringify(runAbs)}`,
    `const ENGINE = ${JSON.stringify(engineAbs)}`,
    `const WORKLIST = ${JSON.stringify(ph.worklist)}`,
    `const AGENTS = RUN + '/orchestration/agents'`,
    `const BATCHES = ${JSON.stringify(toBatches(units, spec.batchSize))}`,
    ...adrConsts,
    `const SCHEMA = ${JSON.stringify(spec.schema)}`,
    ``,
    `function contract(name, extra) {`,
    `  return 'Read and follow the dispatch contract at ' + AGENTS + '/' + name + '.md VERBATIM.\\n'`,
    `    + 'Constants: RUN=' + RUN + '  ENGINE=' + ENGINE + '  WORKLIST=' + WORKLIST + '.\\n'`,
    `    + 'Invoke the engine only by its ABSOLUTE path: node ' + ENGINE + ' <cmd> — stdout drills and read-only commands only.'`,
    `    + (extra ? '\\n' + extra : '')`,
    `}`,
    ``,
    `log('construct ${ph.name}: ' + ${JSON.stringify(String(units.length))} + ' unit(s) across ' + BATCHES.length + ' agent(s)')`,
    ``,
    `phase(${JSON.stringify(spec.title)})`,
    `const results = await pipeline(BATCHES, (batch, _item, i) =>`,
    `  agent(contract('${spec.role}', ${spec.extraExpr}), { label: '${ph.name}:' + (i + 1), phase: ${JSON.stringify(spec.title)}, agentType: 'general-purpose', schema: SCHEMA${spec.agentOpts ?? ""} }))`,
    ``,
    ...tail,
    ...spec.applyHint(engineAbs, runAbs).map((c) => `//   ${c}`),
    `return { phase: ${JSON.stringify(ph.name)}, worklist: WORKLIST, results: results.filter(Boolean) }`,
    ``,
  ].join("\n");
}

export function agentContracts(runAbs: string, engineAbs: string, idea: string): Record<string, string> {
  const footer = oneWriterFooter(runAbs);
  const builderFooter = oneWriterFooter(
    runAbs,
    "Your ONE sanctioned write surface is your own isolated git worktree — app code and app tests only. The run folder (BUILD-PLAN.json, SRD.json, evidence/) stays the orchestrator's.",
  );
  const product = idea ? `\`${idea}\`` : "(no brief.json yet — the orchestrator will restate the one-liner in your prompt)";
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

Worklist: \`${join(runAbs, "VERIFY.todo.json")}\` (\`{ pairs: [...] }\`; each pair has \`claimId\`, \`kind\`, \`claim\`, \`evidenceId\`, \`source\`, \`digest\`). Handle ONLY the pairs whose \`claimId::evidenceId\` key is named in your prompt (\`PAIRS=<key,…>\`).

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

You build ONE task of \`${join(runAbs, "BUILD-PLAN.json")}\`, test-first, in your OWN isolated git worktree (references/orchestration.md Pattern 5 + references/build-playbook.md). Your prompt names your task (\`TASK=<id>\`).

1. Read your task in the plan. Its \`acceptance\` entries POINT into \`${join(runAbs, "SRD.json")}\` (\`functional[frId].acceptance[index]\`) — the SRD stays the single source of truth for what "done" means.
2. Work ONLY inside your own git worktree (the workflow dispatches you with \`isolation: 'worktree'\`). TDD each acceptance criterion: failing test first, then make it pass — and **every test names its FR id** (e.g. \`describe("FR-001 …")\`; that is what \`verify\` greps for).
3. Run the app's test command yourself in the worktree. Do NOT run \`verify\` or the milestone gate — the orchestrator referees after folding the whole frontier.
4. NEVER edit \`BUILD-PLAN.json\`, \`SRD.json\` or anything in the run folder, and never touch files another frontier task owns — app-shared files (routing, schema, the test harness) are serialised by the orchestrator.

Return (structured output): \`{ "taskId", "status", "summary", "worktree", "artifacts", "tests", "blockers" }\` — \`status\` is \`done\` or \`blocked\`, \`worktree\` is the absolute path holding your committed work, \`artifacts\`/\`tests\` are app-relative. The orchestrator merges your worktree, folds artifacts/tests/status into BUILD-PLAN.json itself, and runs \`node ${engineAbs} verify --out ${runAbs}\`.
${builderFooter}`,
  };
}

export function runbookMd(phases: PhaseInfo[], runAbs: string, engineAbs: string): string {
  const status = phases
    .map((p) => `| ${p.name} | \`${p.worklist}\` | ${p.ready ? `ready (${p.items} unit(s))` : "not ready"} | \`${p.prerequisite}\` |`)
    .join("\n");
  const engine = `node ${engineAbs}`;
  const agents = join(runAbs, "orchestration", "agents");
  return `# construct — sequential RUNBOOK (eco / no-subagent fallback)

Run: \`${runAbs}\` · Engine: \`${engine}\`

Generated by \`construct orchestrate\` from the CURRENT run state. This sequential path is
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
`;
}
