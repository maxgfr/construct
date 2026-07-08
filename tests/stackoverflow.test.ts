import { describe, it, expect, vi, afterEach } from "vitest";
import { stackoverflow, soTagFor } from "../src/research/stackoverflow.js";

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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res(JSON.stringify(payload))),
    );
    const r = await stackoverflow("extract readable content from URL", 6);
    expect(r.source).toBe("so");
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.ref).toBe("so:5551212");
    expect(r.items[0]!.snippet).toMatch(/score: 47/);
    expect(r.items[0]!.snippet).toMatch(/Readability/);
  });

  it("returns an honest note when the API is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res("", false, 503)),
    );
    const r = await stackoverflow("anything here", 6);
    expect(r.items).toEqual([]);
    expect(r.notes.join(" ")).toMatch(/unavailable/);
  });
});

describe("soTagFor", () => {
  it("slugifies a tech name into a StackOverflow tag, keeping dots and plus", () => {
    expect(soTagFor("PostgreSQL")).toBe("postgresql");
    expect(soTagFor("Next.js")).toBe("next.js");
    expect(soTagFor("C++")).toBe("c++");
    expect(soTagFor("Ruby on Rails")).toBe("ruby-on-rails");
  });
});

describe("stackoverflow — tag scoping + off-topic filter", () => {
  const payloadWith = (items: unknown[]) => JSON.stringify({ quota_remaining: 200, items });

  it("passes tagged=<tag> on the query when a tag is given", async () => {
    let seenUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        seenUrl = url;
        return res(payloadWith([{ question_id: 1, title: "postgres index bloat", body: "<p>vacuum</p>", score: 3, tags: ["postgresql"], link: "l" }]));
      }),
    );
    await stackoverflow("index bloat vacuum postgres", 6, { tag: "postgresql" });
    expect(seenUrl).toContain("tagged=postgresql");
  });

  it("drops items whose title+tags share no keyword with the query", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        res(
          payloadWith([
            { question_id: 1, title: "index bloat in postgres", body: "<p>x</p>", score: 3, tags: ["postgresql"], link: "a" },
            { question_id: 2, title: "The Definitive C++ Book Guide", body: "<p>y</p>", score: 4226, tags: ["c++", "books"], link: "b" },
          ]),
        ),
      ),
    );
    const r = await stackoverflow("postgres index bloat vacuum", 6);
    expect(r.items.map((i) => i.ref)).toEqual(["so:1"]); // the off-topic high-score C++ guide is filtered out
    expect(r.notes.join(" ")).toMatch(/off-topic/i);
  });

  it("retries once without the tag when a tagged query returns nothing", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        // first (tagged) call → empty; second (untagged) → one on-topic hit
        return calls.length === 1
          ? res(payloadWith([]))
          : res(payloadWith([{ question_id: 9, title: "meilisearch typo tolerance tuning", body: "<p>z</p>", score: 5, tags: ["meilisearch"], link: "c" }]));
      }),
    );
    const r = await stackoverflow("meilisearch typo tolerance", 6, { tag: "meilisearch" });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("tagged=meilisearch");
    expect(calls[1]).not.toContain("tagged=");
    expect(r.items).toHaveLength(1);
    expect(r.notes.join(" ")).toMatch(/without the tag|untagged/i);
  });
});
