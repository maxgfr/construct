import { describe, it, expect, vi, afterEach } from "vitest";
import { excerptsFromText, fetchAndExtract, htmlToText, httpGet, httpJson } from "../src/research/fetch.js";

function res(body: string, opts: { ok?: boolean; status?: number; contentType?: string; retryAfter?: string } = {}) {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: {
      get: (h: string) => {
        if (h.toLowerCase() === "content-type") return opts.contentType ?? "text/html";
        if (h.toLowerCase() === "retry-after") return opts.retryAfter ?? null;
        return null;
      },
    },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    text: async () => body,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("httpGet retry policy", () => {
  // Injected sleep: records the requested delays, never actually waits.
  function recorder() {
    const delays: number[] = [];
    return { delays, sleep: async (ms: number) => void delays.push(ms) };
  }

  it("retries a 5xx once with backoff and recovers", async () => {
    const { delays, sleep } = recorder();
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (++calls === 1 ? res("", { ok: false, status: 503 }) : res("fine"))),
    );
    const r = await httpGet("https://flaky.example", { sleep });
    expect(calls).toBe(2);
    expect(r.ok).toBe(true);
    expect(delays.length).toBe(1);
    expect(delays[0]!).toBeGreaterThanOrEqual(300); // base backoff + jitter
  });

  it("honours a parseable Retry-After on 429", async () => {
    const { delays, sleep } = recorder();
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (++calls === 1 ? res("", { ok: false, status: 429, retryAfter: "1" }) : res("fine"))),
    );
    const r = await httpGet("https://limited.example", { sleep });
    expect(r.ok).toBe(true);
    expect(delays).toEqual([1000]);
  });

  it("never retries a deterministic 4xx", async () => {
    const { delays, sleep } = recorder();
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return res("", { ok: false, status: 404 });
      }),
    );
    const r = await httpGet("https://gone.example", { sleep });
    expect(calls).toBe(1);
    expect(r.status).toBe(404);
    expect(delays).toEqual([]);
  });

  it("recovers from a thrown network error", async () => {
    const { sleep } = recorder();
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (++calls === 1) throw new Error("ECONNRESET");
        return res("fine");
      }),
    );
    const r = await httpGet("https://reset.example", { sleep });
    expect(calls).toBe(2);
    expect(r.ok).toBe(true);
  });

  it("makes a single attempt with retries: 0", async () => {
    const { sleep } = recorder();
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return res("", { ok: false, status: 503 });
      }),
    );
    const r = await httpGet("https://down.example", { retries: 0, sleep });
    expect(calls).toBe(1);
    expect(r.ok).toBe(false);
  });
});

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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res("", { ok: false, status: 403 })),
    );
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
  it("replaces an out-of-range hex codepoint with a space instead of throwing", () => {
    // 0x110000 is past the Unicode max → String.fromCodePoint throws → " ".
    expect(htmlToText("<p>a&#x110000;b</p>")).toBe("a b");
  });
  it("replaces an out-of-range decimal codepoint with a space", () => {
    expect(htmlToText("<p>x&#999999999;y</p>")).toBe("x y");
  });
});

describe("httpJson", () => {
  it("parses a JSON response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res(JSON.stringify({ a: 1 }), { contentType: "application/json" })),
    );
    const r = await httpJson("GET", "http://local/x");
    expect(r.ok).toBe(true);
    expect(r.data).toEqual({ a: 1 });
  });

  it("falls back to the raw text when the body is not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res("not json", { contentType: "text/plain" })),
    );
    const r = await httpJson("GET", "http://local/x");
    expect(r.data).toBe("not json");
  });

  it("serialises the body as JSON for a POST and omits it for a bodyless GET", async () => {
    const bodies: (string | undefined)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: { body?: string }) => {
        bodies.push(init?.body);
        return res("{}");
      }),
    );
    await httpJson("POST", "http://local/x", { hello: "world" });
    await httpJson("GET", "http://local/x");
    expect(JSON.parse(bodies[0]!)).toEqual({ hello: "world" });
    expect(bodies[1]).toBeUndefined();
  });

  it("returns an error result (never throws) on a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const r = await httpJson("POST", "http://local/x", { q: 1 });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(0);
    expect(r.error).toMatch(/ECONNREFUSED/);
  });
});
