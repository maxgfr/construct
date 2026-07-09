import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadBrief } from "./brief.js";
import { matchEvidence, GROUND_REQUIREMENT } from "./srd.js";
import { resolveRepo } from "./clone.js";
import type { Brief, DossierMeta, EvidenceItem, GapReport } from "./types.js";

// `construct analyze` — the post-research "what's thin?" signal. Pure read of
// brief.json + the evidence dossier; reuses the exact matcher render will use,
// so every gap reported here is a claim that WILL render ungrounded. It informs
// the dig-deeper loop (and prints the drill command that fixes each gap); it
// never gates — exit is always 0.

function loadEvidence(runDir: string): EvidenceItem[] {
  const path = join(runDir, "evidence", "evidence.json");
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return Array.isArray(data)
      ? (data.filter(
          (e) => !!e && typeof e === "object" && typeof (e as { id?: unknown }).id === "string" && typeof (e as { source?: unknown }).source === "string",
        ) as EvidenceItem[])
      : [];
  } catch {
    return [];
  }
}

function loadMetaNotes(runDir: string): string[] {
  const path = join(runDir, "evidence", "meta.json");
  if (!existsSync(path)) return [];
  try {
    const meta = JSON.parse(readFileSync(path, "utf8")) as DossierMeta;
    return Array.isArray(meta.notes) ? meta.notes.filter((n) => typeof n === "string") : [];
  } catch {
    return [];
  }
}

function featureText(f: Brief["featureWishlist"][number]): string {
  return `${f.title} ${f.notes ?? ""}`;
}

export function analyzeRun(runDir: string): GapReport {
  const brief = loadBrief(runDir);
  const evidence = loadEvidence(runDir);
  const notes = loadMetaNotes(runDir);
  // Drill commands embed brief free-text into a copy-paste / subagent-executed
  // shell line: single-quote the query (the only shell-inert quoting — backticks
  // and $() never expand inside single quotes), escape an embedded ' as '"'"'
  // and flatten newlines, so a hostile brief field cannot inject.
  const shellQuote = (s: string) => `'${s.replace(/\r\n|[\r\n]/g, " ").replace(/'/g, `'"'"'`)}'`;
  const drill = (cmd: string, q: string) => `construct ${cmd} --out ${runDir} --q ${shellQuote(q)}`;

  const bySource: Record<string, number> = {};
  for (const e of evidence) bySource[e.source] = (bySource[e.source] ?? 0) + 1;

  if (evidence.length === 0) {
    notes.push("No evidence dossier — run `construct research` first; everything below will render ungrounded.");
  }

  const lowSignal = evidence.filter((e) => e.meta?.lowSignal).length;
  if (lowSignal) {
    notes.push(`${lowSignal} low-signal snippet(s) in the dossier — likely boilerplate; re-drill with a sharper --q or a better --docs-url.`);
  }

  const suggestions: string[] = [];

  // Features with no evidence the renderer could cite (same matcher, same
  // source policy as buildSRD).
  const ungroundedFeatures = brief.featureWishlist
    .filter((f) => matchEvidence(featureText(f), evidence, 1, GROUND_REQUIREMENT).length === 0)
    .map((f) => ({ title: f.title, priority: f.priority ?? "should" }));
  for (const f of ungroundedFeatures) suggestions.push(drill("web", f.title));

  // Competitors the market angle never surfaced.
  const unmatchedCompetitors = brief.competitors.filter((name) => matchEvidence(name, evidence, 1, ["market"]).length === 0);
  for (const name of unmatchedCompetitors) suggestions.push(drill("web", name));

  // Candidate tech with no docs/StackOverflow grounding.
  const unmatchedTech = brief.candidateTech.filter((t) => matchEvidence(t, evidence, 1, ["docs", "so"]).length === 0);
  for (const t of unmatchedTech) suggestions.push(drill("tech", t));

  // OSS seeds with nothing mined from them (no repo summary, issues or PRs).
  const unminedSeeds = brief.ossSeeds.filter((seed) => {
    let q = seed;
    try {
      const ref = resolveRepo(seed);
      if (ref.owner && ref.repo) q = `${ref.owner} ${ref.repo}`;
    } catch {
      /* keep the raw seed as the query */
    }
    return matchEvidence(q, evidence, 1, ["oss", "issue", "pr"]).length === 0;
  });
  for (const seed of unminedSeeds) suggestions.push(`construct oss --out ${runDir} --seeds ${seed}`);

  return {
    evidenceCount: evidence.length,
    bySource,
    notes,
    ungroundedFeatures,
    unmatchedCompetitors,
    unmatchedTech,
    unminedSeeds,
    suggestions,
  };
}

export function formatGapReport(r: GapReport, runDir: string): string {
  const lines: string[] = [];
  lines.push(`construct analyze: ${runDir}`);
  lines.push(``);
  const sources = Object.entries(r.bySource)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([s, n]) => `${s}: ${n}`);
  lines.push(`Evidence: ${r.evidenceCount} item(s)${sources.length ? ` (${sources.join(" · ")})` : ""}`);
  for (const n of r.notes) lines.push(`  ⚠ ${n}`);
  lines.push(``);
  lines.push(`Gaps (each will render ungrounded as-is):`);
  const gapCount = r.ungroundedFeatures.length + r.unmatchedCompetitors.length + r.unmatchedTech.length + r.unminedSeeds.length;
  for (const f of r.ungroundedFeatures) lines.push(`  ✗ feature (${f.priority}): "${f.title}" has no matchable evidence`);
  for (const c of r.unmatchedCompetitors) lines.push(`  ✗ competitor: "${c}" never surfaced in market evidence`);
  for (const t of r.unmatchedTech) lines.push(`  ✗ tech: "${t}" has no docs/StackOverflow grounding`);
  for (const s of r.unminedSeeds) lines.push(`  ✗ oss seed: ${s} yielded no mined evidence`);
  if (gapCount === 0) lines.push(`  ✓ every feature, competitor, tech choice and OSS seed has matchable evidence`);
  if (r.suggestions.length) {
    lines.push(``);
    lines.push(`Suggested drills (then re-run \`construct research\` to fold findings in):`);
    for (const s of r.suggestions) lines.push(`  $ ${s}`);
  }
  return lines.join("\n");
}
