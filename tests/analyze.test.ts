import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeRun, formatGapReport } from "../src/analyze.js";
import type { Brief, EvidenceItem } from "../src/types.js";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const brief = JSON.parse(readFileSync(join(FIX, "sample-brief.json"), "utf8")) as Brief;
const evidence = JSON.parse(readFileSync(join(FIX, "sample-evidence.json"), "utf8")) as EvidenceItem[];

const dirs: string[] = [];
function makeRun(opts: { briefOverride?: Partial<Brief>; withEvidence?: boolean; metaNotes?: string[] } = {}): string {
  const out = mkdtempSync(join(tmpdir(), "construct-analyze-"));
  dirs.push(out);
  writeFileSync(join(out, "brief.json"), JSON.stringify({ ...brief, ...opts.briefOverride }));
  if (opts.withEvidence !== false) {
    mkdirSync(join(out, "evidence"), { recursive: true });
    writeFileSync(join(out, "evidence", "evidence.json"), JSON.stringify(evidence));
    if (opts.metaNotes) {
      writeFileSync(join(out, "evidence", "meta.json"), JSON.stringify({ notes: opts.metaNotes }));
    }
  }
  return out;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("analyzeRun — the post-research gap signal", () => {
  it("matches the fixture's grounded threads and names the thin ones", () => {
    const r = analyzeRun(makeRun());
    // every competitor surfaces in the market comparison evidence
    expect(r.unmatchedCompetitors).toEqual([]);
    // Meilisearch has docs evidence; PostgreSQL and Next.js have none
    expect(r.unmatchedTech).toContain("PostgreSQL");
    expect(r.unmatchedTech).not.toContain("Meilisearch");
    // omnivore is mined (E2); wallabag yielded nothing
    expect(r.unminedSeeds).toEqual(["https://github.com/wallabag/wallabag"]);
    expect(r.evidenceCount).toBe(evidence.length);
  });

  it("emits one concrete drill command per gap", () => {
    const out = makeRun();
    const r = analyzeRun(out);
    const tech = r.suggestions.find((s) => s.includes("PostgreSQL"));
    expect(tech).toMatch(/^construct tech --out /);
    const seed = r.suggestions.find((s) => s.includes("wallabag"));
    expect(seed).toMatch(/^construct oss --out .* --seeds https:\/\/github\.com\/wallabag\/wallabag$/);
  });

  it("notes low-signal snippets in the dossier", () => {
    const withLow = [
      ...evidence,
      { id: "E99", source: "docs", title: "banner", ref: "https://x/pricing", score: 0, snippet: "cookie banner", meta: { lowSignal: true } },
    ] as EvidenceItem[];
    const out = mkdtempSync(join(tmpdir(), "construct-analyze-"));
    dirs.push(out);
    writeFileSync(join(out, "brief.json"), JSON.stringify(brief));
    mkdirSync(join(out, "evidence"), { recursive: true });
    writeFileSync(join(out, "evidence", "evidence.json"), JSON.stringify(withLow));
    const r = analyzeRun(out);
    expect(r.notes.join(" ")).toMatch(/low-signal/i);
  });

  it("flags everything when there is no evidence dossier", () => {
    const r = analyzeRun(makeRun({ withEvidence: false }));
    expect(r.evidenceCount).toBe(0);
    expect(r.ungroundedFeatures.length).toBe(brief.featureWishlist.length);
    expect(r.unmatchedCompetitors).toEqual(brief.competitors);
    expect(r.notes.join(" ")).toMatch(/No evidence dossier/);
  });

  it("reports a gap for a competitor the research never surfaced", () => {
    const r = analyzeRun(makeRun({ briefOverride: { competitors: [...brief.competitors, "Zzyzx"] } }));
    expect(r.unmatchedCompetitors).toEqual(["Zzyzx"]);
    expect(r.suggestions.join("\n")).toMatch(/construct web --out .* --q 'Zzyzx'/);
  });

  it("single-quotes drill queries so shell metacharacters in brief free-text stay inert", () => {
    const hostile = "pwn `whoami` $(id) and it's\nmultiline";
    const out = makeRun({ briefOverride: { competitors: [...brief.competitors, hostile] } });
    const r = analyzeRun(out);
    const s = r.suggestions.find((x) => x.includes("pwn"));
    expect(s).toBeDefined();
    // Single-quoted for the shell: backticks and $() cannot expand, the embedded
    // apostrophe is escaped as '"'"' and the newline is flattened to a space.
    expect(s).toBe(`construct web --out ${out} --q 'pwn \`whoami\` $(id) and it'"'"'s multiline'`);
  });

  it("surfaces dossier notes (angle failures) from meta.json", () => {
    const r = analyzeRun(makeRun({ metaNotes: ["SearXNG unreachable; fell back to DuckDuckGo."] }));
    expect(r.notes).toContain("SearXNG unreachable; fell back to DuckDuckGo.");
  });

  it("treats a corrupt evidence.json / meta.json as no dossier rather than crashing", () => {
    const out = makeRun();
    writeFileSync(join(out, "evidence", "evidence.json"), "{not json][");
    writeFileSync(join(out, "evidence", "meta.json"), "}also broken{");
    const r = analyzeRun(out);
    expect(r.evidenceCount).toBe(0);
    expect(r.notes.join(" ")).toMatch(/No evidence dossier/);
  });

  it("keeps a free-text OSS seed as its own drill query when it is not a resolvable repo", () => {
    const r = analyzeRun(makeRun({ briefOverride: { ossSeeds: ["some vague idea, not a repo"] } }));
    expect(r.unminedSeeds).toContain("some vague idea, not a repo");
    expect(r.suggestions.join("\n")).toMatch(/construct oss --out .* --seeds some vague idea, not a repo/);
  });

  it("is deterministic for the same inputs", () => {
    const out = makeRun();
    expect(JSON.stringify(analyzeRun(out))).toBe(JSON.stringify(analyzeRun(out)));
  });

  it("formats a readable report naming each gap", () => {
    const out = makeRun();
    const text = formatGapReport(analyzeRun(out), out);
    expect(text).toMatch(/Gaps \(each will render ungrounded as-is\):/);
    expect(text).toMatch(/tech: "PostgreSQL"/);
    expect(text).toMatch(/Suggested drills/);
  });
});
