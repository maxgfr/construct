import { ANNOTATIONS_SINCE, RICH_TOOLS_SINCE, type JsonSchema, type JsonSchemaProp, type ProtocolVersion } from "../engine.js";

// What the server advertises. Pure data — nothing here imports the research
// pipeline, so the declarations can be asserted in a test without reaching the
// network. handlers.ts is where these names become work.

export type { ToolDecl } from "../engine.js";
import type { ToolDecl } from "../engine.js";

const runProp: JsonSchemaProp = { type: "string", description: "The run folder — the durable artifact holding the brief, evidence and SRD." };

// The line the whole skill turns on. `check` gates STRUCTURE hard; grounding
// coverage is advisory and never fails the run. A model that does not know
// that reads a green check as "this SRD is well-researched", which it is not.
const RIGOR_NOTE =
  "Grounding is ADVISORY here: construct_check fails on structure, never on how well-researched a decision is. The rigor is yours — an SRD can pass every gate and still rest on nothing.";

export const TOOLS: ToolDecl[] = [
  {
    name: "construct_status",
    title: "What exists, and the next command",
    description:
      "Read the run's state: which artifacts exist, what is still missing, and the exact next step. Start here on any run you did not just create — it is " +
      "the cheapest way to find out where a half-finished SRD stopped.",
    inputSchema: { type: "object", properties: { run: runProp }, required: ["run"] },
  },
  {
    name: "construct_research",
    title: "Ground the brief in real sources",
    description:
      "SLOW and network-bound: fan out across the research angles — market and competitors, comparable open-source projects and their real issues, " +
      "candidate-tech docs and StackOverflow pitfalls — and write an evidence dossier into the run. This is the ONLY command that grounds anything. " +
      "Expect minutes on a first run; re-runs are nearly free thanks to the page cache.",
    inputSchema: {
      type: "object",
      properties: {
        run: runProp,
        angles: {
          type: "array",
          items: { type: "string" },
          enum: ["market", "oss", "tech", "semantic"],
          description: "Which angles to research. Default: market, oss and tech.",
        },
        per_source: { type: "number", description: "Max evidence items kept per source." },
        refresh: { type: "boolean", description: "Bypass the page cache and refetch." },
        offline: { type: "boolean", description: "Use only what is already cached; make no network calls." },
      },
      required: ["run"],
    },
  },
  {
    name: "construct_research_angle",
    title: "Probe one research angle, write nothing",
    description:
      "Run ONE angle — web, oss, tech or so (StackOverflow) — and print what it finds without persisting it. Use it to sanity-check an angle before " +
      "committing to a full construct_research, or to answer a single question that does not belong in the dossier.",
    inputSchema: {
      type: "object",
      properties: {
        angle: { type: "string", enum: ["web", "oss", "tech", "so"], description: "Which angle to run." },
        query: { type: "string", description: "The question or topic for this angle." },
        urls: { type: "array", items: { type: "string" }, description: "Specific URLs to ground against instead of searching." },
        per_source: { type: "number", description: "Max items kept." },
      },
      required: ["angle", "query"],
    },
  },
  {
    name: "construct_analyze",
    title: "Find what the SRD is thin on",
    description:
      "Report where the run is under-grounded or incomplete, and the exact command that fills each gap. Run it between research and render — it is what " +
      "turns 'the SRD looks done' into a list of decisions still resting on nothing.",
    inputSchema: { type: "object", properties: { run: runProp }, required: ["run"] },
  },
  {
    name: "construct_render",
    title: "Render the SRD suite",
    description:
      "Write the SRD tree from the brief and the evidence: vision, scope, functional requirements with Given/When/Then acceptance criteria, NFRs, data " +
      "model, interfaces, ADRs, build plan and traceability. `merge: true` preserves the prose you enriched; without it, generated sections are rebuilt.",
    inputSchema: {
      type: "object",
      properties: {
        run: runProp,
        level: { type: "string", enum: ["light", "complex"], description: "How much structure to emit. Default: complex." },
        merge: { type: "boolean", description: "Preserve enriched prose instead of overwriting it." },
        prd: { type: "boolean", description: "Also emit one PRD per functional requirement." },
      },
      required: ["run"],
    },
  },
  {
    name: "construct_check",
    title: "The structural gate",
    description:
      "Validate the SRD: required sections present, requirements well-formed, acceptance criteria testable, traceability intact. Exits non-zero on a " +
      "structural failure. A result with ok:false is a real verdict, not a tool failure. " +
      RIGOR_NOTE,
    inputSchema: {
      type: "object",
      properties: {
        run: runProp,
        min_grounding: { type: "number", description: "Report grounding coverage below this share, 0..1. Advisory — it never fails the run." },
        semantic: { type: "boolean", description: "Also fold in the recorded review verdicts." },
        allow_unverified: { type: "boolean", description: "With semantic, warn instead of failing when no verdicts exist yet." },
      },
      required: ["run"],
    },
  },
  {
    name: "construct_review",
    title: "Build a claim-evidence worklist",
    description:
      "Emit a claim-by-evidence worklist from the SRD, for you to adjudicate each pair. This is the pass that turns advisory grounding into something real: " +
      "the gate cannot tell you a requirement rests on a source that does not support it, and this can.",
    inputSchema: {
      type: "object",
      properties: { run: runProp, max_review: { type: "number", description: "Cap on the number of claim/evidence pairs emitted." } },
      required: ["run"],
    },
  },
  {
    name: "construct_verify",
    title: "Referee a build against its SRD",
    description:
      "Compare a built application against the SRD and the build plan: which requirements are implemented, which are missing, which drifted. Use it to " +
      "close the loop after building from the spec — not to check the spec itself, which is construct_check's job.",
    inputSchema: {
      type: "object",
      properties: {
        run: runProp,
        app: { type: "string", description: "Absolute path to the built application to referee." },
        run_tests: { type: "boolean", description: "Also run the app's test suite as evidence." },
        strict: { type: "boolean", description: "Fail on any unimplemented requirement." },
      },
      required: ["run"],
    },
  },
  {
    name: "construct_cache",
    title: "Inspect the page cache",
    description:
      "Report what research has cached on disk: how many pages, how much space, and how many entries are still fresh. Read-only. A warm cache is why " +
      "re-running construct_research after filling a gap is nearly free.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "construct_read",
    title: "Read a file from the run",
    description:
      "Read a file, or a line range of one, from the run folder — the brief, an evidence item, a rendered SRD section, a worklist. Reads are confined to " +
      "the run; anything else is your own file tool's job.",
    inputSchema: {
      type: "object",
      properties: {
        run: runProp,
        path: { type: "string", description: "Path relative to the run folder, or an absolute path inside it." },
        start_line: { type: "number", description: "First line to return, 1-based (default 1)." },
        end_line: { type: "number", description: "Last line to return, inclusive (default: end of file, capped)." },
      },
      required: ["run", "path"],
    },
    outputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        start_line: { type: "number" },
        end_line: { type: "number" },
        total_lines: { type: "number" },
        truncated: { type: "boolean" },
        content: { type: "string" },
      },
      required: ["path", "start_line", "end_line", "total_lines", "truncated", "content"],
    },
  },
];

// Registered only when the server is started with --allow-write. `init`
// scaffolds a run folder wherever the caller points it.
export const WRITE_TOOLS: ToolDecl[] = [
  {
    name: "construct_init",
    title: "Scaffold a run folder",
    description:
      "WRITES TO DISK: create the run folder and its brief from a one-line idea. The brief is a SCAFFOLD — you fill it by interviewing the user, and " +
      "everything downstream is only as good as that interview. Do not invent the answers.",
    inputSchema: {
      type: "object",
      properties: {
        idea: { type: "string", description: "The product idea, in one line." },
        out: { type: "string", description: "Absolute path for the run folder." },
      },
      required: ["idea", "out"],
    },
  },
];

// Behavioural hints clients use to decide what needs a confirmation prompt.
//
// The read-only line is drawn at the USER'S environment. `research`, `render`,
// `review` and `verify` all write into a run folder the caller named — they are
// writes, but they never touch anything outside it.
export const TOOL_META: Record<string, { write?: boolean; destructive?: boolean; idempotent?: boolean; openWorld?: boolean }> = {
  construct_status: { openWorld: false },
  construct_research: { write: true, destructive: false, idempotent: false, openWorld: true },
  construct_research_angle: { openWorld: true },
  construct_analyze: { openWorld: false },
  construct_render: { write: true, destructive: false, idempotent: true, openWorld: false },
  construct_check: { openWorld: false },
  construct_review: { write: true, destructive: false, idempotent: true, openWorld: false },
  construct_verify: { write: true, destructive: false, idempotent: true, openWorld: false },
  construct_cache: { openWorld: false },
  construct_read: { openWorld: false },
  construct_init: { write: true, destructive: false, idempotent: true, openWorld: false },
};

export function annotationsFor(name: string): Record<string, boolean> | undefined {
  const meta = TOOL_META[name];
  if (!meta) return undefined;
  return {
    readOnlyHint: !meta.write,
    ...(meta.write ? { destructiveHint: meta.destructive === true, idempotentHint: meta.idempotent === true } : {}),
    openWorldHint: meta.openWorld === true,
  };
}

export interface ToolsForOptions {
  defaultRun?: string;
  allowWrite?: boolean;
}

// The tool list as one client should see it: gated on what the server was
// started with, and on how new the negotiated protocol is.
export function toolsFor(protocolVersion: ProtocolVersion, opts: ToolsForOptions = {}): ToolDecl[] {
  const base = opts.allowWrite ? [...TOOLS, ...WRITE_TOOLS] : TOOLS;
  const withAnnotations = protocolVersion >= ANNOTATIONS_SINCE;
  const withRich = protocolVersion >= RICH_TOOLS_SINCE;

  return base.map((t) => {
    const decl: ToolDecl = {
      name: t.name,
      description: t.description,
      inputSchema: applyDefaultRun(t.inputSchema, opts.defaultRun),
    };
    if (withRich && t.title) decl.title = t.title;
    if (withRich && t.outputSchema) decl.outputSchema = t.outputSchema;
    if (withAnnotations) {
      const a = annotationsFor(t.name);
      if (a) decl.annotations = a;
    }
    return decl;
  });
}

// With a server-level default run, `run` stops being required and its
// description names the default — so a client working one SRD can call every
// tool with no run argument at all.
function applyDefaultRun(schema: JsonSchema, defaultRun?: string): JsonSchema {
  const existing = schema.properties.run;
  if (!defaultRun || !existing) return schema;
  return {
    type: "object",
    properties: {
      ...schema.properties,
      run: { ...existing, description: `${existing.description} Optional — defaults to ${defaultRun}.` },
    },
    required: schema.required.filter((r) => r !== "run"),
  };
}
