import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ShResult } from "../src/util.js";
import type { SourceResult } from "../src/types.js";

// semanticControl shells out to `docker compose` and probes PATH; semanticRescore
// speaks HTTP to a local Ollama. Both are driven offline here: util's have/sh are
// mocked for the stack control, and global fetch is stubbed for the rescoring.
const { have, sh } = vi.hoisted(() => ({ have: vi.fn(), sh: vi.fn() }));
vi.mock("../src/util.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/util.js")>();
  return { ...actual, have, sh };
});

import { semanticControl, semanticRescore } from "../src/research/semantic.js";

const okSh = (over: Partial<ShResult> = {}): ShResult => ({ ok: true, status: 0, stdout: "", stderr: "", missing: false, ...over });
const failSh = (stderr: string): ShResult => ({ ok: false, status: 1, stdout: "", stderr, missing: false });

beforeEach(() => {
  have.mockReset();
  sh.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("semanticControl", () => {
  it("rejects an unknown action without touching docker", () => {
    const r = semanticControl("bogus");
    expect(r.code).toBe(1);
    expect(r.message).toMatch(/unknown action "bogus"/);
    expect(have).not.toHaveBeenCalled();
    expect(sh).not.toHaveBeenCalled();
  });

  it("reports a clean error (no shelling out) when docker is not installed", () => {
    have.mockReturnValue(false);
    const r = semanticControl("up");
    expect(r.code).toBe(1);
    expect(r.message).toMatch(/docker not found/);
    expect(sh).not.toHaveBeenCalled();
  });

  it("reports a targeted error (not a raw docker failure) when the compose file is not found", () => {
    have.mockReturnValue(true);
    const r = semanticControl("up", null); // inject a missing compose path
    expect(r.code).toBe(1);
    expect(r.message).toMatch(/docker-compose\.yml not found/i);
    expect(r.message).toMatch(/reinstall|npx skills add|semantic-setup/i);
    expect(sh).not.toHaveBeenCalled();
  });

  it("status prints `docker compose ps` output and is always exit 0", () => {
    have.mockReturnValue(true);
    sh.mockReturnValue(okSh({ stdout: "NAME     STATUS\nollama   Up 2m" }));
    const r = semanticControl("status");
    expect(r.code).toBe(0);
    expect(r.message).toContain("ollama");
    expect(sh).toHaveBeenCalledWith("docker", expect.arrayContaining(["compose", "ps"]), expect.anything());
  });

  it("status with empty output falls back to a friendly line, still exit 0", () => {
    have.mockReturnValue(true);
    sh.mockReturnValue(okSh({ stdout: "" }));
    const r = semanticControl("status");
    expect(r.code).toBe(0);
    expect(r.message).toMatch(/no services running/);
  });

  it("status failure surfaces stderr but does not gate (exit 0)", () => {
    have.mockReturnValue(true);
    sh.mockReturnValue(failSh("daemon not running"));
    const r = semanticControl("status");
    expect(r.code).toBe(0);
    expect(r.message).toMatch(/status failed/);
    expect(r.message).toContain("daemon not running");
  });

  it("down stops the full-profile stack", () => {
    have.mockReturnValue(true);
    sh.mockReturnValue(okSh());
    const r = semanticControl("down");
    expect(r.code).toBe(0);
    expect(r.message).toMatch(/stack stopped/);
    expect(sh).toHaveBeenCalledWith("docker", expect.arrayContaining(["--profile", "all", "down"]), expect.anything());
  });

  it("down failure returns exit 1 with stderr", () => {
    have.mockReturnValue(true);
    sh.mockReturnValue(failSh("permission denied"));
    const r = semanticControl("down");
    expect(r.code).toBe(1);
    expect(r.message).toMatch(/down failed/);
    expect(r.message).toContain("permission denied");
  });

  it("up brings the stack up and reports the model ready when the pull succeeds", () => {
    have.mockReturnValue(true);
    sh.mockReturnValueOnce(okSh()).mockReturnValueOnce(okSh()); // up, then pull
    const r = semanticControl("up");
    expect(r.code).toBe(0);
    expect(r.message).toMatch(/stack is up/);
    expect(r.message).toMatch(/model:\s+\S+ ready/);
    expect(sh).toHaveBeenCalledTimes(2);
  });

  it("up succeeds but a failed pull yields a manual-pull hint (still exit 0)", () => {
    have.mockReturnValue(true);
    sh.mockReturnValueOnce(okSh()).mockReturnValueOnce(failSh("no such model"));
    const r = semanticControl("up");
    expect(r.code).toBe(0);
    expect(r.message).toMatch(/pull '.*' yourself/);
  });

  it("up failure returns exit 1 and never attempts the model pull", () => {
    have.mockReturnValue(true);
    sh.mockReturnValueOnce(failSh("cannot connect to the docker daemon"));
    const r = semanticControl("up");
    expect(r.code).toBe(1);
    expect(r.message).toMatch(/up failed/);
    expect(sh).toHaveBeenCalledTimes(1); // no pull after a failed up
  });
});

// Minimal Response-like object for the global fetch stub (mirrors web.test.ts).
function res(body: string, opts: { ok?: boolean; status?: number; contentType?: string } = {}) {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? (opts.contentType ?? "application/json") : null) },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    text: async () => body,
  };
}

const item = (id: string, title: string, snippet: string, score: number) => ({
  id,
  source: "market" as const,
  title,
  ref: "",
  location: "",
  score,
  snippet,
  url: "",
});
const oneSource = (...items: ReturnType<typeof item>[]): SourceResult[] => [{ source: "market", items, notes: [] }];

describe("semanticRescore", () => {
  it("keeps lexical ranking (unavailable) when Ollama is not reachable", async () => {
    // 404 is non-transient → httpGet returns immediately, no retry/backoff wait.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res("", { ok: false, status: 404 })),
    );
    const input = oneSource(item("m1", "t", "s", 0.5));
    const r = await semanticRescore(input, "query");
    expect(r.available).toBe(false);
    expect(r.results).toBe(input); // returned unchanged, same reference
    expect(r.notes[0]).toMatch(/unavailable.*Ollama not reachable/);
  });

  it("keeps lexical ranking when the query itself cannot be embedded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/api/tags")) return res("{}", { ok: true });
        return res(JSON.stringify({}), { ok: true }); // embeddings: no vector
      }),
    );
    const r = await semanticRescore(oneSource(item("m1", "t", "s", 0.5)), "q");
    expect(r.available).toBe(false);
    expect(r.notes[0]).toMatch(/could not embed the query/);
  });

  it("rescores each item by cosine similarity to the query embedding", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { body?: string }) => {
        const u = String(url);
        if (u.endsWith("/api/tags")) return res("{}", { ok: true });
        if (u.includes("/api/embeddings")) {
          const prompt = String(JSON.parse(init!.body!).prompt);
          const vec = prompt.includes("relevant") ? [1, 0, 0] : [0, 1, 0];
          return res(JSON.stringify({ embedding: vec }), { ok: true });
        }
        return res("", { ok: false, status: 404 });
      }),
    );
    const input = oneSource(item("m1", "relevant title", "relevant", 0.5), item("m2", "other", "other", 0.9));
    const r = await semanticRescore(input, "relevant");
    expect(r.available).toBe(true);
    // rescore preserves item order; m1 aligns with the query ([1,0,0]) → cosine 1,
    // m2 is orthogonal → cosine 0.
    const scored = r.results[0]!.items;
    expect(scored[0]!.score).toBeCloseTo(1, 3);
    expect(scored[1]!.score).toBeCloseTo(0, 3);
    expect(scored.every((i) => (i.meta as { semantic?: boolean })?.semantic === true)).toBe(true);
  });

  it("sinks un-embeddable items to a sentinel score and notes the count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { body?: string }) => {
        const u = String(url);
        if (u.endsWith("/api/tags")) return res("{}", { ok: true });
        if (u.includes("/api/embeddings")) {
          const prompt = String(JSON.parse(init!.body!).prompt);
          // The query embeds fine; the item embedding comes back empty.
          if (prompt === "q") return res(JSON.stringify({ embedding: [1, 0] }), { ok: true });
          return res(JSON.stringify({}), { ok: true });
        }
        return res("", { ok: false, status: 404 });
      }),
    );
    const r = await semanticRescore(oneSource(item("m1", "t", "s", 0.5)), "q");
    expect(r.available).toBe(true);
    const only = r.results[0]!.items[0]!;
    expect(only.score).toBe(-1);
    expect((only.meta as { semantic?: boolean }).semantic).toBe(false);
    expect(r.notes.join(" ")).toMatch(/1 item\(s\) could not be embedded/);
  });
});
