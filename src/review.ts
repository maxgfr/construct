import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { srdManifestPath } from "./srd.js";
import type { ClaimEvidencePair, ClaimVerdict, ClaimVerifyResult, EvidenceItem, SRD, VerdictKind } from "./types.js";

// Bounds the review loop (claim↔evidence pairs adjudicated per run).
export const REVIEW_MAX = 40;
const VALID_VERDICTS: VerdictKind[] = ["supported", "partial", "refuted", "unsupported"];

export interface ReviewWorklist {
  run: string;
  pairs: ClaimEvidencePair[];
}

// Every groundable SRD claim with the text to judge + its cited [E#] ids. The
// citations are structured in SRD.json (rationaleEvidence / evidence), so no
// markdown parsing is needed — the worklist agrees with the coverage report by
// construction.
function srdClaims(srd: SRD): { id: string; kind: ClaimEvidencePair["kind"]; text: string; ev: string[] }[] {
  const out: { id: string; kind: ClaimEvidencePair["kind"]; text: string; ev: string[] }[] = [];
  for (const f of srd.functional) {
    const ac = f.acceptance.map((a) => `${a.given} / ${a.when} / ${a.then}`).join("; ");
    out.push({ id: f.id, kind: "FR", text: `${f.title}: ${f.description}${ac ? " — " + ac : ""}`, ev: f.rationaleEvidence });
  }
  for (const n of srd.nonFunctional) {
    out.push({ id: n.id, kind: "NFR", text: `${n.category}: ${n.statement}${n.metric ? ` (${n.metric})` : ""}`, ev: n.rationaleEvidence });
  }
  for (const a of srd.architecture.adrs) {
    out.push({ id: `ADR-${a.id}`, kind: "ADR", text: `${a.title}: ${a.decision}`, ev: a.evidence });
  }
  srd.competitive.competitors.forEach((c, i) => out.push({ id: `COMP-${i + 1}`, kind: "competitor", text: `${c.name}: ${c.note}`, ev: c.evidence }));
  srd.competitive.oss.forEach((o, i) => out.push({ id: `OSS-${i + 1}`, kind: "oss", text: `${o.name}: ${o.note}`, ev: o.evidence }));
  return out;
}

// Phase A — build the claim↔evidence review worklist. For every grounded SRD
// claim, emit one pair per cited evidence item (that resolves) with the item's
// snippet as the digest, so a skeptic agent judges whether the evidence actually
// SUPPORTS the claim. Deterministic; the JUDGEMENT is the agent's. Capped at the
// highest-score evidence. Writes VERIFY.todo.json + VERIFY.md.
export function runReview(runDir: string, opts: { maxReview?: number } = {}): ReviewWorklist {
  // Guard the manifest like check/verify do, so a missing/un-rendered run yields
  // a clean domain message ("No SRD.json …") instead of leaking a raw fs ENOENT.
  const manifest = srdManifestPath(runDir);
  if (!existsSync(manifest)) throw new Error(`No SRD.json in ${runDir} — render the SRD first (construct render).`);
  let srd: SRD;
  try {
    srd = JSON.parse(readFileSync(manifest, "utf8")) as SRD;
  } catch (e) {
    throw new Error(`SRD.json is unreadable: ${(e as Error).message}`);
  }
  const evPath = join(runDir, "evidence", "evidence.json");
  const evidence: EvidenceItem[] = existsSync(evPath) ? JSON.parse(readFileSync(evPath, "utf8")) : [];
  const byId = new Map(evidence.map((e) => [e.id, e] as const));

  const pairs: (ClaimEvidencePair & { score: number })[] = [];
  for (const c of srdClaims(srd)) {
    for (const id of [...new Set(c.ev)]) {
      const e = byId.get(id);
      if (!e) continue; // dangling citation — not a support question
      pairs.push({
        claimId: c.id,
        kind: c.kind,
        claim: c.text.trim().slice(0, 400),
        evidenceId: id,
        source: e.source,
        digest: (e.snippet || e.title || e.ref).slice(0, 600),
        score: e.score,
      });
    }
  }

  const max = Math.max(1, Math.floor(opts.maxReview ?? REVIEW_MAX));
  const kept =
    pairs.length > max
      ? pairs
          .slice()
          .sort((a, b) => b.score - a.score || a.claimId.localeCompare(b.claimId) || a.evidenceId.localeCompare(b.evidenceId))
          .slice(0, max)
      : pairs;
  const worklist: ReviewWorklist = { run: runDir, pairs: kept.map(({ score, ...rest }) => rest) };

  const todo = {
    run: runDir,
    pairs: worklist.pairs.map((p) => ({ ...p, verdict: null as VerdictKind | null, note: "" })),
  };
  writeFileSync(join(runDir, "VERIFY.todo.json"), JSON.stringify(todo, null, 2));
  writeFileSync(join(runDir, "VERIFY.md"), renderWorklistMd(worklist, pairs.length, kept.length));
  return worklist;
}

function renderWorklistMd(wl: ReviewWorklist, total: number, kept: number): string {
  const out: string[] = [];
  out.push(`# Claim-support review worklist`);
  out.push("");
  out.push(
    `For each pair, open the cited evidence and judge whether it **supports** the claim. ` +
      `In \`VERIFY.todo.json\`, set each \`verdict\` to one of supported · partial · refuted · unsupported, ` +
      `add a short \`note\`, save it (e.g. as \`verdicts.json\`), then run ` +
      `\`construct review --apply verdicts.json --out <run>\`.`,
  );
  if (kept < total) out.push(`\n_Showing ${kept} of ${total} pair(s) — capped at the highest-score evidence._`);
  out.push("");
  for (const p of wl.pairs) {
    out.push(`## ${p.claimId} · ${p.evidenceId} (${p.source})`);
    out.push(`**Claim (${p.kind}):** ${p.claim}`);
    out.push(`**Cited evidence:** ${p.digest}`);
    out.push(`**Verdict:** _____ · **Note:** _____`);
    out.push("");
  }
  return out.join("\n");
}

// Phase B — read an agent-filled verdicts file (a `{ pairs: ClaimVerdict[] }`
// object or a bare array), validate it, reduce to a ClaimVerifyResult, and
// persist VERIFY.json (read by `check --semantic`).
export function applyVerdicts(runDir: string, verdictsPath: string): ClaimVerifyResult {
  if (!existsSync(verdictsPath)) throw new Error(`verdicts file not found: ${verdictsPath}`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(verdictsPath, "utf8"));
  } catch (e) {
    throw new Error(`verdicts file is not valid JSON (${verdictsPath}): ${(e as Error).message}`);
  }
  // Accept a bare array of verdicts or { pairs: [...] }. Reject any other shape
  // LOUDLY: a stray number/object would otherwise silently reduce to a vacuous
  // 0-pair "pass" and overwrite a good VERIFY.json — a dangerous footgun.
  const list: ClaimVerdict[] | null = Array.isArray(raw)
    ? (raw as ClaimVerdict[])
    : raw && typeof raw === "object" && Array.isArray((raw as { pairs?: unknown }).pairs)
      ? (raw as { pairs: ClaimVerdict[] }).pairs
      : null;
  if (list === null) {
    throw new Error(`verdicts file must be a JSON array of verdicts or an object with a "pairs" array (${verdictsPath}).`);
  }

  const verdicts: ClaimVerdict[] = [];
  const seen = new Set<string>();
  const key = (claimId: string, evidenceId: string) => `${claimId}::${evidenceId}`;
  for (const v of list as any[]) {
    if (!v || typeof v.claimId !== "string" || typeof v.evidenceId !== "string") continue;
    const verdict = VALID_VERDICTS.includes(v.verdict) ? (v.verdict as VerdictKind) : (undefined as unknown as VerdictKind);
    verdicts.push({
      claimId: v.claimId,
      kind: v.kind,
      claim: typeof v.claim === "string" ? v.claim : "",
      evidenceId: v.evidenceId,
      source: v.source,
      digest: typeof v.digest === "string" ? v.digest : "",
      verdict,
      note: typeof v.note === "string" ? v.note : "",
    });
    seen.add(key(v.claimId, v.evidenceId));
  }

  // Cross-reference the worklist (VERIFY.todo.json): a claim↔evidence pair DROPPED
  // from the verdicts file is surfaced as unadjudicated, never silently passed —
  // omitting a load-bearing pair must not read as "every cited claim supported".
  const todoPath = join(runDir, "VERIFY.todo.json");
  if (existsSync(todoPath)) {
    try {
      const todo = JSON.parse(readFileSync(todoPath, "utf8")) as { pairs?: ClaimEvidencePair[] };
      for (const p of todo.pairs ?? []) {
        if (!p || typeof p.claimId !== "string" || typeof p.evidenceId !== "string") continue;
        if (seen.has(key(p.claimId, p.evidenceId))) continue;
        verdicts.push({
          claimId: p.claimId,
          kind: p.kind,
          claim: p.claim ?? "",
          evidenceId: p.evidenceId,
          source: p.source,
          digest: p.digest ?? "",
          verdict: undefined as unknown as VerdictKind,
          note: "",
        });
        seen.add(key(p.claimId, p.evidenceId));
      }
    } catch {
      // A corrupt worklist must not block applying real verdicts — reduce over
      // what was provided.
    }
  }

  const result = reduceVerdicts(verdicts);
  writeFileSync(join(runDir, "VERIFY.json"), JSON.stringify({ ...result, verdicts }, null, 2));
  return result;
}

// Fold per-pair verdicts into a pass/fail. A claim FAILS if a cited evidence
// item REFUTES it, or if every one of its fully-adjudicated cited items is
// `unsupported`. Pairs still missing a verdict are reported as unadjudicated.
export function reduceVerdicts(verdicts: ClaimVerdict[]): ClaimVerifyResult {
  const counts: Record<VerdictKind, number> = { supported: 0, partial: 0, refuted: 0, unsupported: 0 };
  for (const v of verdicts) if (v.verdict && counts[v.verdict] !== undefined) counts[v.verdict]++;

  const byClaim = new Map<string, ClaimVerdict[]>();
  for (const v of verdicts) {
    const group = byClaim.get(v.claimId) ?? [];
    group.push(v);
    byClaim.set(v.claimId, group);
  }

  const failures: ClaimVerifyResult["failures"] = [];
  const unadjudicated: string[] = [];
  for (const [claimId, group] of byClaim) {
    const adjudicated = group.filter((g) => !!g.verdict);
    if (adjudicated.length < group.length) unadjudicated.push(claimId);
    const refuted = adjudicated.find((g) => g.verdict === "refuted");
    const hasSupport = adjudicated.some((g) => g.verdict === "supported" || g.verdict === "partial");
    if (refuted) {
      failures.push({ claimId, evidenceId: refuted.evidenceId, verdict: "refuted", note: refuted.note });
    } else if (adjudicated.length === group.length && adjudicated.length > 0 && !hasSupport) {
      const u = adjudicated.find((g) => g.verdict === "unsupported") ?? adjudicated[0]!;
      failures.push({ claimId, evidenceId: u.evidenceId, verdict: u.verdict, note: u.note });
    }
  }

  return {
    ok: failures.length === 0,
    pairs: verdicts.length,
    adjudicated: verdicts.filter((v) => !!v.verdict).length,
    supported: counts.supported,
    partial: counts.partial,
    refuted: counts.refuted,
    unsupported: counts.unsupported,
    failures,
    unadjudicated,
  };
}

export function formatReviewReport(r: ClaimVerifyResult): string {
  const lines: string[] = [];
  lines.push(`construct review: ${r.adjudicated}/${r.pairs} pair(s) adjudicated`);
  lines.push(`  supported: ${r.supported} · partial: ${r.partial} · refuted: ${r.refuted} · unsupported: ${r.unsupported}`);
  for (const f of r.failures.slice(0, 12)) {
    lines.push(`  ✗ ${f.claimId} (${f.evidenceId}): ${f.verdict}${f.note ? " — " + f.note : ""}`);
  }
  if (r.unadjudicated.length) {
    lines.push(`  ⚠ ${r.unadjudicated.length} claim(s) not fully adjudicated: ${r.unadjudicated.join(", ")}`);
  }
  lines.push(r.ok ? `  ✓ every grounded claim is backed by its cited evidence` : `  ✗ some claims are refuted or unsupported`);
  return lines.join("\n");
}
