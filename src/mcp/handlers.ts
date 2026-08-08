import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { analyzeRun } from "../analyze.js";
import { initBrief, loadBrief, saveBrief } from "../brief.js";
import { checkRun } from "../check.js";
import { stats as cacheStats } from "../research/cache.js";
import { assignIds } from "../research/dossier.js";
import { runAngles, runResearch } from "../research/registry.js";
import { renderFromSRD } from "../render.js";
import { runReview } from "../review.js";
import { verifyRun } from "../verify.js";
import { withRunLock } from "../run-lock.js";
import type { Angle, ResearchContext } from "../types.js";

// Where a tool name becomes work. Every handler calls the same library
// functions the CLI does — nothing here shells out to `construct`, and nothing
// here calls cli.ts, whose failure path would take the server process down with
// a process.exit on a bad argument.

export interface HandlerDefaults {
  defaultRun?: string;
  allowWrite?: boolean;
}

// Re-exported from the engine: the server distinguishes a tool failure from a
// protocol error by INSTANCE, so both halves must use the same class.
export { ToolError } from "../engine.js";
import { ToolError } from "../engine.js";

export type { ToolOutcome } from "../engine.js";
import type { ToolOutcome } from "../engine.js";

const MAX_READ_LINES = 2000;
const MAX_READ_BYTES = 8 * 1024 * 1024;

const DEFAULT_ANGLES: Angle[] = ["market", "oss", "tech"];
const ALL_ANGLES: Angle[] = ["market", "oss", "tech", "semantic"];

const WRITE_TOOL_NAMES = new Set(["construct_init"]);

// --------------------------------------------------------------------------
// Argument coercion
// --------------------------------------------------------------------------

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function bool(v: unknown): boolean {
  return v === true || v === "true";
}

function strArray(v: unknown): string[] | undefined {
  const a = Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : undefined;
  return a && a.length ? a : undefined;
}

function positive(v: unknown, key: string): number | undefined {
  const n = num(v);
  if (n === undefined) return undefined;
  if (n <= 0) throw new ToolError(`\`${key}\` must be greater than 0.`);
  return n;
}

function requiredStr(args: Record<string, unknown>, key: string, hint: string): string {
  const v = str(args[key]);
  if (!v) throw new ToolError(`\`${key}\` is required — ${hint}`);
  return v;
}

function requiredRun(args: Record<string, unknown>, defaults: HandlerDefaults): string {
  const run = str(args.run) ?? defaults.defaultRun;
  if (!run) throw new ToolError("`run` is required: the run folder holding the brief, evidence and SRD.");
  if (!isAbsolute(run)) throw new ToolError("`run` must be an absolute path.");
  const abs = resolve(run);
  if (!existsSync(join(abs, "brief.json"))) {
    throw new ToolError(`no run at ${abs} — scaffold one first with construct_init (it creates the folder and its brief).`);
  }
  return abs;
}

function anglesOf(args: Record<string, unknown>): Angle[] {
  const raw = strArray(args.angles);
  if (!raw) return DEFAULT_ANGLES;
  for (const a of raw) {
    if (!(ALL_ANGLES as string[]).includes(a)) throw new ToolError(`unknown angle "${a}" — one of: ${ALL_ANGLES.join(", ")}`);
  }
  return raw as Angle[];
}

// The MCP counterpart of cli.ts's buildResearchContext. Same shape, but it
// THROWS on a bad value where the CLI exits.
function researchContext(runDir: string, angles: Angle[], args: Record<string, unknown>, query?: string): ResearchContext {
  const brief = loadBrief(runDir);
  return {
    brief,
    runDir,
    angles,
    query: query ?? brief.idea,
    webEngine: "auto",
    semantic: angles.includes("semantic"),
    perSource: positive(args.per_source, "per_source") ?? 6,
    concurrency: 4,
    maxTech: 4,
    refresh: bool(args.refresh),
    docsUrls: strArray(args.urls),
    marketUrls: strArray(args.urls),
  };
}

// --------------------------------------------------------------------------
// Dispatch
// --------------------------------------------------------------------------

export async function callTool(name: string, args: Record<string, unknown>, defaults: HandlerDefaults = {}): Promise<ToolOutcome> {
  if (WRITE_TOOL_NAMES.has(name) && !defaults.allowWrite) {
    throw new ToolError(`${name} writes a run folder to disk and is disabled — start the server with --allow-write to enable it.`);
  }

  // These three touch no existing run.
  if (name === "construct_cache") return outcome(name, cacheStats());
  if (name === "construct_init") return outcome(name, handleInit(args));
  if (name === "construct_research_angle") return outcome(name, await handleResearchAngle(args));

  const run = requiredRun(args, defaults);
  // Serialized per run folder: research, render --merge and review --apply are
  // all read-merge-write over the same artifacts.
  return await withRunLock(run, async () => outcome(name, await dispatch(name, args, run)));
}

async function dispatch(name: string, args: Record<string, unknown>, run: string): Promise<unknown> {
  switch (name) {
    case "construct_status":
      return handleStatus(run);
    case "construct_research":
      return await handleResearch(args, run);
    case "construct_analyze":
      return handleAnalyze(run);
    case "construct_render":
      return handleRender(args, run);
    case "construct_check":
      return handleCheck(args, run);
    case "construct_review":
      return handleReview(args, run);
    case "construct_verify":
      return handleVerify(args, run);
    case "construct_read":
      return handleRead(args, run);
    default:
      // Unreachable: the server rejects an unknown tool before dispatch.
      throw new ToolError(`unknown tool: ${name}`);
  }
}

function outcome(name: string, result: unknown): ToolOutcome {
  return { text: JSON.stringify(result, null, 2) + "\n", artifact: artifactFor(name, result) };
}

// Where an oversized result already exists on disk, so an over-cap refusal can
// point at it instead of just saying no.
function artifactFor(name: string, result: unknown): string | undefined {
  if (typeof result !== "object" || result === null) return undefined;
  const r = result as Record<string, unknown>;
  if (name === "construct_research") return typeof r.evidence_md === "string" ? r.evidence_md : undefined;
  if (name === "construct_render") return typeof r.srd_md === "string" ? r.srd_md : undefined;
  return undefined;
}

// --------------------------------------------------------------------------
// Handlers
// --------------------------------------------------------------------------

function handleInit(args: Record<string, unknown>): unknown {
  const idea = requiredStr(args, "idea", "the product idea, in one line.");
  const out = requiredStr(args, "out", "an absolute path for the run folder.");
  if (!isAbsolute(out)) throw new ToolError("`out` must be an absolute path.");
  const brief = initBrief(idea, new Date().toISOString());
  const path = saveBrief(resolve(out), brief);
  return {
    run: resolve(out),
    brief: path,
    next:
      "The brief is a SCAFFOLD. Interview the user to fill it — who it is for, what it must do, what it must not do, what already exists — " +
      "before construct_research. Everything downstream is only as good as that interview; do not invent the answers.",
  };
}

function handleStatus(run: string): unknown {
  const has = (rel: string) => existsSync(join(run, rel));
  return {
    run,
    brief: has("brief.json"),
    evidence: has("evidence"),
    srd: has("SRD.json"),
    build_plan: has("BUILD-PLAN.json"),
    next: !has("evidence")
      ? "construct_research — nothing is grounded yet."
      : !has("SRD.json")
        ? "construct_render — the evidence is in, the SRD is not written."
        : "construct_check, then construct_review to adjudicate the claims the gate cannot judge.",
  };
}

async function handleResearch(args: Record<string, unknown>, run: string): Promise<unknown> {
  const angles = anglesOf(args);
  const ctx = researchContext(run, angles, args);
  const r = await runResearch(ctx, new Date().toISOString());
  return {
    run,
    evidence_md: r.paths.evidenceMd,
    angles,
    items: r.evidence.length,
    sources: r.meta.sources,
    // A degraded source is information, not a failure: it bounds what the SRD
    // may claim.
    ...(r.meta.notes.length ? { notes: r.meta.notes } : {}),
    next: "construct_analyze to see what is still thin, then construct_render.",
  };
}

async function handleResearchAngle(args: Record<string, unknown>): Promise<unknown> {
  const angle = requiredStr(args, "angle", "one of: web, oss, tech, so.");
  const query = requiredStr(args, "query", "the question or topic for this angle.");
  const mapped: Record<string, Angle> = { web: "market", oss: "oss", tech: "tech", so: "tech" };
  const resolved = mapped[angle];
  if (!resolved) throw new ToolError(`unknown angle "${angle}" — one of: web, oss, tech, so`);

  // No run folder: this probe persists nothing, so it builds a throwaway brief
  // from the query alone.
  const ctx: ResearchContext = {
    brief: initBrief(query, new Date().toISOString()),
    runDir: "",
    angles: [resolved],
    query,
    webEngine: "auto",
    semantic: false,
    perSource: positive(args.per_source, "per_source") ?? 6,
    concurrency: 4,
    maxTech: 4,
    refresh: false,
    docsUrls: strArray(args.urls),
    marketUrls: strArray(args.urls),
  };
  const { results, notes } = await runAngles(ctx);
  return {
    angle,
    query,
    ...(notes.length ? { notes } : {}),
    items: assignIds(results),
    next: "Nothing was written. Run construct_research to fold sources into a run's dossier as citable evidence.",
  };
}

function handleAnalyze(run: string): unknown {
  return { run, ...analyzeRun(run) };
}

function handleRender(args: Record<string, unknown>, run: string): unknown {
  const level = str(args.level);
  if (level !== undefined && level !== "light" && level !== "complex") {
    throw new ToolError(`\`level\` must be one of: light, complex (got "${level}")`);
  }
  const res = renderFromSRD(run, { merge: bool(args.merge), prd: bool(args.prd) });
  return { run, srd_md: join(run, "SRD.md"), ...res, next: "construct_check to gate it, then construct_review to adjudicate the claims." };
}

function handleCheck(args: Record<string, unknown>, run: string): unknown {
  const minGrounding = num(args.min_grounding);
  if (minGrounding !== undefined && (minGrounding < 0 || minGrounding > 1)) {
    throw new ToolError("`min_grounding` must be between 0 and 1.");
  }
  const res = checkRun(run, { minGrounding, semantic: bool(args.semantic), allowUnverified: bool(args.allow_unverified) });
  // ok:false is a verdict, not a failure: the tool did its job and the SRD did
  // not pass.
  return {
    run,
    ...res,
    note: "Grounding coverage is ADVISORY — this gate never fails on it. A green check means the SRD is well-FORMED, not that it is well-researched.",
  };
}

function handleReview(args: Record<string, unknown>, run: string): unknown {
  const res = runReview(run, { maxReview: positive(args.max_review, "max_review") });
  return {
    ...res,
    run,
    next: "For each pair, read the cited evidence and judge whether it carries the claim. This is where advisory grounding becomes real.",
  };
}

function handleVerify(args: Record<string, unknown>, run: string): unknown {
  const app = str(args.app);
  if (app !== undefined && !isAbsolute(app)) throw new ToolError("`app` must be an absolute path.");
  if (app && !existsSync(app)) throw new ToolError(`app not found: ${app}`);
  const res = verifyRun(run, { appDir: app, runTests: bool(args.run_tests), strict: bool(args.strict) });
  return { ...res, run };
}

function handleRead(args: Record<string, unknown>, run: string): unknown {
  const raw = requiredStr(args, "path", "a path relative to the run folder, or an absolute path inside it.");
  const target = isAbsolute(raw) ? raw : join(run, raw);

  // Containment on the REALPATH: a symlink inside the run normalises cleanly as
  // a string and only escapes once the filesystem resolves it. This server can
  // be reached over HTTP.
  let real: string;
  try {
    real = realpathSync(target);
  } catch {
    throw new ToolError(`no such file: ${raw}`);
  }
  const root = realpathSync(run);
  if (real !== root && !real.startsWith(root + sep)) {
    throw new ToolError(`path is outside the run: ${raw}. Use your own file tool for anything else.`);
  }

  const st = statSync(real);
  if (!st.isFile()) throw new ToolError(`not a file: ${raw}`);
  if (st.size > MAX_READ_BYTES) throw new ToolError(`file is too large to read (${st.size} bytes): ${raw}`);

  const lines = readFileSync(real, "utf8").split("\n");
  const total = lines.length;
  const start = Math.max(1, Math.floor(num(args.start_line) ?? 1));
  if (start > total) throw new ToolError(`start_line ${start} is past the end of the file (${total} lines).`);
  const requestedEnd = Math.floor(num(args.end_line) ?? total);
  const end = Math.min(total, Math.max(start, requestedEnd), start + MAX_READ_LINES - 1);

  return {
    path: isAbsolute(raw) ? real : raw,
    start_line: start,
    end_line: end,
    total_lines: total,
    truncated: end < Math.min(total, requestedEnd),
    content: lines.slice(start - 1, end).join("\n"),
  };
}
