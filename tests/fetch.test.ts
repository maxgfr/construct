// Retrieval — this repo's WIRING of the engine's fetch stack, plus the one
// function that stayed here because it is about evidence rather than HTTP.
//
// The stack itself moved into the vendored webindex engine with v1.14.0. Its
// retry arithmetic, byte cap, charset decoding, entity table, extraction and
// cache are pinned in webindex's own suite, against the code that implements
// them; re-asserting them here would be testing vendored bytes twice.
//
// What is left is what the engine cannot know and this repo decided:
//   - it identifies itself honestly, and only wears a browser UA when refused;
//   - its page fetches go through the cache and strip consent banners;
//   - an excerpt is an EvidenceItem, with a low-signal flag and a line range.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cachedFetchAndExtract, excerptsFromText, fetchAndExtract, htmlToText, httpGet, httpJson, stripConsentBoilerplate } from "../src/research/fetch.js";

function res(body: string, opts: { ok?: boolean; status?: number; contentType?: string; retryAfter?: string; headers?: Record<string, string> } = {}) {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: {
      get: (h: string) => {
        const k = h.toLowerCase();
        if (k === "content-type") return opts.contentType ?? "text/html";
        if (k === "retry-after") return opts.retryAfter ?? null;
        return opts.headers?.[k] ?? null;
      },
    },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    text: async () => body,
  };
}

// Its own cache directory, and no backoff. Both matter: without the first these
// cases would read and write the developer's real ~/.cache/construct/http (and
// be served yesterday's page instead of the stub), and without the second every
// retry case would sleep for real.
let cacheDir: string;
let prev: Record<string, string | undefined>;

beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), "construct-fetch-"));
  prev = { dir: process.env.CONSTRUCT_CACHE_DIR, retry: process.env.CONSTRUCT_RETRY_MS, fc: process.env.CONSTRUCT_FIRECRAWL };
  process.env.CONSTRUCT_CACHE_DIR = cacheDir;
  process.env.CONSTRUCT_RETRY_MS = "0";
  // The extractor would otherwise probe localhost:3002 through the stubbed
  // fetch, which answers everything — so every page would route through a fake
  // Firecrawl and show up as an extra call in the counts below.
  process.env.CONSTRUCT_FIRECRAWL = "off";
});

afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(cacheDir, { recursive: true, force: true });
  for (const [k, v] of [
    ["CONSTRUCT_CACHE_DIR", prev.dir],
    ["CONSTRUCT_RETRY_MS", prev.retry],
    ["CONSTRUCT_FIRECRAWL", prev.fc],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// What research/web.ts asks for at its one call site, spelled the same way.
const fetchPage = (url: string) => cachedFetchAndExtract(url, { stripConsent: true }, true);

describe("retrying without hammering", () => {
  it("retries a transient failure and recovers", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (++calls === 1 ? res("", { ok: false, status: 503 }) : res("fine"))),
    );
    expect((await httpGet("https://flaky.example")).ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("never retries a deterministic 4xx", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return res("", { ok: false, status: 404 });
      }),
    );
    expect((await httpGet("https://gone.example")).status).toBe(404);
    expect(calls).toBe(1);
  });

  it("makes a single attempt with retries: 0", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return res("", { ok: false, status: 503 });
      }),
    );
    expect((await httpGet("https://down.example", { retries: 0 })).ok).toBe(false);
    expect(calls).toBe(1);
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

  it("marks the top-of-page fallback excerpt low-signal when nothing matches the question", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `unrelated filler line ${i}`);
    const items = excerptsFromText(lines.join("\n"), "https://x/doc", "Web — https://x/doc", "market", "quantum entanglement", 4);
    expect(items.length).toBe(1); // the score-0 top-of-page fallback
    expect(items[0]!.meta?.lowSignal).toBe(true);
  });

  it("does not mark a real keyword-matched excerpt low-signal", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `filler ${i}`);
    lines[5] = "the search index configuration matters";
    const items = excerptsFromText(lines.join("\n"), "https://x/doc", "Web — https://x/doc", "market", "search index", 4);
    expect(items[0]!.meta?.lowSignal).toBeUndefined();
  });

  it("matches through accents and subtokens, which a raw substring scan misses", () => {
    // Gained by moving the scan into the engine's matcher. This page answers the
    // question and the old lowercase `includes` scored it zero.
    const lines = Array.from({ length: 20 }, (_, i) => `filler ${i}`);
    lines[7] = "Le générateur de requêtes construit la clause WHERE";
    const items = excerptsFromText(lines.join("\n"), "https://x/doc", "Doc", "market", "generateur", 4);
    expect(items[0]!.meta?.lowSignal).toBeUndefined();
    expect(items[0]!.snippet).toContain("générateur");
  });
});

describe("identifying honestly", () => {
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
    const { text, note } = await fetchAndExtract("https://never-reachable.example");
    expect(text).toBe("");
    expect(note).toMatch(/Could not fetch/);
  });
});

describe("the page pipeline research/web.ts drives", () => {
  it("answers a repeat fetch from cache without touching the network", async () => {
    const net = vi.fn(async () => res("<html><body><p>Cached content.</p></body></html>"));
    vi.stubGlobal("fetch", net);
    await fetchPage("https://repeat.example");
    expect(net).toHaveBeenCalledTimes(1);

    // This is the whole point of the cache: the skill tells the agent to re-run
    // `research` on every fold-in, and a fresh entry makes that re-run free.
    const again = await fetchPage("https://repeat.example");
    expect(net).toHaveBeenCalledTimes(1);
    expect(again.text).toMatch(/Cached content/);
  });

  it("serves the cached copy, labelled, when the origin later fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res("<html><body><p>Original content.</p></body></html>")),
    );
    await fetchPage("https://flaky2.example");

    const ttl = process.env.CONSTRUCT_CACHE_TTL_HOURS;
    process.env.CONSTRUCT_CACHE_TTL_HOURS = "0";
    try {
      // The origin goes down. A hole in the dossier would be worse than a page
      // from last week — but the substitution has to be visible in the notes.
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => res("", { ok: false, status: 500 })),
      );
      const { text, note } = await fetchPage("https://flaky2.example");
      expect(text).toMatch(/Original content/);
      expect(note).toMatch(/served the cached copy/);
    } finally {
      if (ttl === undefined) delete process.env.CONSTRUCT_CACHE_TTL_HOURS;
      else process.env.CONSTRUCT_CACHE_TTL_HOURS = ttl;
    }
  });

  it("revalidates a stale entry and reuses the body on a 304", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res("<html><body><p>Unchanged page.</p></body></html>", { headers: { etag: 'W/"v1"' } })),
    );
    await fetchPage("https://etag.example");

    const ttl = process.env.CONSTRUCT_CACHE_TTL_HOURS;
    process.env.CONSTRUCT_CACHE_TTL_HOURS = "0";
    try {
      let sentIfNoneMatch: string | undefined;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_u: string, init: any) => {
          sentIfNoneMatch = init?.headers?.["if-none-match"];
          return res("", { ok: false, status: 304 });
        }),
      );
      const { text } = await fetchPage("https://etag.example");
      expect(sentIfNoneMatch).toBe('W/"v1"');
      expect(text).toMatch(/Unchanged page/); // body reused, not re-downloaded
    } finally {
      if (ttl === undefined) delete process.env.CONSTRUCT_CACHE_TTL_HOURS;
      else process.env.CONSTRUCT_CACHE_TTL_HOURS = ttl;
    }
  });

  it("strips a consent banner out of the page it grounds a requirement in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        res(
          "<html><body><article><p>We use cookies and similar tracking technologies.</p><p>Accept all cookies</p>" +
            "<p>Full-text search indexing works by inverting the document set.</p></article></body></html>",
        ),
      ),
    );
    const { text } = await fetchPage("https://consent.example");
    expect(text).toMatch(/Full-text search indexing/);
    expect(text).not.toMatch(/Accept all cookies/);
  });
});

describe("the shim resolves to the engine", () => {
  it("re-exports the HTML reader, entity decoding included", () => {
    expect(htmlToText("<p>a &amp; b</p>")).toBe("a & b");
    // Decoded exactly once: `&amp;lt;` is the literal text "&lt;", not "<".
    expect(htmlToText("<p>&amp;lt;</p>")).toBe("&lt;");
    expect(htmlToText("<ul><li>one<li>two</ul>").split("\n")).toEqual(["one", "two"]);
  });

  it("re-exports the consent stripper, which leaves ordinary prose alone", () => {
    const banner = "We use cookies and similar tracking technologies. Accept all cookies or manage preferences.";
    const prose = "PostgreSQL uses MVCC for concurrency control.";
    expect(stripConsentBoilerplate(`${banner}\n${prose}`)).toEqual({ text: prose, dropped: 1 });
    expect(stripConsentBoilerplate(prose)).toEqual({ text: prose, dropped: 0 });
  });

  it("re-exports the JSON client, which never throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    expect(await httpJson("POST", "http://local/x", { q: 1 })).toMatchObject({ ok: false, status: 0, error: /ECONNREFUSED/ as unknown as string });
  });
});

describe("PDF fetching", () => {
  // Before the ladder there was no PDF branch at all: extraction fell through
  // its isHtml test and returned the body verbatim — the PDF's bytes decoded as
  // UTF-8 — which was then cached and quoted into requirements as if it were prose.
  it("extracts a PDF instead of passing its bytes along as text", async () => {
    const prose = "A clean sentence of extracted prose, long enough for the quality gate to judge it fairly. ".repeat(3);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res(`%PDF-1.4\nstream\nBT (${prose}) Tj ET\nendstream\n`, { contentType: "application/pdf" })),
    );
    const r = await fetchAndExtract("https://pdf1.example/paper.pdf");
    expect(r.text).toContain("A clean sentence of extracted prose");
    expect(r.text).not.toContain("%PDF");
  });

  it("refuses a PDF no rung could read rather than emitting binary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => res("%PDF-1.4 no text operators here", { contentType: "application/pdf" })),
    );
    const r = await fetchAndExtract("https://pdf2.example/scan.pdf");
    expect(r.text).toBe("");
    expect(r.note).toMatch(/could not extract text/i);
  });
});
