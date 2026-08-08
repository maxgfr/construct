import { VERSION } from "../types.js";
import type { McpAdapter } from "../engine.js";
import { callTool } from "./handlers.js";
import { getPrompt, PROMPTS } from "./prompts.js";
import { toolsFor } from "./tools.js";

// The skill half of the MCP server.
//
// The engine owns everything protocol-shaped — version negotiation, the
// notification/request split, cancellation, schema validation, response
// capping, the JSON-RPC-error vs isError-result line, and both transports. It
// cannot know WHICH tools exist, so this file hands it the four things that are
// genuinely construct's: the version it reports, the tool declarations, the
// dispatcher, and the prompts.

/**
 * How to ask for less, per tool, when a response is withheld for size.
 *
 * The engine detects the overflow; only the skill knows which argument shrinks
 * the result. A cap that says only "too big" makes the model retry the same
 * call — one that names the narrowing argument gets a smaller second call.
 */
const CAP_ADVICE: Record<string, string> = {
  construct_research: "narrow `angles`, or lower `per_source`",
  construct_research_angle: "lower `per_source`, or pass fewer `urls`",
  construct_render: 'render at `level: "light"`, or read the SRD file at the returned path',
  construct_review: "lower `max_review`",
  construct_check: "the SRD is very large; read the report file instead of inlining it",
  construct_read: "pass `start_line`/`end_line` to read a window instead of the whole file",
};

export interface AdapterOptions {
  defaultRun?: string;
  allowWrite?: boolean;
}

export function constructAdapter(opts: AdapterOptions = {}): McpAdapter {
  return {
    version: VERSION,
    listTools: (protocol) => toolsFor(protocol, opts),
    callTool: (name, args) => callTool(name, args, opts),
    capAdvice: CAP_ADVICE,
    prompts: PROMPTS,
    getPrompt,
  };
}
