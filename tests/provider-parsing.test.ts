import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// github.ts queries through research/fetch::httpGet (REST) and probes for `gh`
// via util::have. Force `have` false so the keyless REST path is always taken,
// and stub httpGet so the tests are deterministic and offline. rankedKeywords
// stays real so the precise→broad keyword logic is exercised for real.
vi.mock("../src/util.js", async (importActual) => {
  const real = await importActual<typeof import("../src/util.js")>();
  return { ...real, have: () => false };
});

const httpGet = vi.fn();
vi.mock("../src/research/fetch.js", () => ({ httpGet: (...a: unknown[]) => httpGet(...a) }));

// Import AFTER the mocks are registered.
import { toItems, github } from "../src/providers/github.js";
import { gitlab } from "../src/providers/gitlab.js";
import type { RepoRef } from "../src/types.js";

const ref = (over: Partial<RepoRef> = {}): RepoRef => ({
  raw: "o/r",
  host: "github.com",
  owner: "o",
  repo: "r",
  webUrl: "https://github.com/o/r",
  cloneUrl: "https://github.com/o/r.git",
  isLocal: false,
  slug: "github.com-o-r",
  ...over,
});

const json = (body: unknown) => ({ ok: true, status: 200, body: JSON.stringify(body), contentType: "application/json" });
// Decode the `q=` search term back to the raw query string (safe on non-URLs).
const qOf = (url: unknown): string => {
  if (typeof url !== "string") return "";
  try {
    return decodeURIComponent(new URL(url).searchParams.get("q") ?? "");
  } catch {
    return "";
  }
};
// The decoded `q` of every issue/PR *search* call (skips the /repos/ lookup).
const searchQueries = () => httpGet.mock.calls.map(([u]) => qOf(u)).filter((q) => q.includes("type:"));
const termCountOf = (q: string) => (q.split(/type:\w+\s+/)[1] ?? "").split(/\s+/).filter(Boolean).length;

beforeEach(() => httpGet.mockReset());
afterEach(() => vi.clearAllMocks());

describe("github toItems parsing", () => {
  it("accepts labels as strings or objects, and honours the draft flag", () => {
    const out = toItems(
      [
        {
          number: 1,
          title: "A",
          state: "open",
          labels: ["bug", { name: "p1" }, { name: null }, "ui"],
          comments: 3,
          updated_at: "2024-01-01",
          html_url: "u1",
          body: "hello",
        },
        { number: 2, title: "B", state: "open", draft: true, pull_request: {}, labels: [], body: "world" },
      ],
      "pr",
    );
    // string + object labels both land; null-name object is dropped.
    expect(out[0]!.snippet).toContain("labels: bug, p1, ui");
    expect(out[0]!.title).toBe("#1 A [open]");
    expect(out[0]!.meta).toMatchObject({ number: 1, isPR: false });
    // draft:true overrides state in the title and is a PR (pull_request present).
    expect(out[1]!.title).toBe("#2 B [draft]");
    expect(out[1]!.meta).toMatchObject({ state: "draft", isPR: true });
  });

  it("fills sane defaults for missing fields without throwing", () => {
    const out = toItems([{ number: 7, title: "T", state: "closed" }], "issue");
    expect(out).toHaveLength(1);
    expect(out[0]!.ref).toBe("issue#7");
    expect(out[0]!.score).toBe(0);
    expect(out[0]!.snippet).toContain("comments: 0");
    expect(out[0]!.snippet).toContain("(no description)");
  });

  it("filters null/non-object array elements instead of throwing", () => {
    const out = toItems([null, undefined, 42, { number: 9, title: "ok", state: "open", body: "b" }] as unknown[] as any[], "issue");
    expect(out).toHaveLength(1);
    expect(out[0]!.ref).toBe("issue#9");
  });

  it("tolerates a null raw payload", () => {
    expect(toItems(null as unknown as any[], "issue")).toEqual([]);
  });
});

describe("github search query strategy", () => {
  it("falls back from a precise AND query to a broad single-term union", async () => {
    // Precise (multi-term AND) → empty; broad (single-term) → a hit. Re-ranking
    // then keeps the on-topic item.
    httpGet.mockImplementation(async (url: unknown) => {
      const u = typeof url === "string" ? url : "";
      if (u.includes("/repos/")) return json({ full_name: "o/r" });
      if (termCountOf(qOf(u)) >= 2) return json({ items: [] });
      return json({ items: [{ number: 5, title: "cookieless tracking", state: "open", body: "adds cookieless consent", html_url: "u5" }] });
    });
    const res = await github.search(ref({ owner: "o", repo: "fallback" }), "cookieless tracking consent banner", "issue", 5);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.ref).toBe("issue#5");
    // Both precise attempts (multi-term AND) AND at least one single-term query ran.
    const termCounts = searchQueries().map(termCountOf);
    expect(termCounts).toContain(1);
    expect(Math.max(...termCounts)).toBeGreaterThanOrEqual(2);
  });

  it("recovers from a rename by searching the canonical full_name (no 422)", async () => {
    // The repos API 301-follows the rename old/old → new/new. Searches against
    // the OLD name 422; against the canonical name they succeed.
    httpGet.mockImplementation(async (url: unknown) => {
      const u = typeof url === "string" ? url : "";
      if (u.includes("/repos/")) return json({ full_name: "newowner/newrepo" });
      if (qOf(u).includes("old/old")) return { ok: false, status: 422, body: "", contentType: "" };
      return json({ items: [{ number: 3, title: "renamed hit", state: "open", body: "x", html_url: "u3" }] });
    });
    const res = await github.search(ref({ owner: "old", repo: "old" }), "renamed feature flag", "issue", 5);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.ref).toBe("issue#3");
    // Every issued search used the canonical name, never the renamed-away one.
    const searches = searchQueries();
    expect(searches.length).toBeGreaterThan(0);
    expect(searches.every((q) => q.includes("newowner/newrepo"))).toBe(true);
    expect(searches.some((q) => q.includes("old/old"))).toBe(false);
  });
});

describe("gitlab field mapping", () => {
  it("maps iid/state/description and uses the ! marker for merge requests", async () => {
    httpGet.mockImplementation(async () =>
      json([
        {
          iid: 12,
          title: "MR title",
          state: "merged",
          description: "the body",
          web_url: "https://gitlab.com/g/p/-/merge_requests/12",
          updated_at: "2024-02-02",
        },
        { id: 99, title: "no-iid", state: "opened", description: null, web_url: "w" },
        null,
      ]),
    );
    const res = await gitlab.search(ref({ host: "gitlab.com", owner: "g", repo: "p" }), "deploy pipeline cache", "pr", 5);
    expect(res.items).toHaveLength(2); // null element filtered out
    expect(res.items[0]!.title).toBe("!12 MR title [merged]");
    expect(res.items[0]!.ref).toBe("pr#12");
    expect(res.items[0]!.snippet).toContain("the body");
    expect(res.items[0]!.meta).toMatchObject({ iid: 12, state: "merged" });
    // Falls back to id when iid is absent; no-description shows the placeholder.
    expect(res.items[1]!.ref).toBe("pr#99");
    expect(res.items[1]!.snippet).toContain("(no description)");
  });

  it("uses the # marker for issues", async () => {
    httpGet.mockImplementation(async () => json([{ iid: 4, title: "bug", state: "opened", description: "d", web_url: "w" }]));
    const res = await gitlab.search(ref({ host: "gitlab.com", owner: "g", repo: "p" }), "crash on startup", "issue", 5);
    expect(res.items[0]!.title).toBe("#4 bug [opened]");
    expect(res.items[0]!.ref).toBe("issue#4");
  });
});
