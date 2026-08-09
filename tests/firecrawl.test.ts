// The optional Firecrawl extraction layer.
//
// Everything here is about the ONE rule that makes an optional layer safe: it
// must be invisible when it is not running. A stack nobody started, an instance
// that 500s, a page it cannot render — all of them must land on the built-in
// extractor with a note, never on an exception and never on an empty page.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  configureFirecrawl,
  firecrawlBase,
  mapScrapeResponse,
  probeFirecrawl,
  resetFirecrawlProbe,
  scrapeViaFirecrawl,
  searchViaFirecrawl,
} from "../src/research/firecrawl.js";
import { cachedFetchAndExtract, fetchAndExtract, stripConsentBoilerplate } from "../src/research/fetch.js";
import { discover, resetDiscoveryProbes } from "../src/research/web.js";
import * as cache from "../src/research/cache.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const SCRAPE_FIXTURE = JSON.parse(readFileSync(join(FIXTURES, "firecrawl-scrape.json"), "utf8"));

function res(body: string, opts: { ok?: boolean; status?: number; contentType?: string } = {}) {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? (opts.contentType ?? "application/json") : null) },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    text: async () => body,
  };
}

const json = (data: unknown, opts: { ok?: boolean; status?: number } = {}) => res(JSON.stringify(data), { contentType: "application/json", ...opts });

// What research/web.ts asks for at its one call site, spelled the same way.
const fetchPage = (url: string) => cachedFetchAndExtract(url, { stripConsent: true }, true);

// A local instance that is not running: the connection is refused, which the
// fetch layer reports as status 0.
const refused = async () => {
  throw new Error("connect ECONNREFUSED 127.0.0.1:3002");
};

let cacheDir: string;

beforeEach(() => {
  // Every case starts with no memoized verdict and its own page cache, so one
  // case's cached body can never answer another's fetch.
  resetFirecrawlProbe();
  resetDiscoveryProbes();
  configureFirecrawl({ base: undefined });
  cacheDir = mkdtempSync(join(tmpdir(), "construct-firecrawl-cache-"));
  process.env.CONSTRUCT_CACHE_DIR = cacheDir;
  process.env.CONSTRUCT_FIRECRAWL = "http://localhost:3002";
  cache.configureCache({ refresh: false, offline: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(cacheDir, { recursive: true, force: true });
  // tests/setup.ts turns the layer OFF for the rest of the suite.
  process.env.CONSTRUCT_FIRECRAWL = "off";
  delete process.env.CONSTRUCT_FIRECRAWL_KEY;
  resetFirecrawlProbe();
  configureFirecrawl({ base: undefined });
});

describe("mapScrapeResponse (pure)", () => {
  it("maps a real /scrape response to markdown + metadata", () => {
    const r = mapScrapeResponse(SCRAPE_FIXTURE);
    expect(r?.markdown).toMatch(/# Upgrade to Express v5/);
    expect(r?.title).toBe("Upgrade to Express v5");
    expect(r?.sourceURL).toBe("https://expressjs.com/en/guide/migrating-5.html");
    expect(r?.statusCode).toBe(200);
  });

  it("falls back to metadata.url when sourceURL is absent", () => {
    const r = mapScrapeResponse({ success: true, data: { markdown: "# x", metadata: { url: "https://u.example" } } });
    expect(r?.sourceURL).toBe("https://u.example");
  });

  it("returns null on an explicit failure", () => {
    expect(mapScrapeResponse({ success: false, error: "no browser available" })).toBeNull();
  });

  it("returns null when the payload carries no data", () => {
    expect(mapScrapeResponse({ success: true })).toBeNull();
    expect(mapScrapeResponse(null)).toBeNull();
    expect(mapScrapeResponse("not json")).toBeNull();
  });

  // "Firecrawl answered, but with nothing" has to degrade like "Firecrawl is
  // down" — an empty string here would blank the page in the dossier.
  it("returns null for empty or whitespace-only markdown", () => {
    expect(mapScrapeResponse({ success: true, data: { markdown: "" } })).toBeNull();
    expect(mapScrapeResponse({ success: true, data: { markdown: "   \n  " } })).toBeNull();
  });

  it("keeps the markdown when the metadata block is missing entirely", () => {
    const r = mapScrapeResponse({ success: true, data: { markdown: "# only content" } });
    expect(r).toEqual({ markdown: "# only content" });
  });
});

describe("firecrawlBase", () => {
  it("prefers the explicit override over the environment", () => {
    configureFirecrawl({ base: "http://elsewhere:9999/" });
    expect(firecrawlBase()).toBe("http://elsewhere:9999");
  });

  it("treats the literal `off` as disabled, in either place", () => {
    process.env.CONSTRUCT_FIRECRAWL = "off";
    expect(firecrawlBase()).toBeNull();
    process.env.CONSTRUCT_FIRECRAWL = "http://localhost:3002";
    configureFirecrawl({ base: "off" });
    expect(firecrawlBase()).toBeNull();
  });
});

describe("probeFirecrawl", () => {
  it("treats any HTTP answer as up, and probes only once per process", async () => {
    const net = vi.fn(async () => json({ message: "Firecrawl API" }));
    vi.stubGlobal("fetch", net);
    expect(await probeFirecrawl(firecrawlBase()!)).toBe(true);
    expect(await probeFirecrawl(firecrawlBase()!)).toBe(true);
    expect(net).toHaveBeenCalledTimes(1);
  });

  // Even a 500 proves something is listening; only a refused connection means
  // "not running", which is the case we must not pay for repeatedly.
  it("counts an error response as up but a refused connection as down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({}, { ok: false, status: 500 })),
    );
    expect(await probeFirecrawl(firecrawlBase()!)).toBe(true);
    resetFirecrawlProbe();
    const net = vi.fn(refused);
    vi.stubGlobal("fetch", net);
    expect(await probeFirecrawl(firecrawlBase()!)).toBe(false);
    expect(await probeFirecrawl(firecrawlBase()!)).toBe(false);
    expect(net).toHaveBeenCalledTimes(1);
  });

  it("never probes at all when the layer is disabled", async () => {
    process.env.CONSTRUCT_FIRECRAWL = "off";
    const net = vi.fn(async () => json({}));
    vi.stubGlobal("fetch", net);
    // `off` resolves to no base at all, which is what short-circuits every
    // caller before a probe is even considered — the reason a machine without
    // the stack pays nothing for it.
    expect(firecrawlBase()).toBeNull();
    expect((await scrapeViaFirecrawl("https://x.example")).data).toBeUndefined();
    expect(net).not.toHaveBeenCalled();
  });
});

describe("scrapeViaFirecrawl", () => {
  it("posts a main-content markdown request and maps the answer", async () => {
    const calls: { url: string; body: any; headers: any }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: any) => {
        calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : undefined, headers: init?.headers });
        if (String(url).endsWith("/scrape")) return json(SCRAPE_FIXTURE);
        return json({ message: "Firecrawl API" });
      }),
    );
    const r = await scrapeViaFirecrawl("https://expressjs.com/en/guide/migrating-5.html");
    expect(r.data?.markdown).toMatch(/Express 5 requires Node/);
    const scrape = calls.find((c) => c.url.endsWith("/scrape"))!;
    expect(scrape.url).toBe("http://localhost:3002/v2/scrape");
    expect(scrape.body).toMatchObject({ formats: ["markdown"], onlyMainContent: true, blockAds: true, removeBase64Images: true });
    expect(scrape.body.maxAge).toBeGreaterThan(0); // lets Firecrawl answer from its own cache
    // Self-hosted Firecrawl is keyless: no Authorization header unless asked.
    expect(scrape.headers.authorization).toBeUndefined();
  });

  it("sends a bearer token when one is configured (Firecrawl Cloud)", async () => {
    process.env.CONSTRUCT_FIRECRAWL_KEY = "fc-secret";
    let auth: string | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: any) => {
        if (String(url).endsWith("/scrape")) auth = init?.headers?.authorization;
        return json(String(url).endsWith("/scrape") ? SCRAPE_FIXTURE : { message: "Firecrawl API" });
      }),
    );
    await scrapeViaFirecrawl("https://x.example");
    expect(auth).toBe("Bearer fc-secret");
  });

  it("falls back to /v1 when the instance does not serve /v2, then remembers it", async () => {
    const paths: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (!u.includes("/scrape")) return json({ message: "Firecrawl API" });
        paths.push(new URL(u).pathname);
        if (u.includes("/v2/")) return json({ error: "not found" }, { ok: false, status: 404 });
        return json(SCRAPE_FIXTURE);
      }),
    );
    expect((await scrapeViaFirecrawl("https://a.example")).data?.markdown).toBeTruthy();
    expect((await scrapeViaFirecrawl("https://b.example")).data?.markdown).toBeTruthy();
    // v2 probed once, then never again — not once per page.
    expect(paths).toEqual(["/v2/scrape", "/v1/scrape", "/v1/scrape"]);
  });

  it("returns null (never throws) when the instance is not running", async () => {
    vi.stubGlobal("fetch", vi.fn(refused));
    expect((await scrapeViaFirecrawl("https://x.example")).data).toBeUndefined();
  });
});

describe("searchViaFirecrawl", () => {
  it("reads the web results out of a /search answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/search"))
          return json({ success: true, data: { web: [{ url: "https://one.example", title: "One" }, { url: "https://two.example" }] } });
        return json({ message: "Firecrawl API" });
      }),
    );
    const r = await searchViaFirecrawl("read later app", 5);
    expect(r.hits?.map((h) => h.url)).toEqual(["https://one.example", "https://two.example"]);
  });

  // The three-way contract discover() relies on: [] is "reachable, nothing
  // found"; null is "no usable instance". Collapsing them would make a working
  // but empty search look like a broken stack.
  it("distinguishes an empty result from an unusable instance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (String(url).endsWith("/search") ? json({ success: true, data: { web: [] } }) : json({ message: "ok" }))),
    );
    // Reachable but empty: hits is a list, and it is empty.
    expect(await searchViaFirecrawl("q", 5)).toEqual({ hits: [] });
    resetFirecrawlProbe();
    vi.stubGlobal("fetch", vi.fn(refused));
    // Unusable: no hits at all, and a reason the caller can show.
    const down = await searchViaFirecrawl("q", 5);
    expect(down.hits).toBeUndefined();
    expect(down.why).toBeTruthy();
  });
});

describe("discover --web-engine firecrawl", () => {
  it("returns Firecrawl's results when it is pinned explicitly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/search")) return json({ success: true, data: { web: [{ url: "https://found.example" }] } });
        return json({ message: "Firecrawl API" });
      }),
    );
    const d = await discover("read later app", "firecrawl", 5);
    expect(d.via).toBe("firecrawl");
    expect(d.urls).toEqual(["https://found.example"]);
  });

  it("names the stack and the command that starts it when it is down", async () => {
    vi.stubGlobal("fetch", vi.fn(refused));
    const d = await discover("q", "firecrawl", 5);
    expect(d.urls).toEqual([]);
    expect(d.notes.join(" ")).toMatch(/Firecrawl unreachable at http:\/\/localhost:3002.*construct firecrawl up/);
  });

  // "unreachable at (nothing)" would send the user debugging a container that
  // was never meant to run — the operator turned the layer off themselves.
  it("says it is disabled, not unreachable, when the layer was turned off", async () => {
    process.env.CONSTRUCT_FIRECRAWL = "off";
    const net = vi.fn(async () => json({}));
    vi.stubGlobal("fetch", net);
    const d = await discover("q", "firecrawl", 5);
    expect(d.notes.join(" ")).toMatch(/Firecrawl is disabled/);
    expect(net).not.toHaveBeenCalled();
  });

  // The heavy `extract` profile must never be a hidden cost of the default path.
  it("is never probed under the `auto` policy", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        seen.push(String(url));
        return res("", { ok: false, status: 404 });
      }),
    );
    await discover("q", "auto", 5);
    expect(seen.some((u) => u.includes("3002"))).toBe(false);
  });
});

describe("fetchAndExtract — the extraction seam", () => {
  const page = "<html><head><meta name=description content='desc'></head><body><nav>Home</nav><p>Native extraction of the page body.</p></body></html>";

  it("returns Firecrawl's markdown and never fetches the page itself", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        seen.push(u);
        if (u.endsWith("/scrape")) return json(SCRAPE_FIXTURE);
        if (u.includes("3002")) return json({ message: "Firecrawl API" });
        return res(page, { contentType: "text/html" });
      }),
    );
    const { text, note } = await fetchAndExtract("https://expressjs.com/en/guide/migrating-5.html");
    expect(text).toMatch(/# Upgrade to Express v5/);
    expect(note).toBeUndefined();
    // Firecrawl does its own fetching — double-fetching every page would be
    // pure waste, so the origin must never be hit on this path.
    expect(seen.some((u) => u.includes("expressjs.com"))).toBe(false);
  });

  it("uses the built-in extractor, silently, when the stack was never started", async () => {
    // No CONSTRUCT_FIRECRAWL: the base is the localhost DEFAULT, i.e. nobody
    // asked for it. A stack the user never started is not an event worth a note
    // on every page of every run.
    delete process.env.CONSTRUCT_FIRECRAWL;
    resetFirecrawlProbe();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("3002")) return refused();
        return res(page, { contentType: "text/html" });
      }),
    );
    const { text, note } = await fetchAndExtract("https://down.example/page");
    expect(text).toMatch(/Native extraction of the page body/);
    expect(note).toBeUndefined();
  });

  it("does say so when the user PINNED an instance and did not get it", async () => {
    // The distinction the engine added, and the reason the case above had to
    // stop pinning the env var to make its point: asking for a specific
    // instance and silently not getting it is how a run produces worse text
    // than the operator thinks they configured.
    process.env.CONSTRUCT_FIRECRAWL = "http://pinned.example:3002";
    resetFirecrawlProbe();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (String(url).includes("pinned.example") ? refused() : res(page, { contentType: "text/html" }))),
    );
    const { text, note } = await fetchAndExtract("https://down.example/page");
    expect(text).toMatch(/Native extraction of the page body/);
    expect(note).toMatch(/not reachable at http:\/\/pinned\.example:3002/);
  });

  it("falls back to the built-in extractor WITH a note when a page cannot be scraped", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.endsWith("/scrape")) return json({ success: false, error: "no content" });
        if (u.includes("3002")) return json({ message: "Firecrawl API" });
        return res(page, { contentType: "text/html" });
      }),
    );
    const { text, note } = await fetchAndExtract("https://hard.example/page");
    expect(text).toMatch(/Native extraction of the page body/);
    expect(note).toMatch(/Firecrawl returned no markdown for https:\/\/hard\.example\/page/);
  });

  // Firecrawl will happily hand back the markdown of a "Page not found" body.
  // The built-in path calls an error status "no page", and grounding a
  // requirement in a 404 body is worse than an honest hole.
  it("refuses an error-status page and lets the built-in path report the status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.endsWith("/scrape")) return json({ success: true, data: { markdown: "# Page not found\n\nTry the search box.", metadata: { statusCode: 404 } } });
        if (u.includes("3002")) return json({ message: "Firecrawl API" });
        return res("", { ok: false, status: 404, contentType: "text/html" });
      }),
    );
    const { text, note } = await fetchAndExtract("https://gone.example/page");
    expect(text).toBe("");
    expect(text).not.toMatch(/Page not found/);
    expect(note).toMatch(/Could not fetch https:\/\/gone\.example\/page \(status 404\)/);
  });

  // The consent stripper drops any line under 120 chars that mentions cookies.
  // That is calibrated for banner chrome the regex stripper leaves behind — run
  // it on main-content markdown and it eats a page ABOUT cookies.
  it("never runs the consent stripper on Firecrawl markdown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.endsWith("/scrape")) return json(SCRAPE_FIXTURE);
        return json({ message: "Firecrawl API" });
      }),
    );
    const { text } = await fetchAndExtract("https://cookies.example/guide");
    expect(text).toMatch(/Set the cookies option to opt into signed cookies/);
    expect(text).toMatch(/## Cookies/);
    // Proof the guard is what saved it: the same text through the HTML path loses both lines.
    const { text: stripped } = stripConsentBoilerplate(text);
    expect(stripped).not.toMatch(/Set the cookies option/);
    expect(stripped).not.toMatch(/## Cookies/);
  });

  it("reports which extractor produced the text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (String(url).endsWith("/scrape") ? json(SCRAPE_FIXTURE) : json({ message: "ok" }))),
    );
    // Not decoration: the extractor id is part of the cache key, which is what
    // stops a body one reader produced being served to a run configured for the
    // other. The key layout itself is the engine's and is tested there.
    expect((await fetchPage("https://cached.example/page")).extractor).toBe("firecrawl");
  });

  it("answers a repeat fetch from the cache without re-scraping", async () => {
    const net = vi.fn(async (url: string) => (String(url).endsWith("/scrape") ? json(SCRAPE_FIXTURE) : json({ message: "ok" })));
    vi.stubGlobal("fetch", net);
    await fetchPage("https://repeat.example/page");
    const after = net.mock.calls.length;
    const again = await fetchPage("https://repeat.example/page");
    expect(net.mock.calls.length).toBe(after);
    expect(again.text).toMatch(/Upgrade to Express v5/);
  });
});

describe("the page cache keys on extractor identity", () => {
  const url = "https://mismatch.example/page";
  const page = "<html><body><p>Native extraction of the page body.</p></body></html>";
  const withStack = () =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string) => (String(u).endsWith("/scrape") ? json(SCRAPE_FIXTURE) : json({ message: "ok" }))),
    );
  const withoutStack = () =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string) => (String(u).includes("3002") ? refused() : res(page, { contentType: "text/html" }))),
    );

  // Driven end to end rather than by writing entries by hand: the storage layout
  // is the engine's now, and a test that pokes it would be asserting against
  // vendored internals instead of against what a user experiences.

  // Without this, a native body written while the stack was down would shadow
  // Firecrawl for the whole TTL — a week, by default. The user starts the stack,
  // re-runs, and gets exactly the text they were trying to improve on.
  it("re-fetches through Firecrawl instead of serving a fresh native entry", async () => {
    withoutStack();
    expect((await fetchPage(url)).text).toMatch(/Native extraction of the page body/);

    resetFirecrawlProbe();
    withStack();
    expect((await fetchPage(url)).text).toMatch(/# Upgrade to Express v5/);
  });

  it("re-fetches natively instead of serving a fresh Firecrawl entry", async () => {
    withStack();
    expect((await fetchPage(url)).text).toMatch(/Upgrade to Express v5/);

    resetFirecrawlProbe();
    withoutStack();
    const { text } = await fetchPage(url);
    expect(text).toMatch(/Native extraction of the page body/);
    expect(text).not.toMatch(/Upgrade to Express v5/);
  });

  it("serves whatever it has under --offline, whichever extractor wrote it", async () => {
    withStack();
    await fetchPage(url);

    cache.configureCache({ offline: true });
    const net = vi.fn(async () => json({}));
    vi.stubGlobal("fetch", net);
    try {
      // A miss would be a hole in the dossier, and offline cannot probe to find
      // out which namespace to look in — so it looks in all of them.
      expect((await fetchPage(url)).text).toMatch(/Upgrade to Express v5/);
      expect(net).not.toHaveBeenCalled();
    } finally {
      cache.configureCache({ offline: false });
    }
  });
});
