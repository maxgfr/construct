// Performance CONTRACT tests — the guard rail the pipeline never had.
//
// Every other test in this suite asserts correctness; none asserts cost. A
// change that doubles the number of HTTP round-trips, or that quietly
// serialises a loop that used to overlap, would have shipped green. These tests
// pin the two things that actually determine how long a research run takes:
//
//   1. how many requests a given amount of work costs, and
//   2. whether independent requests overlap.
//
// They are deliberately network-free: `probeFetch` stands in for the real
// transport and records when each call started and finished, so overlap is
// measured rather than guessed.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetMetrics, timeAngle, recordFetch, totals, type AngleTiming } from "../src/research/metrics.js";
import { makeProbe, maxOverlap } from "./helpers/concurrency.js";
import { pool } from "../src/research/pool.js";

beforeEach(() => resetMetrics());

describe("maxOverlap (the probe itself)", () => {
  it("reads a serial sequence as 1 and a concurrent batch as its width", async () => {
    const serial = makeProbe(10);
    for (const u of ["a", "b", "c"]) await serial.fn(u);
    expect(maxOverlap(serial.spans)).toBe(1);

    const parallel = makeProbe(10);
    await Promise.all(["a", "b", "c"].map(parallel.fn));
    expect(maxOverlap(parallel.spans)).toBe(3);
  });
});

describe("metrics attribution", () => {
  it("attributes each angle's requests to that angle even while angles overlap", async () => {
    const timings: AngleTiming[] = [];

    // Two angles running concurrently, interleaving their awaits — the case a
    // naive before/after snapshot gets wrong.
    await Promise.all([
      timeAngle("market", timings, async () => {
        recordFetch(100);
        await new Promise((r) => setTimeout(r, 15));
        recordFetch(200);
      }),
      timeAngle("tech", timings, async () => {
        await new Promise((r) => setTimeout(r, 5));
        recordFetch(50);
      }),
    ]);

    const market = timings.find((t) => t.angle === "market")!;
    const tech = timings.find((t) => t.angle === "tech")!;
    expect(market.requests).toBe(2);
    expect(market.bytes).toBe(300);
    expect(tech.requests).toBe(1);
    expect(tech.bytes).toBe(50);
  });

  it("records a timing for an angle that throws — a slow failure is worth seeing", async () => {
    const timings: AngleTiming[] = [];
    await expect(
      timeAngle("oss", timings, async () => {
        recordFetch(10);
        throw new Error("clone failed");
      }),
    ).rejects.toThrow("clone failed");
    expect(timings).toHaveLength(1);
    expect(timings[0]!.angle).toBe("oss");
    expect(timings[0]!.requests).toBe(1);
  });

  it("separates cache hits from network requests in the totals", () => {
    recordFetch(10);
    recordFetch(20, true);
    recordFetch(30, true);
    expect(totals()).toEqual({ requests: 1, cacheHits: 2, bytes: 60 });
  });

  it("counts requests made outside any angle toward the totals only", async () => {
    const timings: AngleTiming[] = [];
    recordFetch(5); // a drill, not inside an angle
    await timeAngle("market", timings, async () => recordFetch(7));
    expect(totals().requests).toBe(2);
    expect(timings[0]!.requests).toBe(1);
  });
});

// --- the transport budget ----------------------------------------------------

describe("request budget", () => {
  it("costs exactly one request per reachable URL", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        return new Response("<html><body>hello world</body></html>", { status: 200, headers: { "content-type": "text/html" } });
      }),
    );
    const { fetchAndExtract } = await import("../src/research/fetch.js");
    await fetchAndExtract("https://example.com/a");
    expect(calls).toHaveLength(1);
    expect(totals().requests).toBe(1);
    vi.unstubAllGlobals();
  });

  it("costs one extra request when a host blocks the bot UA — and no more", async () => {
    // fetchAndExtract retries once as a browser on 403/429. That fallback is
    // worth its cost, but it must stay ONE retry: a host that 403s everything
    // should not cost four round-trips per page.
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        n++;
        return new Response("nope", { status: 403 });
      }),
    );
    const { fetchAndExtract } = await import("../src/research/fetch.js");
    const r = await fetchAndExtract("https://example.com/blocked");
    expect(r.text).toBe("");
    expect(n).toBe(2);
    vi.unstubAllGlobals();
  });
});

// --- concurrency contracts ---------------------------------------------------
//
// These lock in the Lot-3 win. A future refactor that reintroduces a serial
// `for (const url of urls) await …` turns them red — which is the whole point,
// because nothing else in the suite would notice.

describe("pool", () => {
  it("runs up to `limit` items at once and no more", async () => {
    const probe = makeProbe(20);
    await pool(["a", "b", "c", "d", "e", "f"], 3, (x) => probe.fn(x));
    expect(maxOverlap(probe.spans)).toBe(3);
  });

  it("preserves input order regardless of completion order", async () => {
    // Evidence ranking and the id ledger both depend on a deterministic
    // sequence; a race-ordered dossier would make runs non-reproducible.
    const delays = [40, 5, 25, 1];
    const out = await pool(delays, 4, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return i;
    });
    expect(out).toEqual([0, 1, 2, 3]);
  });

  it("degrades to a serial loop at limit 1 — the StackOverflow contract", async () => {
    const probe = makeProbe(10);
    await pool(["a", "b", "c"], 1, (x) => probe.fn(x));
    expect(maxOverlap(probe.spans)).toBe(1);
  });

  it("propagates a rejection rather than silently dropping the item", async () => {
    await expect(
      pool([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });
});

describe("page fetching overlaps", () => {
  it("fetches a batch of URLs concurrently instead of one at a time", async () => {
    const spans: { label: string; start: number; end: number }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const start = performance.now();
        await new Promise((r) => setTimeout(r, 25));
        spans.push({ label: String(url), start, end: performance.now() });
        return new Response("<html><body><p>page body here</p></body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }),
    );
    const { webFetchUrls } = await import("../src/research/web.js");
    const urls = ["https://c1.example", "https://c2.example", "https://c3.example", "https://c4.example"];
    await webFetchUrls(urls, "page body", 6, "market", true, 4);

    expect(spans).toHaveLength(4);
    expect(maxOverlap(spans)).toBeGreaterThan(1);
    vi.unstubAllGlobals();
  });
});
