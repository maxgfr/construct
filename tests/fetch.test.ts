import { describe, it, expect, vi, afterEach } from "vitest";
import { excerptsFromText, fetchAndExtract, htmlToText } from "../src/research/fetch.js";

function res(body: string, opts: { ok?: boolean; status?: number; contentType?: string } = {}) {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? opts.contentType ?? "text/html" : null) },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    text: async () => body,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("excerptsFromText", () => {
  it("disambiguates a second excerpt of one page by its line range", () => {
    const lines = Array.from({ length: 40 }, (_, i) => `filler line ${i}`);
    lines[3] = "the search index lives here";
    lines[30] = "more search ranking details follow";
    const items = excerptsFromText(lines.join("\n"), "https://x/doc", "Web — https://x/doc", "market", "search", 4);
    expect(items.length).toBe(2);
    expect(items[0]!.title).toBe("Web — https://x/doc");
    expect(items[1]!.title).toMatch(/\(lines \d+–\d+\)/);
  });
});

describe("fetchAndExtract", () => {
  it("retries with a browser UA when the bot UA is blocked (403)", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: any) => {
        const ua = String(init?.headers?.["user-agent"] ?? "");
        calls.push(ua);
        if (ua.includes("construct/")) return res("", { ok: false, status: 403 });
        return res("<html><body><p>Real content after the browser retry.</p></body></html>");
      }),
    );
    const { text } = await fetchAndExtract("https://blocked.example");
    expect(calls.length).toBe(2);
    expect(calls[0]).toMatch(/construct\//);
    expect(calls[1]).toMatch(/Chrome/);
    expect(text).toMatch(/Real content/);
  });

  it("returns an honest note when both attempts fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res("", { ok: false, status: 403 })));
    const { text, note } = await fetchAndExtract("https://blocked.example");
    expect(text).toBe("");
    expect(note).toMatch(/Could not fetch/);
  });
});

describe("htmlToText", () => {
  it("strips tags and decodes entities", () => {
    expect(htmlToText("<p>a &amp; b</p>")).toBe("a & b");
  });
  it("decodes each entity exactly once (no double-decode of &amp;lt;)", () => {
    expect(htmlToText("&amp;lt;")).toBe("&lt;");
  });
  it("decodes hex and decimal numeric entities", () => {
    expect(htmlToText("&#x41;&#66;")).toBe("AB");
  });
  it("puts unclosed <li> items on their own lines", () => {
    expect(htmlToText("<ul><li>first<li>second<li>third</ul>").split("\n")).toEqual(["first", "second", "third"]);
  });
});
