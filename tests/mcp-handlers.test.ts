import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type JsonRpcMessage } from "../src/mcp/server.js";
import { callTool, ToolError } from "../src/mcp/handlers.js";

// The handlers driven through the JSON-RPC core, in-process, against a real run
// folder. Nothing here reaches the network: `research` is the only tool that
// would, and it is not exercised.

let RUN: string;
const temps: string[] = [];

beforeAll(async () => {
  const base = mkdtempSync(join(tmpdir(), "con-mcp-"));
  temps.push(base);
  RUN = join(base, "run");
  // Going through callTool proves the allowWrite gate lets a write tool through.
  await callTool("construct_init", { idea: "a CLI that renames photos by EXIF date", out: RUN }, { allowWrite: true });
}, 120_000);

afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

const server = createServer();

async function rpc(msg: Omit<JsonRpcMessage, "jsonrpc">): Promise<JsonRpcMessage | undefined> {
  let out: JsonRpcMessage | undefined;
  await server.handle({ jsonrpc: "2.0", ...msg }, (m) => {
    out = m;
  });
  return out;
}

async function call(name: string, args: Record<string, unknown>): Promise<JsonRpcMessage> {
  return (await rpc({ id: 1, method: "tools/call", params: { name, arguments: args } }))!;
}

async function ok(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await call(name, args);
  const result = res.result as { content: { text: string }[]; isError?: boolean } | undefined;
  expect(res.error, `unexpected JSON-RPC error: ${JSON.stringify(res.error)}`).toBeUndefined();
  expect(result?.isError, `unexpected isError: ${result?.content?.[0]?.text}`).toBeFalsy();
  return JSON.parse(result!.content[0]!.text);
}

async function errorText(name: string, args: Record<string, unknown>): Promise<string> {
  const res = await call(name, args);
  const result = res.result as { content: { text: string }[]; isError?: boolean } | undefined;
  expect(result?.isError, "expected an isError tool result").toBe(true);
  return result!.content[0]!.text;
}

describe("lifecycle methods", () => {
  it("negotiates a protocol version and advertises all three primitives", async () => {
    const res = await rpc({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
    const r = res!.result as { serverInfo: { name: string }; capabilities: unknown };
    expect(r.serverInfo.name).toBe("construct");
    expect(r.capabilities).toEqual({
      tools: { listChanged: false },
      resources: { subscribe: false, listChanged: false },
      prompts: { listChanged: false },
    });
  });

  it("rejects an unknown method, an unknown tool and bad arguments as protocol errors", async () => {
    expect((await rpc({ id: 1, method: "resources/subscribe" }))!.error).toMatchObject({ code: -32601 });
    expect((await call("construct_nope", {})).error).toMatchObject({ code: -32602 });
    expect((await call("construct_read", { run: RUN })).error).toMatchObject({ code: -32602 });
  });
});

describe("init and status", () => {
  it("scaffolded a real run, and says the brief is a scaffold to interview into", async () => {
    // The single most important instruction this server gives: everything
    // downstream is only as good as the interview.
    const res = await ok("construct_status", { run: RUN });
    expect(res.brief).toBe(true);
    expect(String(res.next)).toContain("construct_research");
  });

  it("reports the next step honestly for a run with no evidence yet", async () => {
    const res = await ok("construct_status", { run: RUN });
    expect(String(res.next)).toMatch(/nothing is grounded yet/);
  });
});

describe("the structural gate", () => {
  it("says out loud that a green check is not a quality signal", async () => {
    const res = await ok("construct_check", { run: RUN });
    expect(String(res.note)).toMatch(/ADVISORY/);
    expect(String(res.note)).toMatch(/well-FORMED, not that it is well-researched/);
  });

  it("rejects a grounding threshold outside 0..1", async () => {
    expect(await errorText("construct_check", { run: RUN, min_grounding: 60 })).toMatch(/between 0 and 1/);
  });
});

describe("analyze", () => {
  it("reports what the run is thin on", async () => {
    const res = await ok("construct_analyze", { run: RUN });
    expect(res.run).toBe(RUN);
  });
});

describe("read", () => {
  it("returns a line window and reports the real total", async () => {
    const res = await ok("construct_read", { run: RUN, path: "brief.json", start_line: 1, end_line: 3 });
    expect(res.start_line).toBe(1);
    expect(String(res.content).split("\n").length).toBeLessThanOrEqual(3);
  });

  it("refuses a path outside the run", async () => {
    // Containment is the whole point: this server can be reached over HTTP.
    expect(await errorText("construct_read", { run: RUN, path: "/etc/passwd" })).toMatch(/outside the run/);
  });
});

describe("guardrails", () => {
  it("refuses the write tool unless the server allows writes", async () => {
    await expect(callTool("construct_init", { idea: "x", out: "/tmp/nope" })).rejects.toThrow(ToolError);
    await expect(callTool("construct_init", { idea: "x", out: "/tmp/nope" })).rejects.toThrow(/--allow-write/);
  });

  it("names the missing STEP when there is no run", async () => {
    const bare = mkdtempSync(join(tmpdir(), "con-bare-"));
    temps.push(bare);
    const msg = await errorText("construct_status", { run: bare });
    expect(msg).toMatch(/no run at/);
    expect(msg).toMatch(/construct_init/);
  });

  it("requires absolute paths", async () => {
    expect(await errorText("construct_status", { run: "relative/dir" })).toMatch(/must be an absolute path/);
    await expect(callTool("construct_init", { idea: "x", out: "rel" }, { allowWrite: true })).rejects.toThrow(/must be an absolute path/);
  });

  it("rejects an unknown research angle at the schema, before any network call", async () => {
    // The declared enum catches this, so it comes back as a protocol error
    // rather than a tool result — which is right, and cheaper: no fan-out
    // starts for a request the schema already forbids.
    expect((await call("construct_research", { run: RUN, angles: ["twitter"] })).error).toMatchObject({ code: -32602 });
  });

  it("uses the server's default run when the caller omits one", async () => {
    const withDefault = createServer({ defaultRun: RUN });
    let out: JsonRpcMessage | undefined;
    await withDefault.handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "construct_status", arguments: {} } }, (m) => {
      out = m;
    });
    const result = out!.result as { content: { text: string }[]; isError?: boolean };
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0]!.text).brief).toBe(true);
  });
});
