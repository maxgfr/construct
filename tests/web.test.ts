import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discover, webFetchUrls } from "../src/research/web.js";
import { marketAngle } from "../src/research/market.js";
import { runResearch } from "../src/research/registry.js";

// Build a minimal Response-like object for the global fetch mock.
function res(body: string, opts: { ok?: boolean; status?: number; contentType?: string } = {}) {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? (opts.contentType ?? "text/html") : null) },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    text: async () => body,
  };
}

const ddgHtml = (urls: string[]) => urls.map((u) => `<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(u)}&rut=x">title</a>`).join("\n");

afterEach(() => vi.unstubAllGlobals());

describe("discover (three-tier keyless web search)", () => {
  it("returns SearXNG results first under the auto policy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("8888"))
          return res(JSON.stringify({ results: [{ url: "https://s1.com" }, { url: "https://s2.com" }] }), { contentType: "application/json" });
        return res("", { ok: false, status: 404 });
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
        return res("", { ok: false, status: 404 });
      }),
    );
    const d = await discover("read later app", "auto", 5);
    expect(d.via).toBe("duckduckgo");
    expect(d.urls).toContain("https://real-one.com/page");
    expect(d.urls.some((u) => u.includes("duckduckgo.com"))).toBe(false);
  });

  it("emits a WebSearch hint when no keyless engine returns results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res("", { ok: false, status: 404 })),
    );
    const d = await discover("x", "auto", 5);
    expect(d.urls).toEqual([]);
    expect(d.notes.join(" ")).toMatch(/built-in WebSearch/i);
  });
});

describe("URL-grounding guidance points at the command that actually persists", () => {
  // construct-ERR-1: web|oss|tech|so are PRINT-ONLY (printDrill writes stdout,
  // persists nothing); only `construct research --url` pins pages into the
  // dossier. The WebSearch fallback note must therefore name `research --url`,
  // NOT the print-only `web --url` drill (which leaves the claim ungrounded).
  it("the WebSearch fallback note names `research --url` (persists), not the print-only `web --url` drill", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res("", { ok: false, status: 404 })),
    );
    const d = await discover("x", "auto", 5);
    const note = d.notes.join(" ");
    expect(note).toMatch(/built-in WebSearch/i);
    // Names the command that ACTUALLY grounds (writes the dossier)…
    expect(note).toMatch(/construct research[^`]*--url/);
    // …and does NOT tell the user to "ground" with the print-only web drill.
    expect(note).not.toMatch(/ground[^`]*construct web --url/);
  });

  it("the command the note names (research --url) grows evidence.json", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes("pinned.example.com")) return res("<p>A creator marketplace with campaign briefs and escrow payments.</p>");
        return res("", { ok: false, status: 404 }); // discovery engines down
      }),
    );
    const runDir = mkdtempSync(join(tmpdir(), "construct-url-ground-"));
    try {
      const ctx = {
        brief: { idea: "a creator marketplace", competitors: [], featureWishlist: [] },
        runDir,
        angles: ["market"],
        query: "",
        webEngine: "auto",
        semantic: false,
        perSource: 6,
        refresh: false,
        marketUrls: ["https://pinned.example.com/features"],
      } as never;
      await runResearch(ctx, new Date().toISOString());
      const ev = JSON.parse(readFileSync(join(runDir, "evidence", "evidence.json"), "utf8"));
      expect(ev.length).toBeGreaterThan(0); // research --url persisted the pinned page
      expect(JSON.stringify(ev)).toContain("pinned.example.com");
    } finally {
      rmSync(runDir, { recursive: true, force: true });
    }
  });
});

describe("webFetchUrls", () => {
  it("fetches a page and grounds excerpts around the question keywords", async () => {
    const page = "<html><body><p>Intro</p><p>The search index supports full-text search with tagging.</p></body></html>";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res(page)),
    );
    const { items } = await webFetchUrls(["https://example.com"], "full-text search", 6, "market");
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]!.source).toBe("market");
    expect(items[0]!.snippet).toMatch(/full-text search/i);
  });

  it("fetches ALL user-named URLs when fetchAll is set (does not drop half)", async () => {
    const fetched: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        fetched.push(String(url));
        return res(`<p>content about search at ${url}</p>`);
      }),
    );
    const urls = ["https://a.com", "https://b.com", "https://c.com", "https://d.com"];
    const { items } = await webFetchUrls(urls, "search", 2, "docs", true);
    expect(fetched.length).toBe(4); // all four, despite perSource=2
    expect(items.every((i) => i.source === "docs")).toBe(true);
  });

  it("marks a pinned page low-signal and prefers its meta description when nothing matches", async () => {
    const page = `<html><head><meta name="description" content="Official pricing and rate limits for the API."></head><body><div id="cookie">We use cookies. Accept all cookies to continue.</div><p>Totally unrelated marketing filler about our mission.</p></body></html>`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res(page)),
    );
    const { items } = await webFetchUrls(["https://docs.example/pricing"], "quantum entanglement teleportation", 6, "docs", true);
    expect(items.length).toBe(1);
    expect(items[0]!.meta?.lowSignal).toBe(true);
    expect(items[0]!.snippet).toMatch(/Official pricing and rate limits/); // meta description, not the cookie banner
    expect(items[0]!.snippet).not.toMatch(/Accept all cookies/);
  });
});

describe("marketAngle — pinned URLs (research --url)", () => {
  it("fetches pinned URLs into the market evidence even when discovery finds nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes("pinned.example.com")) return res("<p>A creator marketplace with campaign briefs and escrow payments.</p>");
        return res("", { ok: false, status: 404 }); // discovery engines down
      }),
    );
    const ctx = {
      brief: { idea: "a creator marketplace", competitors: [], featureWishlist: [] },
      runDir: "/tmp/none",
      angles: ["market"],
      query: "",
      webEngine: "auto",
      semantic: false,
      perSource: 6,
      refresh: false,
      marketUrls: ["https://pinned.example.com/features"],
    } as never;
    const [r] = await marketAngle(ctx);
    expect(r!.items.length).toBeGreaterThan(0);
    expect(r!.items[0]!.ref).toContain("pinned.example.com");
    expect(r!.notes.join(" ")).toMatch(/pinned/i);
  });

  it("keeps every pinned page and fills the remaining budget with discovered ones", async () => {
    const ddg = (urls: string[]) => urls.map((u) => `<a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(u)}&rut=x">t</a>`).join("\n");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes("8888")) return res("", { ok: false, status: 0 });
        if (u.includes("duckduckgo")) return res(ddg(["https://found-1.com", "https://found-2.com", "https://found-3.com"]));
        return res(`<p>marketplace content at ${u}</p>`);
      }),
    );
    const ctx = {
      brief: { idea: "a creator marketplace", competitors: [], featureWishlist: [] },
      runDir: "/tmp/none",
      angles: ["market"],
      query: "marketplace",
      webEngine: "auto",
      semantic: false,
      perSource: 3,
      refresh: false,
      marketUrls: ["https://pin-1.com", "https://pin-2.com"],
    } as never;
    const [r] = await marketAngle(ctx);
    const refs = r!.items.map((i) => i.ref).join(" ");
    expect(refs).toContain("pin-1.com");
    expect(refs).toContain("pin-2.com");
    expect(r!.items.length).toBeLessThanOrEqual(3); // stays within the per-source budget
  });
});

describe("feature-targeted excerpting (multi-question)", () => {
  const page = [
    "<html><body>",
    "<p>Acme is a creator marketplace for brands.</p>",
    "<p>Filler line.</p>",
    "<p>Filler two.</p>",
    "<p>Filler three.</p>",
    "<p>Filler four.</p>",
    "<p>Filler five.</p>",
    "<p>Filler six.</p>",
    "<p>Filler seven.</p>",
    "<p>Filler eight.</p>",
    "<p>Filler nine.</p>",
    "<p>Filler ten.</p>",
    "<p>Filler eleven.</p>",
    "<p>Filler twelve.</p>",
    "<p>Filler thirteen.</p>",
    "<p>Filler fourteen.</p>",
    "<p>Escrow payment is released to the creator once the brand approves the delivered content submission.</p>",
    "</body></html>",
  ].join("\n");

  it("webFetchUrls accepts multiple questions and windows excerpts around the best-covered one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res(page)),
    );
    const { items } = await webFetchUrls(
      ["https://acme.example.com/how-it-works"],
      ["creator marketplace brands", "Pay creators through escrow released on approval of the delivered content submission"],
      6,
      "market",
      true,
    );
    expect(items.map((i) => i.snippet).join(" ")).toMatch(/escrow payment is released/i);
  });

  it("marketAngle excerpts pinned pages against the brief's feature texts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("acme.example.com")) return res(page);
        return res("", { ok: false, status: 404 });
      }),
    );
    const ctx = {
      brief: {
        idea: "a creator marketplace",
        competitors: [],
        featureWishlist: [{ title: "Pay creators through escrow", notes: "released on approval of the delivered content submission" }],
      },
      runDir: "/tmp/none",
      angles: ["market"],
      query: "",
      webEngine: "auto",
      semantic: false,
      perSource: 6,
      refresh: false,
      marketUrls: ["https://acme.example.com/how-it-works"],
    } as never;
    const [r] = await marketAngle(ctx);
    expect(r!.items.map((i) => i.snippet).join(" ")).toMatch(/escrow payment is released/i);
  });
});
