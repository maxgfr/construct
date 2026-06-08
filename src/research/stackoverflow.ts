import type { SourceResult, RawItem } from "../types.js";
import { rankedKeywords } from "../util.js";
import { httpGet, htmlToText } from "./fetch.js";

// StackOverflow Q&A via the keyless StackExchange API (anonymous, rate-limited
// but enough for a few targeted lookups). Optional STACK_PAT raises the limit,
// never required. Used by the `tech` angle to surface known pitfalls of the
// candidate technologies.
export async function stackoverflow(question: string, perSource: number): Promise<SourceResult> {
  const kws = rankedKeywords(question).slice(0, 5).join(" ");
  if (!kws) return { source: "so", items: [], notes: ["No keywords to search StackOverflow."] };
  const q = encodeURIComponent(kws);
  const pat = process.env.STACK_PAT ? `&access_token=${process.env.STACK_PAT}` : "";
  const url =
    `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance` +
    `&q=${q}&site=stackoverflow&filter=withbody&pagesize=${perSource}${pat}`;

  const r = await httpGet(url, { accept: "application/json" });
  if (!r.ok) {
    return { source: "so", items: [], notes: [`StackOverflow search unavailable (status ${r.status}).`] };
  }
  try {
    const data = JSON.parse(r.body);
    const items: RawItem[] = (data.items ?? []).map((it: any) => {
      const body = htmlToText(String(it.body ?? "")).slice(0, 1200);
      const accepted = it.is_answered ? "answered" : "unanswered";
      return {
        source: "so",
        title: htmlToText(String(it.title ?? "(question)")).slice(0, 160),
        ref: `so:${it.question_id}`,
        location: it.link,
        score: Number(it.score ?? 0),
        snippet:
          `score: ${it.score ?? 0} · ${accepted} · answers: ${it.answer_count ?? 0}` +
          (it.tags?.length ? ` · tags: ${it.tags.slice(0, 6).join(", ")}` : "") +
          `\n\n${body || "(no body)"}`,
        url: it.link,
        meta: { questionId: it.question_id, isAnswered: it.is_answered, answerCount: it.answer_count },
      };
    });
    const notes =
      data.quota_remaining !== undefined && data.quota_remaining < 20
        ? [`StackExchange anonymous quota low (${data.quota_remaining} left).`]
        : [];
    if (items.length === 0) notes.push("No StackOverflow questions matched.");
    return { source: "so", items, notes };
  } catch {
    return { source: "so", items: [], notes: ["StackOverflow search returned an unparseable response."] };
  }
}
