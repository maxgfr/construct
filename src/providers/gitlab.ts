import { httpGet } from "../research/fetch.js";
import { rankedKeywords } from "../util.js";
import type { Provider, RawItem, IssueKind } from "./registry.js";

// GitLab provider. Public REST v4, unauthenticated read of public projects. The
// project is addressed by its URL-encoded full path (namespace/subgroups/repo),
// so subgroups work. Issues → /issues, PRs → /merge_requests.
export const gitlab: Provider = {
  name: "gitlab",
  matches: (host) => /gitlab/i.test(host),

  async search(ref, question, kind, perSource) {
    if (!ref.owner || !ref.repo) {
      return { items: [], notes: ["No project path resolved; cannot query GitLab issues/MRs."] };
    }
    const kw = rankedKeywords(question).slice(0, 4);
    if (kw.length === 0) {
      return { items: [], notes: [`No keywords to search GitLab ${kind === "issue" ? "issues" : "merge requests"}.`] };
    }
    const proj = encodeURIComponent(`${ref.owner}/${ref.repo}`);
    const path = kind === "issue" ? "issues" : "merge_requests";
    const search = encodeURIComponent(kw.join(" "));
    const url =
      `https://${ref.host}/api/v4/projects/${proj}/${path}` +
      `?search=${search}&per_page=${perSource}&order_by=updated_at&sort=desc`;

    const r = await httpGet(url, { accept: "application/json" });
    if (!r.ok) {
      return { items: [], notes: [`GitLab ${kind} search unavailable (status ${r.status}).`] };
    }
    try {
      const arr = JSON.parse(r.body);
      if (!Array.isArray(arr)) return { items: [], notes: [`GitLab ${kind} search returned no array.`] };
      const marker = kind === "issue" ? "#" : "!";
      const items: RawItem[] = arr.map((it: any) => {
        const num = it.iid ?? it.id;
        const body = String(it.description ?? "").replace(/\r/g, "").trim().slice(0, 1200);
        return {
          source: kind,
          title: `${marker}${num} ${it.title} [${it.state}]`,
          ref: `${kind}#${num}`,
          location: it.web_url,
          score: 0,
          snippet: `state: ${it.state} · updated: ${it.updated_at ?? "?"}\n\n${body || "(no description)"}`,
          url: it.web_url,
          meta: { iid: num, state: it.state },
        };
      });
      return { items, notes: [] };
    } catch {
      return { items: [], notes: [`GitLab ${kind} search returned an unparseable response.`] };
    }
  },
};
