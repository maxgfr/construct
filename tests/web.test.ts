import { describe, it, expect, vi, afterEach } from "vitest";
import { discover, webFetchUrls } from "../src/research/web.js";

// Build a minimal Response-like object for the global fetch mock.
function res(body: string, opts: { ok?: boolean; status?: number; contentType?: string } = {}) {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? opts.contentType ?? "text/html" : null) },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    text: async () => body,
  };
}

const ddgHtml = (urls: string[]) =>
  urls
    .map((u) => `<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(u)}&rut=x">title</a>`)
    .join("\n");

afterEach(() => vi.unstubAllGlobals());

describe("discover (three-tier keyless web search)", () => {
  it("returns SearXNG results first under the auto policy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("8888")) return res(JSON.stringify({ results: [{ url: "https://s1.com" }, { url: "https://s2.com" }] }), { contentType: "application/json" });
        return res("", { ok: false, status: 0 });
      }),
    );
    const d = await discover("read later app", "auto", 5);
    expect(d.via).toBe("searxng");
    expect(d.urls).toEqual(["https://s1.com", "https://s2.com"]);
  });

  it("falls back to DuckDuckGo and decodes the uddg redirector", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("8888")) return res("", { ok: false, status: 0 }); // SearXNG down
        if (String(url).includes("duckduckgo")) return res(ddgHtml(["https://real-one.com/page", "https://real-two.com"]));
        return res("", { ok: false, status: 0 });
      }),
    );
    const d = await discover("read later app", "auto", 5);
    expect(d.via).toBe("duckduckgo");
    expect(d.urls).toContain("https://real-one.com/page");
    expect(d.urls.some((u) => u.includes("duckduckgo.com"))).toBe(false);
  });

  it("emits a WebSearch hint when no keyless engine returns results", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res("", { ok: false, status: 0 })));
    const d = await discover("x", "auto", 5);
    expect(d.urls).toEqual([]);
    expect(d.notes.join(" ")).toMatch(/built-in WebSearch/i);
  });
});

describe("webFetchUrls", () => {
  it("fetches a page and grounds excerpts around the question keywords", async () => {
    const page = "<html><body><p>Intro</p><p>The search index supports full-text search with tagging.</p></body></html>";
    vi.stubGlobal("fetch", vi.fn(async () => res(page)));
    const { items } = await webFetchUrls(["https://example.com"], "full-text search", 6, "market");
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]!.source).toBe("market");
    expect(items[0]!.snippet).toMatch(/full-text search/i);
  });

  it("fetches ALL user-named URLs when fetchAll is set (does not drop half)", async () => {
    const fetched: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      fetched.push(String(url));
      return res(`<p>content about search at ${url}</p>`);
    }));
    const urls = ["https://a.com", "https://b.com", "https://c.com", "https://d.com"];
    const { items } = await webFetchUrls(urls, "search", 2, "docs", true);
    expect(fetched.length).toBe(4); // all four, despite perSource=2
    expect(items.every((i) => i.source === "docs")).toBe(true);
  });
});
