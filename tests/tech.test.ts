import { describe, it, expect, vi, afterEach } from "vitest";
import { techAngle } from "../src/research/tech.js";
import type { ResearchContext } from "../src/types.js";

function soRes(questionId: number) {
  const body = JSON.stringify({
    quota_remaining: 200,
    items: [
      { question_id: questionId, title: `pitfall ${questionId}`, body: "<p>watch out</p>", score: 3, answer_count: 2, is_answered: true, tags: ["x"], link: `https://stackoverflow.com/q/${questionId}` },
    ],
  });
  return { ok: true, status: 200, headers: { get: () => "application/json" }, arrayBuffer: async () => new TextEncoder().encode(body).buffer, text: async () => body };
}
function fail() {
  return { ok: false, status: 0, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0), text: async () => "" };
}

function ctx(candidateTech: string[]): ResearchContext {
  return {
    brief: { schemaVersion: 1, idea: "fast booking app", product: {}, goals: [], nonGoals: [], constraints: {}, candidateTech, competitors: [], ossSeeds: [], featureWishlist: [], nfrPriorities: [], openQuestions: [], createdAt: "" },
    runDir: "/tmp/x", angles: ["tech"], query: "", webEngine: "auto", semantic: false, perSource: 6, refresh: false,
  };
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

  it("notes honestly when candidateTech is capped beyond the first three", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => fail())); // no docs/SO results
    const [docs] = await techAngle(ctx(["Next.js", "PostgreSQL", "Prisma", "Redis", "Kafka"]));
    const notes = docs!.notes.join(" ");
    expect(notes).toMatch(/Only the first 3 of 5 candidate technologies/);
    expect(notes).toMatch(/Redis, Kafka/);
  });
});
