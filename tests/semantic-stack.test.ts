import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync } from "node:fs";
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

import { stackCommand, semanticRescore } from "../src/research/semantic.js";

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

// The compose file, the timeouts and the orchestration are the engine's, tested
// there against a fake docker. What is construct's — and what these cover — is
// the mapping: which services each of its two commands means, that neither
// drifts into the other's, and the `use:` hint each one ends with.
function fake(over: { fails?: string; missingDocker?: boolean; ps?: string } = {}) {
  const calls: string[][] = [];
  const deps = {
    has: () => !over.missingDocker,
    run: (cmd: string, args: string[]) => {
      calls.push([cmd, ...args]);
      const verb = args.find((a) => ["pull", "up", "down", "ps", "exec"].includes(a)) ?? "";
      const ok = over.fails !== verb;
      return { ok, stdout: verb === "ps" ? (over.ps ?? "") : "", stderr: ok ? "" : "boom" };
    },
  };
  return { calls, deps };
}
const profilesOf = (argv: string[]): string[] => argv.filter((a, i) => argv[i - 1] === "--profile");

describe("stackCommand", () => {
  it("rejects an unknown action without touching docker", () => {
    const { calls, deps } = fake();
    const r = stackCommand("semantic", "bogus", deps);
    expect(r.code).toBe(1);
    expect(r.message).toMatch(/unknown action "bogus"/);
    expect(calls).toEqual([]);
  });

  it("reports a clean error (no shelling out) when docker is not installed", () => {
    const { calls, deps } = fake({ missingDocker: true });
    const r = stackCommand("semantic", "up", deps);
    expect(r.code).toBe(1);
    expect(r.message).toMatch(/docker not found/);
    expect(calls).toEqual([]);
  });

  it("works from an install, not just a clone", () => {
    // This replaces a test for the opposite outcome. The old lookup walked up
    // from the bundle for docker-compose.yml and returned "not found — reinstall
    // the skill" for every install that was not a checkout. The engine writes
    // the file out on demand, so there is nothing left to fail to find.
    const { calls, deps } = fake();
    const r = stackCommand("semantic", "status", deps);
    expect(r.code).toBe(0);
    const file = calls[0]![calls[0]!.indexOf("-f") + 1]!;
    expect(existsSync(file)).toBe(true);
    expect(file).toContain("construct"); // under OUR cache dir, not a shared one
  });

  it("status prints `docker compose ps` output and is always exit 0", () => {
    const { calls, deps } = fake({ ps: "NAME     STATUS\nollama   Up 2m" });
    const r = stackCommand("semantic", "status", deps);
    expect(r.code).toBe(0);
    expect(r.message).toContain("ollama");
    expect(calls[0]).toEqual(expect.arrayContaining(["compose", "ps"]));
  });

  it("status with empty output falls back to a friendly line, still exit 0", () => {
    const { deps } = fake({ ps: "" });
    const r = stackCommand("semantic", "status", deps);
    expect(r.code).toBe(0);
    expect(r.message).toMatch(/no services running/);
  });

  it("status failure surfaces stderr but does not gate (exit 0)", () => {
    const { deps } = fake({ fails: "ps" });
    const r = stackCommand("semantic", "status", deps);
    expect(r.code).toBe(0);
    expect(r.message).toMatch(/status failed/);
    expect(r.message).toContain("boom");
  });

  it("down stops exactly the services semantic started", () => {
    const { calls, deps } = fake();
    const r = stackCommand("semantic", "down", deps);
    expect(r.code).toBe(0);
    expect(r.message).toMatch(/stopped/);
    // `--profile semantic --profile search` selects what `--profile all` did:
    // qdrant and ollama carry ["semantic","all"], searxng ["search","all"].
    expect(profilesOf(calls[0]!)).toEqual(["semantic", "search"]);
  });

  it("down failure returns exit 1 with stderr", () => {
    const { deps } = fake({ fails: "down" });
    const r = stackCommand("semantic", "down", deps);
    expect(r.code).toBe(1);
    expect(r.message).toMatch(/down failed/);
    expect(r.message).toContain("boom");
  });

  it("up brings the stack up, reports the model ready, and says what to run next", () => {
    const { deps } = fake();
    const r = stackCommand("semantic", "up", deps);
    expect(r.code).toBe(0);
    expect(r.message).toMatch(/Qdrant/);
    expect(r.message).toMatch(/model:\s+\S+ ready/);
    expect(r.message).toMatch(/use:\s+construct research/);
  });

  it("up succeeds but a failed pull yields a manual-pull hint (still exit 0)", () => {
    const { deps } = fake({ fails: "exec" });
    const r = stackCommand("semantic", "up", deps);
    expect(r.code).toBe(0);
    expect(r.message).toMatch(/pull it yourself/);
  });

  it("up failure returns exit 1 and never attempts the model pull", () => {
    const { calls, deps } = fake({ fails: "up" });
    const r = stackCommand("semantic", "up", deps);
    expect(r.code).toBe(1);
    expect(r.message).toMatch(/up failed/);
    expect(calls.some((c) => c.includes("exec"))).toBe(false);
  });

  it("pulls the images before `up`, on a longer budget", () => {
    // `up` runs on five minutes. Letting it cover a multi-gigabyte download
    // makes a slow network look like a broken stack.
    const { calls, deps } = fake();
    stackCommand("semantic", "up", deps);
    const verbs = calls.map((c) => c.find((a) => ["pull", "up", "exec"].includes(a)));
    expect(verbs).toEqual(["pull", "up", "exec"]);
  });

  // `up -d` returns as soon as the containers are CREATED. The very next thing
  // this code does is talk to them (pull a model, probe :8888, scrape a page) —
  // and a failed probe is latched for the whole process. So a slow start used to
  // present as "the stack does not work" for the rest of the run.
  it("waits for the containers to be healthy before returning (--wait)", () => {
    const { calls, deps } = fake();
    stackCommand("semantic", "up", deps);
    expect(calls.find((c) => c.includes("up"))).toEqual(expect.arrayContaining(["up", "-d", "--wait"]));
  });
});

describe("stackCommand — the firecrawl stack", () => {
  it("up starts the extraction stack with --wait and names the port", () => {
    const { calls, deps } = fake();
    const r = stackCommand("firecrawl", "up", deps);
    expect(r.code).toBe(0);
    expect(calls.find((c) => c.includes("up"))).toEqual(expect.arrayContaining(["up", "-d", "--wait"]));
    expect(r.message).toMatch(/Firecrawl is up \(:3002/);
    // No embedding model here — that post-up step belongs to `semantic`.
    expect(calls.some((c) => c.includes("exec"))).toBe(false);
  });

  it("starts the search engine it delegates to, and never the semantic pair", () => {
    // Firecrawl's keyless /search goes through SearXNG, so bringing it up alone
    // would give an extractor that cannot discover anything. Qdrant and Ollama
    // stay out: ~1 GB `semantic up` must not drag in, and vice versa.
    const { calls, deps } = fake();
    stackCommand("firecrawl", "down", deps);
    expect(profilesOf(calls[0]!)).toEqual(["search", "extract"]);
    expect(profilesOf(calls[0]!)).not.toContain("semantic");
  });

  it("reports errors under its own command name, not `semantic`", () => {
    const { deps } = fake({ missingDocker: true });
    const r = stackCommand("firecrawl", "up", deps);
    expect(r.code).toBe(1);
    expect(r.message).toMatch(/^construct firecrawl: docker not found/);
  });

  it("rejects an unknown action without touching docker", () => {
    const { calls, deps } = fake();
    const r = stackCommand("firecrawl", "restart", deps);
    expect(r.code).toBe(1);
    expect(r.message).toMatch(/construct firecrawl: unknown action "restart"/);
    expect(calls).toEqual([]);
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
        // The engine posts to /api/embed with `input` (an array), not the
        // legacy /api/embeddings with `prompt`. Same model, current endpoint.
        if (u.includes("/api/embed")) {
          const input = JSON.parse(init!.body!).input as string[];
          return res(JSON.stringify({ embeddings: input.map((t) => (t.includes("relevant") ? [1, 0, 0] : [0, 1, 0])) }), { ok: true });
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
        if (u.includes("/api/embed")) {
          const input = JSON.parse(init!.body!).input as string[];
          // The query embeds fine; the item embedding comes back empty.
          if (input[0] === "q") return res(JSON.stringify({ embeddings: [[1, 0]] }), { ok: true });
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
