import { describe, it, expect } from "vitest";
import { constructAdapter } from "../src/mcp/adapter.js";
import { TOOLS, WRITE_TOOLS, TOOL_META, annotationsFor, toolsFor } from "../src/mcp/tools.js";
import { validateArgs } from "../src/engine.js";

const ALL = [...TOOLS, ...WRITE_TOOLS];

describe("tool declarations", () => {
  it("names every tool consistently and uniquely", () => {
    const names = ALL.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^construct_[a-z_]+$/);
  });

  it("declares a well-formed object schema whose required properties exist", () => {
    for (const t of ALL) {
      expect(t.inputSchema.type, t.name).toBe("object");
      expect(Array.isArray(t.inputSchema.required), t.name).toBe(true);
      for (const r of t.inputSchema.required) {
        expect(Object.keys(t.inputSchema.properties), `${t.name}.required lists "${r}"`).toContain(r);
      }
      for (const [key, spec] of Object.entries(t.inputSchema.properties)) {
        expect(spec.description, `${t.name}.${key} has no description`).toBeTruthy();
      }
    }
  });

  it("gives every tool a description that says what it is for", () => {
    for (const t of ALL) {
      expect(t.description.length, t.name).toBeGreaterThan(80);
      expect(t.title, t.name).toBeTruthy();
    }
  });

  it("says out loud that the gate is structural and grounding is advisory", () => {
    // The sentence that keeps this server honest. Without it a green check
    // reads as "well-researched", which it never means.
    const check = TOOLS.find((t) => t.name === "construct_check")!;
    expect(check.description).toMatch(/ADVISORY/);
    expect(check.description).toMatch(/rigor is yours/);
  });

  it("warns that research is the slow, network-bound one", () => {
    const research = TOOLS.find((t) => t.name === "construct_research")!;
    expect(research.description).toMatch(/SLOW/);
    expect(research.description).toMatch(/ONLY command that grounds/);
  });

  it("tells the caller the brief is a scaffold they must fill by interviewing", () => {
    const init = WRITE_TOOLS.find((t) => t.name === "construct_init")!;
    expect(init.description).toMatch(/SCAFFOLD/);
    expect(init.description).toMatch(/Do not invent the answers/);
  });

  it("declares an outputSchema only where the result shape is small and stable", () => {
    expect(ALL.filter((t) => t.outputSchema).map((t) => t.name)).toEqual(["construct_read"]);
  });
});

describe("annotations", () => {
  const EXPECTED: Record<string, { readOnlyHint: boolean; openWorldHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean }> = {
    construct_status: { readOnlyHint: true, openWorldHint: false },
    construct_research: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    construct_research_angle: { readOnlyHint: true, openWorldHint: true },
    construct_analyze: { readOnlyHint: true, openWorldHint: false },
    construct_render: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    construct_check: { readOnlyHint: true, openWorldHint: false },
    construct_review: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    construct_verify: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    construct_cache: { readOnlyHint: true, openWorldHint: false },
    construct_read: { readOnlyHint: true, openWorldHint: false },
    construct_init: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  };

  it("annotates every declared tool, and only declared tools", () => {
    expect(Object.keys(TOOL_META).sort()).toEqual(ALL.map((t) => t.name).sort());
    expect(Object.keys(EXPECTED).sort()).toEqual(ALL.map((t) => t.name).sort());
  });

  it("matches the expected hint matrix", () => {
    for (const [name, want] of Object.entries(EXPECTED)) expect(annotationsFor(name), name).toEqual(want);
  });

  it("marks the two tools that reach the network as open-world", () => {
    const openWorld = ALL.filter((t) => TOOL_META[t.name]!.openWorld).map((t) => t.name);
    expect(openWorld.sort()).toEqual(["construct_research", "construct_research_angle"]);
  });

  it("declares nothing destructive", () => {
    expect(ALL.filter((t) => TOOL_META[t.name]!.destructive)).toEqual([]);
  });
});

describe("toolsFor", () => {
  it("hides the write tool unless the server was started with --allow-write", () => {
    expect(toolsFor("2025-06-18").map((t) => t.name)).not.toContain("construct_init");
    expect(toolsFor("2025-06-18", { allowWrite: true }).map((t) => t.name)).toContain("construct_init");
  });

  it("gates rich fields and annotations on the negotiated protocol version", () => {
    const old = toolsFor("2024-11-05").find((t) => t.name === "construct_read")!;
    expect(old.annotations).toBeUndefined();
    expect(old.title).toBeUndefined();

    const now = toolsFor("2025-06-18").find((t) => t.name === "construct_read")!;
    expect(now.annotations).toBeTruthy();
    expect(now.outputSchema).toBeTruthy();
  });

  it("makes `run` optional, and says so, when the server has a default", () => {
    for (const t of toolsFor("2025-06-18", { defaultRun: "/srv/run" })) {
      if (!t.inputSchema.properties.run) continue;
      expect(t.inputSchema.required, t.name).not.toContain("run");
      expect(t.inputSchema.properties.run.description, t.name).toContain("/srv/run");
    }
  });
});

describe("declared schemas accept what the handlers expect", () => {
  it("validates a representative call per tool", () => {
    const sample: Record<string, Record<string, unknown>> = {
      construct_status: { run: "/r" },
      construct_research: { run: "/r", angles: ["market", "oss"], per_source: 5 },
      construct_research_angle: { angle: "oss", query: "job queues", per_source: 4 },
      construct_analyze: { run: "/r" },
      construct_render: { run: "/r", level: "complex", merge: true, prd: true },
      construct_check: { run: "/r", min_grounding: 0.6, semantic: true },
      construct_review: { run: "/r", max_review: 20 },
      construct_verify: { run: "/r", app: "/app", run_tests: true },
      construct_cache: {},
      construct_read: { run: "/r", path: "brief.json", start_line: 1, end_line: 20 },
      construct_init: { idea: "an idea", out: "/r" },
    };
    for (const t of ALL) expect(validateArgs(t.inputSchema, sample[t.name]!), t.name).toBeUndefined();
  });

  it("rejects a missing required argument and an out-of-enum value", () => {
    const angle = TOOLS.find((t) => t.name === "construct_research_angle")!;
    expect(validateArgs(angle.inputSchema, { angle: "oss" })).toMatch(/`query` is required/);
    expect(validateArgs(angle.inputSchema, { angle: "twitter", query: "x" })).toMatch(/angle/);
    const render = TOOLS.find((t) => t.name === "construct_render")!;
    expect(validateArgs(render.inputSchema, { run: "/r", level: "medium" })).toMatch(/level/);
  });
});
