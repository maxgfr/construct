import type { SourceResult, RawItem } from "../types.js";
import { keywords, rankedKeywords } from "../util.js";
import { httpGet, htmlToText } from "./fetch.js";

// Slugify a candidate-technology name into a StackOverflow tag: lowercase,
// internal whitespace → "-", keep dots/hyphens/plus so "Next.js" → "next.js"
// and "C++" → "c++" survive as their real tag names.
export function soTagFor(tech: string): string {
  return tech
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9.+-]/g, "")
    .replace(/^-+|-+$/g, "");
}

// One StackExchange `search/advanced` call. Optional STACK_PAT raises the anon
// quota, never required. When `tag` is set the query is scoped to that tag.
async function soQuery(q: string, perSource: number, tag?: string): Promise<{ ok: boolean; status: number; body: string; url: string }> {
  const pat = process.env.STACK_PAT ? `&access_token=${process.env.STACK_PAT}` : "";
  const tagged = tag ? `&tagged=${encodeURIComponent(tag)}` : "";
  const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${q}&site=stackoverflow&filter=withbody&pagesize=${perSource}${tagged}${pat}`;
  const r = await httpGet(url, { accept: "application/json" });
  return { ok: r.ok, status: r.status, body: r.body, url };
}

// StackOverflow Q&A via the keyless StackExchange API (anonymous, rate-limited
// but enough for a few targeted lookups). Used by the `tech` angle to surface
// known pitfalls of the candidate technologies. `opts.tag` scopes the query to
// a StackOverflow tag (the candidate tech); the generic angle passes none and
// relies on the off-topic post-filter alone. Results whose title+tags share no
// keyword with the question are dropped — StackExchange relevance ranking
// otherwise surfaces high-vote but topically-unrelated questions ("The
// Definitive C++ Book Guide") on a generic query.
export async function stackoverflow(question: string, perSource: number, opts: { tag?: string } = {}): Promise<SourceResult> {
  const kws = rankedKeywords(question).slice(0, 5).join(" ");
  if (!kws) return { source: "so", items: [], notes: ["No keywords to search StackOverflow."] };
  const q = encodeURIComponent(kws);

  const notes: string[] = [];
  let r = await soQuery(q, perSource, opts.tag);
  if (!r.ok) {
    return { source: "so", items: [], notes: [`StackOverflow search unavailable (status ${r.status}).`] };
  }

  let data: { items?: unknown[]; quota_remaining?: number };
  try {
    data = JSON.parse(r.body);
  } catch {
    return { source: "so", items: [], notes: ["StackOverflow search returned an unparseable response."] };
  }

  // A tagged query that returns nothing is often the tag being slightly off
  // (a package name vs its SO tag) — retry once untagged before giving up.
  if (opts.tag && (data.items ?? []).length === 0) {
    r = await soQuery(q, perSource, undefined);
    if (r.ok) {
      try {
        data = JSON.parse(r.body);
        notes.push(`No tagged:${opts.tag} results — retried without the tag.`);
      } catch {
        /* keep the empty tagged result */
      }
    }
  }

  const wantKws = new Set(keywords(question).map((k) => k.toLowerCase()));
  const items: RawItem[] = [];
  let filtered = 0;
  for (const raw of data.items ?? []) {
    const it = raw as Record<string, any>;
    const title = htmlToText(String(it.title ?? "(question)")).slice(0, 160);
    const tags: string[] = Array.isArray(it.tags) ? it.tags : [];
    // Off-topic filter: the item must share at least one query keyword with its
    // title or tags. Skipped when we have no keywords to compare against.
    if (wantKws.size) {
      const hay = new Set(keywords(`${title} ${tags.join(" ")}`).map((k) => k.toLowerCase()));
      const overlaps = [...wantKws].some((k) => hay.has(k)) || tags.some((t) => wantKws.has(t.toLowerCase()));
      if (!overlaps) {
        filtered++;
        continue;
      }
    }
    const body = htmlToText(String(it.body ?? "")).slice(0, 1200);
    const accepted = it.is_answered ? "answered" : "unanswered";
    items.push({
      source: "so",
      title,
      ref: `so:${it.question_id}`,
      location: it.link,
      score: Number(it.score ?? 0),
      snippet:
        `score: ${it.score ?? 0} · ${accepted} · answers: ${it.answer_count ?? 0}` +
        (tags.length ? ` · tags: ${tags.slice(0, 6).join(", ")}` : "") +
        `\n\n${body || "(no body)"}`,
      url: it.link,
      meta: { questionId: it.question_id, isAnswered: it.is_answered, answerCount: it.answer_count },
    });
  }

  if (filtered) notes.push(`Filtered ${filtered} off-topic StackOverflow result(s) (no keyword overlap with the query).`);
  if (data.quota_remaining !== undefined && data.quota_remaining < 20) notes.push(`StackExchange anonymous quota low (${data.quota_remaining} left).`);
  if (items.length === 0) notes.push("No StackOverflow questions matched.");
  return { source: "so", items, notes };
}
