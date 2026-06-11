import { resolveRepo, ensureClone } from "../clone.js";
import { walk, readText } from "../walk.js";
import { providerFor } from "../providers/registry.js";
import { discover } from "./web.js";
import { excerptsFromText } from "./fetch.js";
import type { ResearchContext, SourceResult, RawItem } from "../types.js";

const REPO_URL_RE = /^https?:\/\/(github|gitlab)\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/i;

// Top-level GitHub/GitLab namespaces that are site sections, not repo owners.
// Web discovery routinely surfaces them (github.com/topics/x, /collections/y);
// treating one as a repo means a doomed clone plus rejected issue/PR queries.
const NON_REPO_OWNERS = new Set([
  "topics",
  "search",
  "collections",
  "trending",
  "explore",
  "marketplace",
  "sponsors",
  "features",
  "about",
  "pricing",
  "login",
  "join",
  "signup",
  "settings",
  "notifications",
  "issues",
  "pulls",
  "orgs",
  "apps",
  "blog",
  "site",
  "enterprise",
  "customer-stories",
  "security",
  "readme",
  "events",
  "dashboard",
  "groups",
  "users",
  "help",
  "projects",
  "-",
]);

// Canonicalise a repo URL down to host/owner/repo (drop deep paths, .git, etc.).
// Returns undefined for URLs whose "owner" is a reserved site section.
export function canonicalRepoUrl(url: string): string | undefined {
  const m = /^(https?:\/\/(?:github|gitlab)\.com\/([A-Za-z0-9._-]+)\/[A-Za-z0-9._-]+)/i.exec(url);
  if (!m || NON_REPO_OWNERS.has(m[2]!.toLowerCase())) return undefined;
  return m[1]!.replace(/\.git$/, "");
}

export function languageHistogram(files: { ext: string }[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const f of files) {
    const ext = f.ext.replace(/^\./, "");
    if (!ext) continue;
    counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// The `oss` angle: mine comparable open-source projects for prior art and real
// pitfalls. Discover candidate repos (from brief.ossSeeds or the web), clone
// each, fingerprint it (language mix + README excerpt), and pull related
// issues/PRs via the host provider. Emits `oss` + `issue` + `pr` evidence.
export async function ossAngle(ctx: ResearchContext): Promise<SourceResult[]> {
  const notes: string[] = [];
  // Accept everything resolveRepo understands: full URLs, host/owner/repo,
  // gitlab subgroups (a/b/c), and bare owner/repo shorthand.
  let seeds = ctx.brief.ossSeeds.filter((s) => REPO_URL_RE.test(s) || /^([a-z0-9.-]+\.[a-z]{2,}\/)?[\w.-]+(\/[\w.-]+)+$/i.test(s));

  if (seeds.length === 0) {
    const q = `${ctx.query || ctx.brief.idea} open source github`;
    const d = await discover(q, ctx.webEngine, ctx.perSource);
    notes.push(`OSS discovery via ${d.via} for "${q}".`, ...d.notes);
    seeds = [...new Set(d.urls.map(canonicalRepoUrl).filter((x): x is string => !!x))];
  }
  seeds = seeds.slice(0, 3);
  if (seeds.length === 0) {
    return [{ source: "oss", items: [], notes: [...notes, "No comparable OSS projects found."] }];
  }

  const ossItems: RawItem[] = [];
  const issueItems: RawItem[] = [];
  const prItems: RawItem[] = [];
  const q = ctx.query || ctx.brief.idea;

  for (const seed of seeds) {
    const ref = resolveRepo(seed);
    let dir: string | undefined;
    try {
      dir = ensureClone(ref, { refresh: ctx.refresh });
    } catch (e) {
      notes.push(`Could not clone ${ref.raw}: ${(e as Error).message}`);
    }
    const repoLabel = ref.owner && ref.repo ? `${ref.owner}/${ref.repo}` : ref.slug;

    if (dir) {
      const files = walk(dir);
      const langs = languageHistogram(files)
        .slice(0, 6)
        .map(([e, c]) => `${e}:${c}`)
        .join(", ");
      let snippet = `Languages: ${langs || "n/a"} · files: ${files.length}.`;
      const readme = files.find((f) => /^readme(\.|$)/i.test(f.rel)) ?? files.find((f) => /(^|\/)readme\./i.test(f.rel));
      if (readme) {
        const text = readText(readme.abs);
        const ex = excerptsFromText(text, ref.webUrl ?? ref.raw, repoLabel, "oss", q, 1);
        if (ex[0]) snippet += `\n\n${ex[0].snippet}`;
      }
      ossItems.push({
        source: "oss",
        title: `${repoLabel} — prior art`,
        ref: repoLabel,
        location: ref.webUrl,
        score: files.length,
        snippet,
        url: ref.webUrl,
      });
    }

    // Pitfalls: related issues/PRs (works even if the clone failed, as long as
    // owner/repo resolved).
    if (ref.owner && ref.repo) {
      const provider = providerFor(ref.host);
      const iss = await provider.search(ref, q, "issue", ctx.perSource);
      issueItems.push(...iss.items);
      notes.push(...iss.notes);
      const prs = await provider.search(ref, q, "pr", ctx.perSource);
      prItems.push(...prs.items);
      notes.push(...prs.notes);
    }
  }

  return [
    { source: "oss", items: ossItems, notes },
    { source: "issue", items: issueItems, notes: [] },
    { source: "pr", items: prItems, notes: [] },
  ];
}
