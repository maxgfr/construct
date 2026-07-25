import type { RepoRef } from "../types.js";
import { shAsync, have, rankedKeywords } from "../util.js";
import { httpGet } from "../research/fetch.js";
import type { Provider, RawItem, IssueKind } from "./registry.js";

// Map the GitHub search/issues payload into RawItems. Exported for testing the
// parsing edge cases (labels as strings vs objects, the draft flag, missing
// fields). Null/non-object array elements are filtered first so one bad element
// can't throw and kill the whole angle (mirrors loadEvidence's guard).
export function toItems(raw: any[], kind: IssueKind): RawItem[] {
  return (raw ?? [])
    .filter((it) => it && typeof it === "object")
    .map((it) => {
      const body = String(it.body ?? "")
        .replace(/\r/g, "")
        .trim()
        .slice(0, 1200);
      const labels = (it.labels ?? [])
        .map((l: any) => (typeof l === "string" ? l : l.name))
        .filter(Boolean)
        .join(", ");
      const state = it.draft ? "draft" : it.state;
      return {
        source: kind,
        title: `#${it.number} ${it.title} [${state}]`,
        ref: `${kind}#${it.number}`,
        location: it.html_url,
        score: Number(it.score ?? 0),
        snippet:
          `state: ${state}` +
          (labels ? ` · labels: ${labels}` : "") +
          ` · comments: ${it.comments ?? 0} · updated: ${it.updated_at ?? "?"}\n\n` +
          (body || "(no description)"),
        url: it.html_url,
        meta: { number: it.number, state, isPR: !!it.pull_request },
      };
    });
}

// Resolve owner/repo to its CANONICAL full_name once (cached). A renamed/moved
// repo (e.g. calcom/cal.com → calcom/cal.diy) otherwise makes every search 422;
// the repos API 301-follows the rename and returns the real full_name.
// The REST API base for a host: api.github.com for github.com, /api/v3 for
// GitHub Enterprise. Keeps Enterprise issue/PR queries on the right host.
function apiBase(host: string): string {
  return /(^|\.)github\.com$/i.test(host) ? "https://api.github.com" : `https://${host}/api/v3`;
}
// The `gh` CLI only targets the host it's authenticated to (github.com here), so
// only use it for github.com and fall back to host-correct REST elsewhere.
function ghUsable(host: string): boolean {
  return have("gh") && /(^|\.)github\.com$/i.test(host);
}

const canonCache = new Map<string, { owner: string; repo: string }>();
async function canonicalRepo(ref: RepoRef): Promise<{ owner: string; repo: string }> {
  const fallback = { owner: ref.owner!, repo: ref.repo! };
  if (!/github/i.test(ref.host)) return fallback;
  const key = `${ref.host}/${ref.owner}/${ref.repo}`;
  const cached = canonCache.get(key);
  if (cached) return cached;
  let resolved = fallback;
  const parse = (full: string) => {
    const i = full.indexOf("/");
    return i > 0 ? { owner: full.slice(0, i), repo: full.slice(i + 1) } : fallback;
  };
  if (ghUsable(ref.host)) {
    const r = await shAsync("gh", ["api", `repos/${ref.owner}/${ref.repo}`, "--jq", ".full_name"]);
    if (r.ok && r.stdout.includes("/")) resolved = parse(r.stdout.trim());
  } else {
    const r = await httpGet(`${apiBase(ref.host)}/repos/${ref.owner}/${ref.repo}`, { accept: "application/vnd.github+json" });
    if (r.ok) {
      try {
        const full = JSON.parse(r.body)?.full_name;
        if (typeof full === "string" && full.includes("/")) resolved = parse(full);
      } catch {
        /* keep fallback */
      }
    }
  }
  canonCache.set(key, resolved);
  return resolved;
}

// Run a single GitHub search/issues query for the given terms. Prefers the `gh`
// CLI (keyless, authenticated, higher rate limit); falls back to public REST.
async function query(ref: RepoRef, terms: string[], kind: IssueKind, perSource: number): Promise<{ items: RawItem[]; error?: string }> {
  const q = `repo:${ref.owner}/${ref.repo} type:${kind} ${terms.join(" ")}`.trim();

  if (ghUsable(ref.host)) {
    const res = await shAsync("gh", [
      "api",
      "-X",
      "GET",
      "search/issues",
      "-f",
      `q=${q}`,
      "-f",
      `per_page=${perSource}`,
      "-f",
      "sort=updated",
      "-f",
      "order=desc",
    ]);
    if (res.ok) {
      try {
        return { items: toItems(JSON.parse(res.stdout).items, kind) };
      } catch {
        /* fall through to REST */
      }
    }
  }

  const url = `${apiBase(ref.host)}/search/issues?q=${encodeURIComponent(q)}` + `&per_page=${perSource}&sort=updated&order=desc`;
  const r = await httpGet(url, { accept: "application/vnd.github+json" });
  if (!r.ok) {
    const hint =
      r.status === 422
        ? `query rejected (422) for repo:${ref.owner}/${ref.repo} — the repo may be moved/renamed/private, or the query had no valid terms`
        : `status ${r.status}; run \`gh auth login\` for higher-rate access`;
    return { items: [], error: `GitHub ${kind} search unavailable (${hint}).` };
  }
  try {
    return { items: toItems(JSON.parse(r.body).items, kind) };
  } catch {
    return { items: [], error: `GitHub ${kind} search returned an unparseable response.` };
  }
}

// GitHub provider. Covers github.com and GitHub Enterprise hosts. GitHub
// free-text issue/PR search ANDs its terms, so a many-keyword query
// over-constrains to zero. Strategy: try a precise AND of the most-specific
// keywords first; if that's empty, pool single-term results and re-rank by
// keyword coverage so on-topic items beat recency-sorted noise.
export const github: Provider = {
  name: "github",
  matches: (host) => /(^|\.)github\.com$/i.test(host) || /github/i.test(host),

  async search(ref0, question, kind, perSource) {
    if (!ref0.owner || !ref0.repo) {
      return { items: [], notes: ["No owner/repo resolved; cannot query GitHub issues/PRs."] };
    }
    // Search under the repo's canonical name so a rename doesn't 422 every query.
    const canon = await canonicalRepo(ref0);
    const ref: RepoRef = { ...ref0, owner: canon.owner, repo: canon.repo };
    const ranked = rankedKeywords(question);
    if (ranked.length === 0) return { items: [], notes: [`No keywords to search ${kind}s.`] };
    let lastError: string | undefined;

    // 1) Precise: AND of the 3 then 2 most-specific keywords. Finds tightly
    //    on-topic items when they exist; rank by coverage and return.
    for (const terms of uniqueAttempts([ranked.slice(0, 3), ranked.slice(0, 2)])) {
      const { items, error } = await query(ref, terms, kind, perSource * 2);
      if (error) lastError = error;
      if (items.length) return { items: rerank(items, ranked).slice(0, perSource), notes: [] };
    }

    // 2) Broad: union of single-term queries over the top keywords, then re-rank
    //    by how many of the question's keywords each result actually mentions.
    //    Stops a single common term (e.g. "progress" from "in-progress") from
    //    short-circuiting to off-topic, recency-sorted results — the on-topic
    //    term ("cookieless") gets pooled in and rises to the top by coverage.
    const seen = new Map<string, RawItem>();
    for (const t of ranked.slice(0, 4)) {
      const { items, error } = await query(ref, [t], kind, perSource * 2);
      if (error) lastError = error;
      for (const it of items) if (!seen.has(it.ref)) seen.set(it.ref, it);
    }
    const merged = rerank([...seen.values()], ranked).slice(0, perSource);
    if (merged.length) return { items: merged, notes: [] };
    return { items: [], notes: lastError ? [lastError] : [`No ${kind}s matched the question.`] };
  },
};

// Re-rank issues/PRs by how many of the question's keywords each item actually
// mentions (title + body), breaking ties by GitHub's own relevance score.
export function rerank(items: RawItem[], ranked: string[]): RawItem[] {
  const terms = ranked.map((t) => t.toLowerCase());
  const coverage = (it: RawItem): number => {
    const hay = `${it.title} ${it.snippet}`.toLowerCase();
    let c = 0;
    for (const t of terms) if (hay.includes(t)) c++;
    return c;
  };
  return items
    .map((it) => ({ it, c: coverage(it), s: it.score }))
    .sort((a, b) => b.c - a.c || b.s - a.s)
    .map((x) => x.it);
}

// Dedupe attempt term-lists (so [a,b,c],[a,b],[a] don't repeat when there are
// fewer keywords) while preserving order.
function uniqueAttempts(lists: string[][]): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const l of lists) {
    const key = l.join(" ");
    if (l.length && !seen.has(key)) {
      seen.add(key);
      out.push(l);
    }
  }
  return out;
}
