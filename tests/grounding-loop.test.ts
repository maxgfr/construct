// The grounding loop — the promise construct actually sells.
//
// The skill tells the agent to dig deeper, re-run `research` pinning the URLs it
// proved useful, then re-render. Each defect below broke that loop silently:
// citations that quietly re-pointed, pins that were dropped while the notes
// claimed otherwise, verdicts that outlived the SRD they judged. Silent is the
// operative word — every one of them passed `check`.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assignIds, contentKey, emptyLedger, loadLedger, writeDossier, evidenceFingerprint } from "../src/research/dossier.js";
import { capSource } from "../src/research/registry.js";
import { renderSRD } from "../src/render.js";
import { checkRun } from "../src/check.js";
import { applyVerdicts } from "../src/review.js";
import { srdManifestPath } from "../src/srd.js";
import { authorSRD } from "./helpers/author.js";
import type { Brief, DossierMeta, EvidenceItem, RawItem, SourceResult, SRD } from "../src/types.js";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const brief = JSON.parse(readFileSync(join(FIX, "sample-brief.json"), "utf8")) as Brief;
const evidenceFixture = JSON.parse(readFileSync(join(FIX, "sample-evidence.json"), "utf8")) as EvidenceItem[];

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "construct-ground-"));
  dirs.push(d);
  return d;
}

function renderRun(): string {
  const out = mkdtempSync(join(tmpdir(), "construct-ground-run-"));
  dirs.push(out);
  mkdirSync(join(out, "evidence"), { recursive: true });
  writeFileSync(join(out, "evidence", "evidence.json"), JSON.stringify(evidenceFixture));
  renderSRD(brief, evidenceFixture, { level: "complex", out, merge: false, generatedAt: "T" });
  // A raw complex scaffold fails the requirements lint by design; these tests
  // are about other rules, so author it first.
  authorSRD(out);
  return out;
}

function mutateSRD(dir: string, fn: (srd: SRD) => void): void {
  const srd = JSON.parse(readFileSync(srdManifestPath(dir), "utf8")) as SRD;
  fn(srd);
  writeFileSync(srdManifestPath(dir), JSON.stringify(srd, null, 2));
}

function item(over: Partial<RawItem> = {}): RawItem {
  return {
    source: "market",
    title: "a page",
    ref: "https://example.com/a",
    location: "https://example.com/a#~4",
    score: 3,
    snippet: "some evidence text",
    url: "https://example.com/a",
    ...over,
  };
}

function result(items: RawItem[], source: RawItem["source"] = "market"): SourceResult {
  return { source, items, notes: [] };
}

const META: DossierMeta = {
  idea: "an idea",
  angles: ["market"],
  sources: ["market"],
  semantic: false,
  evidenceCount: 0,
  builtAt: "2026-01-01T00:00:00.000Z",
  notes: [],
};

describe("evidence ids survive a re-research (A1)", () => {
  it("keeps an already-cited item on its id when new evidence is added", () => {
    const a = item({ location: "https://a.com#~1", ref: "https://a.com", url: "https://a.com", score: 1 });
    const b = item({ location: "https://b.com#~1", ref: "https://b.com", url: "https://b.com", score: 9 });

    const ledger = emptyLedger();
    const first = assignIds([result([a, b])], ledger);
    const idOfA = first.find((e) => e.url === "https://a.com")!.id;
    const idOfB = first.find((e) => e.url === "https://b.com")!.id;

    // A fold-in: the operator pins a new, higher-scoring page. Under positional
    // numbering this shifted every id below it — and the SRD's `[E2]` silently
    // started quoting a different source.
    const c = item({ location: "https://c.com#~1", ref: "https://c.com", url: "https://c.com", score: 99 });
    const second = assignIds([result([a, b, c])], ledger);

    expect(second.find((e) => e.url === "https://a.com")!.id).toBe(idOfA);
    expect(second.find((e) => e.url === "https://b.com")!.id).toBe(idOfB);
    expect(second.find((e) => e.url === "https://c.com")!.id).not.toBe(idOfA);
  });

  it("never recycles the id of an item that disappeared", () => {
    const a = item({ location: "https://a.com#~1", url: "https://a.com", ref: "https://a.com" });
    const ledger = emptyLedger();
    const idOfA = assignIds([result([a])], ledger)[0]!.id;

    // The page 404s on the next run and drops out of the dossier; a different
    // page takes its place. Reusing E1 would re-point a live citation.
    const b = item({ location: "https://b.com#~1", url: "https://b.com", ref: "https://b.com" });
    const after = assignIds([result([b])], ledger);
    expect(after[0]!.id).not.toBe(idOfA);
  });

  it("distinguishes two excerpts of the same page by their line anchor", () => {
    const one = item({ location: "https://a.com#~4" });
    const two = item({ location: "https://a.com#~90" });
    expect(contentKey(one)).not.toBe(contentKey(two));
    const ids = assignIds([result([one, two])], emptyLedger()).map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("numbers a fresh run E1, E2 … so a first dossier still reads naturally", () => {
    const ids = assignIds([result([item({ location: "a", score: 9 }), item({ location: "b", score: 1 })])], emptyLedger()).map((e) => e.id);
    expect(ids).toEqual(["E1", "E2"]);
  });

  it("round-trips the ledger through the dossier so the next run can reuse it", () => {
    const dir = join(tmp(), "evidence");
    const ledger = emptyLedger();
    const evidence = assignIds([result([item()])], ledger);
    writeDossier(dir, evidence, META, ledger);
    expect(existsSync(join(dir, "ids.json"))).toBe(true);

    const reloaded = loadLedger(dir);
    expect(reloaded.assigned).toEqual(ledger.assigned);
    expect(reloaded.next).toBe(ledger.next);
    rmSync(dir, { recursive: true, force: true });
  });

  it("degrades a corrupt or foreign-version ledger to a fresh one rather than throwing", () => {
    const dir = join(tmp(), "evidence");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "ids.json"), "}not json{");
    expect(loadLedger(dir)).toEqual(emptyLedger());

    writeFileSync(join(dir, "ids.json"), JSON.stringify({ schemaVersion: 99, next: 7, assigned: { x: "E7" } }));
    expect(loadLedger(dir)).toEqual(emptyLedger());
    rmSync(dir, { recursive: true, force: true });
  });

  it("fingerprints the dossier so a changed corpus is detectable", () => {
    const base = assignIds([result([item()])], emptyLedger());
    const same = assignIds([result([item()])], emptyLedger());
    const different = assignIds([result([item({ snippet: "different text entirely, longer" })])], emptyLedger());
    expect(evidenceFingerprint(base)).toBe(evidenceFingerprint(same));
    expect(evidenceFingerprint(base)).not.toBe(evidenceFingerprint(different));
  });
});

describe("pinned URLs survive the per-source budget (A2)", () => {
  it("keeps every pinned excerpt even when they exceed --per-source", () => {
    const pins = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => item({ location: `https://p${i}.com#~1`, score: 0, meta: { pinned: true } }));
    const capped = capSource(result(pins), 3);
    expect(capped.items).toHaveLength(8);
    expect(capped.items.every((i) => i.meta?.pinned)).toBe(true);
  });

  it("fills the remaining budget with the best-scored discovery, and names what it dropped", () => {
    const pinned = item({ location: "https://pin.com#~1", score: 0, meta: { pinned: true } });
    const found = [9, 7, 5, 1].map((s) => item({ location: `https://d${s}.com#~1`, score: s }));
    const capped = capSource(result([pinned, ...found]), 3);

    expect(capped.items.map((i) => i.score)).toEqual([0, 9, 7]); // pin + top 2
    expect(capped.notes.join(" ")).toMatch(/2 lower-scored item\(s\) dropped/);
    expect(capped.notes.join(" ")).toMatch(/1 slot\(s\) held by pinned URLs/);
  });

  it("says nothing when everything fits — a note only appears for a real cut", () => {
    const capped = capSource(result([item({ location: "a" }), item({ location: "b" })]), 6);
    expect(capped.items).toHaveLength(2);
    expect(capped.notes).toEqual([]);
  });
});

// --- gate-level defects ------------------------------------------------------

describe("the gate stops judging its own inputs (A5)", () => {
  it("ignores a 🧠 callout and a TODO that appear inside retrieved evidence", () => {
    const dir = renderRun();
    // VERIFY.md's body is raw evidence digests. A source page that happens to
    // contain the renderer's own callout syntax used to hard-fail the run on
    // text nobody authored.
    writeFileSync(join(dir, "VERIFY.md"), "# worklist\n\n> 🧠 **Decide:** quoted from a competitor's roadmap\n\nTODO in a snippet\n");
    mkdirSync(join(dir, "orchestration", "out"), { recursive: true });
    writeFileSync(join(dir, "orchestration", "out", "researcher-1.md"), "> 🧠 **Decide:** returned by a subagent\n");

    const r = checkRun(dir);
    expect(r.structural.errors.join(" ")).not.toMatch(/Unresolved decision/);
    expect(r.structural.warnings.join(" ")).not.toMatch(/VERIFY\.md|orchestration/);
    expect(r.ok).toBe(true);
  });

  it("still hard-fails on a 🧠 left in authored SRD prose", () => {
    const dir = renderRun();
    writeFileSync(join(dir, "00-overview", "VISION.md"), "# Vision\n\n> 🧠 **Decide:** the actual open question\n");
    expect(checkRun(dir).ok).toBe(false);
  });
});

describe("duplicate requirement titles are refused (A6)", () => {
  it("fails, naming both requirements, because BUILD-PLAN progress is keyed by title", () => {
    const dir = renderRun();
    mutateSRD(dir, (s) => {
      s.functional[1]!.title = s.functional[0]!.title;
    });
    const r = checkRun(dir);
    expect(r.ok).toBe(false);
    expect(r.structural.errors.join(" ")).toMatch(/FR-002 repeats the title of FR-001/);
  });

  it("treats titles differing only by case or padding as duplicates", () => {
    const dir = renderRun();
    mutateSRD(dir, (s) => {
      s.functional[1]!.title = `  ${s.functional[0]!.title.toUpperCase()} `;
    });
    expect(checkRun(dir).ok).toBe(false);
  });
});

describe("verdicts cannot outlive the SRD they judged (A3)", () => {
  function seedVerdicts(dir: string): string {
    const srd = JSON.parse(readFileSync(srdManifestPath(dir), "utf8")) as SRD;
    const fr = srd.functional[0]!;
    fr.rationaleEvidence = [evidenceFixture[0]!.id];
    writeFileSync(srdManifestPath(dir), JSON.stringify(srd, null, 2));
    const verdicts = [{ claimId: fr.id, evidenceId: evidenceFixture[0]!.id, verdict: "supported", note: "ok" }];
    const p = join(dir, "verdicts.json");
    writeFileSync(p, JSON.stringify(verdicts));
    return p;
  }

  it("stamps VERIFY.json with the SRD it was adjudicated against", () => {
    const dir = renderRun();
    applyVerdicts(dir, seedVerdicts(dir));
    const written = JSON.parse(readFileSync(join(dir, "VERIFY.json"), "utf8"));
    expect(written.srdGeneratedAt).toBe("T");
  });

  it("fails --semantic when the SRD was re-rendered after the review", () => {
    const dir = renderRun();
    applyVerdicts(dir, seedVerdicts(dir));
    expect(checkRun(dir, { semantic: true }).semanticError).toBeUndefined();

    // A re-render: new generatedAt, potentially renumbered FR ids and rewritten
    // criteria. The old verdicts must no longer certify anything.
    mutateSRD(dir, (s) => {
      s.generatedAt = "T2";
    });
    const stale = checkRun(dir, { semantic: true });
    expect(stale.ok).toBe(false);
    expect(stale.semanticError).toMatch(/adjudicated against a different SRD/);
  });

  it("degrades the staleness gate to a warning under --allow-unverified", () => {
    const dir = renderRun();
    applyVerdicts(dir, seedVerdicts(dir));
    mutateSRD(dir, (s) => {
      s.generatedAt = "T2";
    });
    const r = checkRun(dir, { semantic: true, allowUnverified: true });
    expect(r.structural.warnings.join(" ")).toMatch(/different SRD/);
  });
});
