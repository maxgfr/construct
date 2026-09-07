import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { keywords } from "./util.js";
import { srdManifestPath } from "./srd.js";
import type { ClaimEvidencePair, ClaimVerdict, ClaimVerifyResult, EvidenceItem, SRD, VerdictKind } from "./types.js";

const VALID_VERDICTS: VerdictKind[] = ["supported", "partial", "refuted", "unsupported"];

export interface ReviewWorklist {
  run: string;
  pairs: ClaimEvidencePair[];
  // Every pair this review DERIVED (`claimId::evidenceId`), including the ones an
  // explicit `--max-review` cap dropped from `pairs`. It records what the review
  // looked at, so a pair the SRD cites LATER is distinguishable from one the cap
  // consciously left out.
  scope: string[];
}

// Load the dossier defensively: a hand-edited evidence.json (invalid JSON or a
// non-array) degrades to [] exactly like check/analyze/cli do, instead of
// crashing runReview with a raw `evidence.map is not a function` TypeError.
function loadEvidence(path: string): EvidenceItem[] {
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

// ---------------------------------------------------------------------------
// Content binding. A verdict is only meaningful for the exact text it judged, so
// every pair carries a fingerprint of that text: the claim's FULL string (the
// worklist only SHOWS a 400-char excerpt — an edit past it must still be caught)
// and the cited evidence item's whole retrieved record (an edited snippet is a
// different piece of evidence).
//
// This is what SRD.generatedAt could not do: the documented loop — edit SRD.json,
// `render --from-srd` — preserves generatedAt, so the timestamp gate saw nothing
// while every claim underneath the verdicts had changed.
//
// Deterministic by construction: same content ⇒ same fingerprint, so a re-render
// of unchanged content keeps the review valid.
// ---------------------------------------------------------------------------
const FINGERPRINT_VERSION = "cf1";

export const pairKey = (claimId: string, evidenceId: string): string => `${claimId}::${evidenceId}`;

function pairFingerprint(claimText: string, e: EvidenceItem): string {
  const canonical = JSON.stringify([
    FINGERPRINT_VERSION,
    claimText,
    e.id,
    e.source,
    e.title ?? "",
    e.ref ?? "",
    e.url ?? "",
    e.location ?? "",
    e.snippet ?? "",
  ]);
  return `${FINGERPRINT_VERSION}:${createHash("sha256").update(canonical).digest("hex").slice(0, 32)}`;
}

/**
 * The fingerprint of every claim↔evidence pair the run's CURRENT SRD + dossier
 * imply, keyed `claimId::evidenceId`. Built from the same claim/evidence walk as
 * `runReview`, so the worklist and this map agree by construction.
 *
 * `null` when the pair set cannot be derived at all (no/unreadable/shapeless
 * SRD.json) — callers then treat verdicts as unbound rather than as verified.
 */
export function currentPairFingerprints(runDir: string): Map<string, string> | null {
  const manifest = srdManifestPath(runDir);
  if (!existsSync(manifest)) return null;
  try {
    const srd = JSON.parse(readFileSync(manifest, "utf8")) as SRD;
    const byId = new Map(loadEvidence(join(runDir, "evidence", "evidence.json")).map((e) => [e.id, e] as const));
    const out = new Map<string, string>();
    for (const c of srdClaims(srd)) {
      for (const id of new Set(c.ev)) {
        const e = byId.get(id);
        if (!e) continue; // dangling citation — runReview emits no pair for it either
        out.set(pairKey(c.id, id), pairFingerprint(c.text, e));
      }
    }
    return out;
  } catch {
    return null;
  }
}

// The ~600-char window of the snippet that best covers the claim's keywords.
// A head slice can truncate away exactly the sentence that supports (or
// refutes) the claim, which would make the judge's verdict meaningless.
function claimDigest(snippet: string, claim: string, cap = 600): string {
  if (snippet.length <= cap) return snippet;
  const kws = keywords(claim).map((k) => k.toLowerCase());
  if (!kws.length) return snippet.slice(0, cap);
  const step = 150;
  let best = 0;
  let bestCov = -1;
  for (let start = 0; start === 0 || start + cap / 2 < snippet.length; start += step) {
    const w = snippet.slice(start, start + cap).toLowerCase();
    let cov = 0;
    for (const kw of kws) if (w.includes(kw)) cov++;
    // >= : at equal coverage prefer the LATER window, so the digest ends after
    // the keyword cluster instead of cutting the supporting sentence mid-way.
    if (cov >= bestCov) {
      bestCov = cov;
      best = start;
    }
  }
  return (best > 0 ? "… " : "") + snippet.slice(best, best + cap).trim();
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
  const evidence = loadEvidence(join(runDir, "evidence", "evidence.json"));
  const byId = new Map(evidence.map((e) => [e.id, e] as const));

  const pairs: (ClaimEvidencePair & { score: number })[] = [];
  for (const c of srdClaims(srd)) {
    for (const id of [...new Set(c.ev)]) {
      const e = byId.get(id);
      if (!e) continue; // dangling citation — not a support question
      const digest = claimDigest(e.snippet || e.title || e.ref, c.text);
      pairs.push({
        claimId: c.id,
        kind: c.kind,
        claim: c.text.trim().slice(0, 400),
        evidenceId: id,
        source: e.source,
        // A low-signal snippet (no keyword-matched excerpt — likely boilerplate)
        // is flagged so the judge adjudicates it skeptically instead of granting
        // "supported" on the URL alone.
        digest: e.meta?.lowSignal ? `[low-signal snippet — no keyword-matched excerpt; adjudicate skeptically] ${digest}` : digest,
        // Binds the verdict to the text actually reviewed — the FULL claim, not
        // the excerpt above, and the whole cited item.
        fingerprint: pairFingerprint(c.text, e),
        score: e.score,
      });
    }
  }

  // Every cited pair is adjudicated by default — a silent cap ranked by raw
  // retrieval score used to drop exactly the highest-value low-score evidence
  // (issue/PR citations). `--max-review N` still caps explicitly, and then the
  // dropped pairs are named in VERIFY.md so the omission is impossible to miss.
  const max = opts.maxReview === undefined ? Number.POSITIVE_INFINITY : Math.max(1, Math.floor(opts.maxReview));
  const rank = normalizedRank(pairs);
  const sorted =
    pairs.length > max
      ? pairs.slice().sort((a, b) => rank(b) - rank(a) || a.claimId.localeCompare(b.claimId) || a.evidenceId.localeCompare(b.evidenceId))
      : pairs;
  const kept = sorted.slice(0, Math.min(sorted.length, max));
  const dropped = sorted.slice(kept.length);
  const worklist: ReviewWorklist = {
    run: runDir,
    pairs: kept.map(({ score, ...rest }) => rest),
    // kept + dropped: the cap is a transparent omission, not a claim that the
    // dropped pairs do not exist.
    scope: pairs.map((p) => pairKey(p.claimId, p.evidenceId)).sort(),
  };

  const todo = {
    run: runDir,
    scope: worklist.scope,
    pairs: worklist.pairs.map((p) => ({ ...p, verdict: null as VerdictKind | null, note: "" })),
  };
  writeFileSync(join(runDir, "VERIFY.todo.json"), JSON.stringify(todo, null, 2));
  writeFileSync(join(runDir, "VERIFY.md"), renderWorklistMd(worklist, pairs.length, dropped));
  return worklist;
}

function renderWorklistMd(wl: ReviewWorklist, total: number, dropped: (ClaimEvidencePair & { score: number })[]): string {
  const out: string[] = [];
  out.push(`# Claim-support review worklist`);
  out.push("");
  out.push(
    `For each pair, open the cited evidence and judge whether it **supports** the claim. ` +
      `In \`VERIFY.todo.json\`, set each \`verdict\` to one of supported · partial · refuted · unsupported, ` +
      `add a short \`note\`, save it (e.g. as \`verdicts.json\`), then run ` +
      `\`construct review --apply verdicts.json --out <run>\`.`,
  );
  if (dropped.length) {
    out.push("");
    out.push(`> **DROPPED (--max-review): ${dropped.length} of ${total} pair(s) are NOT in this worklist and will NOT be adjudicated.**`);
    out.push(`> Their claims can pass \`check --semantic\` without their evidence ever being judged.`);
    out.push(`> Re-run \`construct review\` without --max-review to review everything. Dropped:`);
    for (const d of dropped) out.push(`> - ${d.claimId} · ${d.evidenceId} (${d.source})`);
  }
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

// The persisted worklist (VERIFY.todo.json), or null when it is absent/corrupt —
// a corrupt worklist must not block applying real verdicts (see the
// cross-reference below).
function readWorklist(runDir: string): { pairs: ClaimEvidencePair[]; scope: string[] | null } | null {
  const todoPath = join(runDir, "VERIFY.todo.json");
  if (!existsSync(todoPath)) return null;
  try {
    const todo = JSON.parse(readFileSync(todoPath, "utf8")) as { pairs?: ClaimEvidencePair[]; scope?: unknown };
    return {
      pairs: (todo.pairs ?? []).filter((p) => !!p && typeof p.claimId === "string" && typeof p.evidenceId === "string"),
      // A worklist written before `scope` existed carries none: the caller then
      // cannot tell a capped-away pair from a newly cited one, and says so
      // instead of inventing coverage.
      scope: Array.isArray(todo.scope) && todo.scope.every((k) => typeof k === "string") ? (todo.scope as string[]) : null,
    };
  } catch {
    return null;
  }
}

/**
 * The pair keys the last `construct review` actually looked at: its recorded
 * `scope` (kept + capped-away pairs), or — for a pre-scope worklist — the rows it
 * lists. Empty when there is no readable worklist.
 *
 * A pair the CURRENT SRD cites that is in neither this set nor the ledger has
 * never been through a review at all, which is not the same as an explicitly
 * capped one.
 */
export function reviewedScope(runDir: string): Set<string> {
  const wl = readWorklist(runDir);
  if (!wl) return new Set();
  return new Set(wl.scope ?? wl.pairs.map((p) => pairKey(p.claimId, p.evidenceId)));
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

  // The worklist the agent judged. Read BEFORE reducing: it supplies both the
  // dropped-pair cross-reference below and the fingerprint of a FRAGMENT verdict
  // (the orchestrated claim-reviewers emit claimId/evidenceId/verdict/note only,
  // so their binding lives in the worklist row they were dispatched from).
  const worklist = readWorklist(runDir);
  const todoPairs = worklist?.pairs ?? [];
  const current = currentPairFingerprints(runDir);
  const todoFingerprint = new Map<string, string>();
  for (const p of todoPairs) {
    if (typeof p.fingerprint === "string" && p.fingerprint) {
      if (current && current.get(pairKey(p.claimId, p.evidenceId)) !== p.fingerprint) {
        throw new Error(`VERIFY.todo.json is stale: ${p.claimId}·${p.evidenceId} content has changed. Re-run construct review and re-adjudicate.`);
      }
      // Only the saved generation-time binding may supply a fragment's hash.
      // If current content cannot be derived, leave the fragment unbound.
      if (current) todoFingerprint.set(pairKey(p.claimId, p.evidenceId), p.fingerprint);
    }
  }

  const verdicts: ClaimVerdict[] = [];
  const seen = new Set<string>();
  const key = pairKey;
  for (const v of list as any[]) {
    if (!v || typeof v.claimId !== "string" || typeof v.evidenceId !== "string") continue;
    const verdict = VALID_VERDICTS.includes(v.verdict) ? (v.verdict as VerdictKind) : (undefined as unknown as VerdictKind);
    const k = key(v.claimId, v.evidenceId);
    verdicts.push({
      claimId: v.claimId,
      kind: v.kind,
      claim: typeof v.claim === "string" ? v.claim : "",
      evidenceId: v.evidenceId,
      source: v.source,
      digest: typeof v.digest === "string" ? v.digest : "",
      fingerprint: typeof v.fingerprint === "string" && v.fingerprint ? v.fingerprint : todoFingerprint.get(k),
      verdict,
      note: typeof v.note === "string" ? v.note : "",
    });
    seen.add(k);
  }

  // Cross-reference the worklist (VERIFY.todo.json): a claim↔evidence pair DROPPED
  // from the verdicts file is surfaced as unadjudicated, never silently passed —
  // omitting a load-bearing pair must not read as "every cited claim supported".
  for (const p of todoPairs) {
    if (seen.has(key(p.claimId, p.evidenceId))) continue;
    verdicts.push({
      claimId: p.claimId,
      kind: p.kind,
      claim: p.claim ?? "",
      evidenceId: p.evidenceId,
      source: p.source,
      digest: p.digest ?? "",
      fingerprint: todoFingerprint.get(key(p.claimId, p.evidenceId)),
      verdict: undefined as unknown as VerdictKind,
      note: "",
    });
    seen.add(key(p.claimId, p.evidenceId));
  }

  // Staleness, bound to CONTENT. A verdict whose fingerprint no longer matches
  // the pair the SRD + dossier imply right now judged text that has since been
  // edited (or a pair that no longer exists) — applying it would launder a stale
  // review into a fresh-looking ledger, so refuse and write nothing.
  if (current) {
    const stale = verdicts
      .filter((v) => v.fingerprint && current.get(key(v.claimId, v.evidenceId)) !== v.fingerprint)
      .map((v) => `${v.claimId}·${v.evidenceId}`)
      .sort();
    if (stale.length) {
      const shown = stale.slice(0, 5).join(", ");
      const more = stale.length > 5 ? ` (+${stale.length - 5} more)` : "";
      throw new Error(
        `${stale.length} verdict(s) judge claim/evidence content that has CHANGED since the worklist was generated: ${shown}${more} — ` +
          `the SRD or its dossier was edited after the review (SRD.generatedAt alone does not detect this, since \`render --from-srd\` preserves it). ` +
          `VERIFY.json was NOT written: re-run \`construct review --out ${runDir}\` and re-adjudicate the refreshed worklist.`,
      );
    }

    // The pair SET must also still be the reviewed one. A claim (or a new
    // citation on an existing claim) added after the worklist was generated is a
    // pair nobody has judged, and the per-verdict check above cannot see it —
    // there is no verdict for it to invalidate. Only meaningful against a
    // recorded `scope`, which already includes the pairs an explicit
    // `--max-review` cap dropped, so a capped review stays applicable.
    if (worklist?.scope) {
      const inScope = new Set(worklist.scope);
      const added = [...current.keys()].filter((k) => !inScope.has(k)).sort();
      if (added.length) {
        const shown = added
          .slice(0, 5)
          .map((k) => k.replace("::", "·"))
          .join(", ");
        const more = added.length > 5 ? ` (+${added.length - 5} more)` : "";
        throw new Error(
          `${added.length} claim↔evidence pair(s) are cited by the SRD but absent from the worklist these verdicts came from: ${shown}${more} — ` +
            `the SRD gained citations after \`construct review\` ran, so the worklist no longer describes the run. ` +
            `VERIFY.json was NOT written: re-run \`construct review --out ${runDir}\` and adjudicate the refreshed worklist.`,
        );
      }
    }
  }

  // NOTE: a verdict that still carries no fingerprint here (hand-written, or from
  // a pre-binding worklist) is written AS-IS, unbound. It is deliberately NOT
  // bound to whatever is on disk now: minting a fresh fingerprint would make an
  // old review look like it had judged the current claims. `check --semantic`
  // fails closed on an unbound ledger and asks for a real re-review.

  const result = reduceVerdicts(verdicts);
  // Stamp the SRD these verdicts judge, so `check --semantic` can refuse to
  // certify a re-rendered SRD with stale adjudications.
  const srdGeneratedAt = readSrdGeneratedAt(runDir);
  writeFileSync(join(runDir, "VERIFY.json"), JSON.stringify({ ...result, ...(srdGeneratedAt ? { srdGeneratedAt } : {}), verdicts }, null, 2));
  return { ...result, ...(srdGeneratedAt ? { srdGeneratedAt } : {}) };
}

/**
 * Rank pairs on a scale that is comparable ACROSS sources.
 *
 * Raw retrieval scores are not comparable: an `oss` item scores the cloned
 * repo's file count (thousands), a `so` item scores StackOverflow votes (which
 * can be negative), `market`/`docs` items score keyword coverage (1–8), and
 * GitLab issues score a hardcoded 0. Sorting the pooled list by raw score
 * therefore let a single OSS repo outrank every documentation and issue pair —
 * so `--max-review N` dropped exactly the evidence most worth adjudicating.
 *
 * Ranking within each source and mapping to a percentile makes "best market
 * page" and "best StackOverflow answer" comparable, which is what the cap needs.
 * Equal raw scores keep an equal percentile.
 */
function normalizedRank(pairs: { source: string; score: number }[]): (p: { source: string; score: number }) => number {
  const bySource = new Map<string, number[]>();
  for (const p of pairs) {
    const list = bySource.get(p.source) ?? [];
    list.push(p.score);
    bySource.set(p.source, list);
  }
  // Distinct scores, best first, per source.
  const ordered = new Map<string, number[]>();
  for (const [src, scores] of bySource) {
    ordered.set(
      src,
      [...new Set(scores)].sort((a, b) => b - a),
    );
  }
  return (p) => {
    const scale = ordered.get(p.source);
    if (!scale || scale.length <= 1) return 1;
    const i = scale.indexOf(p.score);
    return i < 0 ? 0 : 1 - i / (scale.length - 1);
  };
}

/** The current SRD's `generatedAt`, or undefined when there is no readable SRD. */
export function readSrdGeneratedAt(runDir: string): string | undefined {
  const p = join(runDir, "SRD.json");
  if (!existsSync(p)) return undefined;
  try {
    const srd = JSON.parse(readFileSync(p, "utf8")) as Partial<SRD>;
    return typeof srd.generatedAt === "string" ? srd.generatedAt : undefined;
  } catch {
    return undefined;
  }
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
  lines.push(
    !r.ok
      ? `  ✗ some claims are refuted or unsupported`
      : r.unadjudicated.length
        ? `  ✓ no refuted or unsupported claims (${r.unadjudicated.length} still unadjudicated — see above)`
        : `  ✓ every grounded claim is backed by its cited evidence`,
  );
  return lines.join("\n");
}
