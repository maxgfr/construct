import { describe, it, expect, vi, afterEach } from "vitest";
import { stackoverflow } from "../src/research/stackoverflow.js";

function res(body: string, ok = true, status = 200) {
  return {
    ok,
    status,
    headers: { get: () => "application/json" },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    text: async () => body,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("stackoverflow", () => {
  it("maps StackExchange results into so evidence", async () => {
    const payload = {
      quota_remaining: 200,
      items: [
        {
          question_id: 5551212,
          title: "How to extract readable content from a URL?",
          body: "<p>Use a Readability extractor.</p>",
          score: 47,
          answer_count: 6,
          is_answered: true,
          tags: ["readability", "scraping"],
          link: "https://stackoverflow.com/q/5551212",
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async () => res(JSON.stringify(payload))));
    const r = await stackoverflow("extract readable content from URL", 6);
    expect(r.source).toBe("so");
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.ref).toBe("so:5551212");
    expect(r.items[0]!.snippet).toMatch(/score: 47/);
    expect(r.items[0]!.snippet).toMatch(/Readability/);
  });

  it("returns an honest note when the API is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res("", false, 503)));
    const r = await stackoverflow("anything here", 6);
    expect(r.items).toEqual([]);
    expect(r.notes.join(" ")).toMatch(/unavailable/);
  });
});
