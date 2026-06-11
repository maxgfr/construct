import { describe, it, expect, vi, afterEach } from "vitest";
import { techAngle } from "../src/research/tech.js";
import type { ResearchContext } from "../src/types.js";

function soRes(questionId: number) {
  const body = JSON.stringify({
    quota_remaining: 200,
    items: [
      {
        question_id: questionId,
        title: `pitfall ${questionId}`,
        body: "<p>watch out</p>",
        score: 3,
        answer_count: 2,
        is_answered: true,
        tags: ["x"],
        link: `https://stackoverflow.com/q/${questionId}`,
      },
    ],
  });
  return {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    text: async () => body,
  };
}
function fail() {
  // 404, not 0: a transient status would exercise httpGet retries (covered in fetch.test.ts) and slow the suite.
  return { ok: false, status: 404, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0), text: async () => "" };
}

function ctx(candidateTech: string[], docsUrls?: string[]): ResearchContext {
  return {
    brief: {
      schemaVersion: 1,
      idea: "fast booking app",
      product: {},
      goals: [],
      nonGoals: [],
      constraints: {},
      candidateTech,
      competitors: [],
      ossSeeds: [],
      featureWishlist: [],
      nfrPriorities: [],
      openQuestions: [],
      createdAt: "",
    },
    runDir: "/tmp/x",
    angles: ["tech"],
    query: "",
    webEngine: "auto",
    semantic: false,
    perSource: 6,
    refresh: false,
    docsUrls,
  };
}

function htmlRes(body: string) {
  const html = `<html><body>${body}</body></html>`;
  return { ok: true, status: 200, headers: { get: () => "text/html" }, arrayBuffer: async () => new TextEncoder().encode(html).buffer, text: async () => html };
}

afterEach(() => vi.unstubAllGlobals());

describe("techAngle StackOverflow", () => {
  it("issues one focused StackOverflow query per candidate tech (not one over-constrained query)", async () => {
    let soCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("stackexchange")) {
          soCalls++;
          return soRes(soCalls);
        }
        return fail(); // searxng/ddg docs discovery returns nothing
      }),
    );
    const [docs, so] = await techAngle(ctx(["Next.js", "PostgreSQL", "Prisma"]));
    expect(soCalls).toBe(3); // one per tech
    expect(so!.source).toBe("so");
    expect(so!.items.length).toBe(3); // distinct question ids, deduped by ref
    expect(docs!.source).toBe("docs");
  });

  it("grounds --docs-url pages directly as docs evidence, skipping discovery", async () => {
    const fetched: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        fetched.push(String(url));
        if (String(url).startsWith("https://docs.example/")) return htmlRes("booking app guide ".repeat(40));
        return fail();
      }),
    );
    const [docs] = await techAngle(ctx([], ["https://docs.example/x"]));
    expect(fetched).toContain("https://docs.example/x");
    expect(docs!.items.length).toBeGreaterThan(0);
    expect(docs!.items.every((i) => i.url === "https://docs.example/x")).toBe(true);
    const notes = docs!.notes.join(" ");
    expect(notes).toMatch(/Grounded 1 docs URL\(s\) passed via --docs-url/);
    expect(notes).not.toMatch(/nothing to ground feasibility against/);
  });

  it("fetches every comma-listed --docs-url page (never budget-trimmed)", async () => {
    const fetched: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        fetched.push(String(url));
        return htmlRes("fast booking app docs page ".repeat(40));
      }),
    );
    const [docs] = await techAngle(ctx([], ["https://docs.example/a", "https://docs.example/b"]));
    expect(fetched).toContain("https://docs.example/a");
    expect(fetched).toContain("https://docs.example/b");
    const urls = new Set(docs!.items.map((i) => i.url));
    expect(urls.has("https://docs.example/a")).toBe(true);
    expect(urls.has("https://docs.example/b")).toBe(true);
  });

  it("notes honestly when candidateTech is capped beyond the first three", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => fail()),
    ); // no docs/SO results
    const [docs] = await techAngle(ctx(["Next.js", "PostgreSQL", "Prisma", "Redis", "Kafka"]));
    const notes = docs!.notes.join(" ");
    expect(notes).toMatch(/Only the first 3 of 5 candidate technologies/);
    expect(notes).toMatch(/Redis, Kafka/);
  });
});
