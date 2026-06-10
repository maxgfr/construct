import { describe, it, expect, vi, afterEach } from "vitest";
import { parseArgs } from "../src/cli.js";

// parseArgs calls process.exit on help/version/errors; trap it so tests can
// assert without killing the runner.
function trapExit(fn: () => void): { exited: boolean; code: number | undefined } {
  const state = { exited: false, code: undefined as number | undefined };
  const exit = vi.spyOn(process, "exit").mockImplementation(((c?: number) => {
    state.exited = true;
    state.code = c;
    throw new Error("__exit__");
  }) as never);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    fn();
  } catch (e) {
    if ((e as Error).message !== "__exit__") throw e;
  } finally {
    exit.mockRestore();
  }
  return state;
}

afterEach(() => vi.restoreAllMocks());

describe("parseArgs", () => {
  it("parses init with flags", () => {
    const p = parseArgs(["init", "--idea", "a cool app", "--out", "./run"]);
    expect(p.command).toBe("init");
    expect(p.values.idea).toBe("a cool app");
    expect(p.values.out).toBe("./run");
  });

  it("parses research with angles and boolean flags", () => {
    const p = parseArgs(["research", "--out=run", "--angles=market,oss", "--semantic"]);
    expect(p.command).toBe("research");
    expect(p.values.angles).toBe("market,oss");
    expect(p.bools.has("semantic")).toBe(true);
  });

  it("collects the positional action for semantic", () => {
    const p = parseArgs(["semantic", "up"]);
    expect(p.command).toBe("semantic");
    expect(p.positional).toEqual(["up"]);
  });

  it("parses check with --min-grounding and --json", () => {
    const p = parseArgs(["check", "--out", "run", "--min-grounding", "70", "--json"]);
    expect(p.command).toBe("check");
    expect(p.values["min-grounding"]).toBe("70");
    expect(p.bools.has("json")).toBe(true);
  });

  it("parses the analyze command", () => {
    const p = parseArgs(["analyze", "--out=run", "--json"]);
    expect(p.command).toBe("analyze");
    expect(p.values.out).toBe("run");
    expect(p.bools.has("json")).toBe(true);
  });

  it("exits on an unknown command", () => {
    expect(trapExit(() => parseArgs(["frobnicate"])).code).toBe(1);
  });

  it("exits on an unknown flag", () => {
    expect(trapExit(() => parseArgs(["render", "--bogus", "v"])).code).toBe(1);
  });

  it("exits 0 on --version", () => {
    expect(trapExit(() => parseArgs(["--version"])).code).toBe(0);
  });
});
