// Requirement-quality lint, anchored to ISO/IEC/IEEE 29148:2018.
//
// `check` used to detect exactly ONE templated acceptance criterion — the
// literal string `is persisted and visible to the user`. But `concreteOutcome`
// has four branches and only the fourth produced that string, `failurePath`
// emits pure boilerplate on EVERY requirement at `complex` level, and half a
// dozen other seeded phrasings (interface contracts, the default success metric,
// the default assumption) were never checked at all. At `complex` — the level
// that claims to certify build-readiness — an SRD could therefore pass the hard
// gate with most of its acceptance criteria un-authored.
//
// Two families of finding, with deliberately different severity:
//
//   SCAFFOLD — text only the renderer emits. Zero false positives by
//     construction (the same reasoning that lets the 🧠 callout hard-fail), so
//     it is an ERROR at `complex` and a warning at `light`.
//
//   VAGUE — a heuristic over hand-written prose. It can be wrong, so it always
//     WARNS. A heuristic that blocks a build is a heuristic people switch off.
//
// Every message names the 29148 characteristic it violates, so the finding is a
// standard to meet rather than a matter of taste.
import type { SRD } from "./types.js";

/** The ISO/IEC/IEEE 29148:2018 characteristics of a well-formed requirement. */
export type Characteristic = "unambiguous" | "verifiable" | "singular" | "complete" | "consistent" | "traceable" | "feasible";

export interface LintFinding {
  where: string; // e.g. "FR-003 acceptance #2"
  text: string; // the offending text, trimmed
  kind: "scaffold" | "vague";
  characteristic: Characteristic;
  fix: string;
}

interface Pattern {
  re: RegExp;
  characteristic: Characteristic;
  fix: string;
}

// Every phrasing the renderer itself can emit into an acceptance criterion's
// `then`. Kept in lockstep with srd.ts::concreteOutcome and srd.ts::failurePath —
// if you add a branch there, add its signature here.
const SCAFFOLD_THEN: Pattern[] = [
  {
    // concreteOutcome branch 4 — the pure tautology.
    re: /is persisted and visible to the user$/,
    characteristic: "verifiable",
    fix: "state the observable outcome: what exists, where, and within what bound",
  },
  {
    // concreteOutcome branch 1 — a clause lifted from the brief's notes.
    re: /^the action succeeds and /,
    characteristic: "verifiable",
    fix: "replace the generic 'the action succeeds' with the specific post-condition a test can assert",
  },
  {
    // concreteOutcome branch 2.
    re: /^the action completes in under /,
    characteristic: "verifiable",
    fix: "name what completes and what a caller observes, not only how long it took",
  },
  {
    // concreteOutcome branch 3.
    re: /^the outcome honours the stated bound: /,
    characteristic: "verifiable",
    fix: "spell the bound out as a post-condition on a named artifact",
  },
  {
    // failurePath, integration variant — emitted on every integration FR.
    re: /^the system surfaces a clear, specific error and makes no partial or inconsistent change$/,
    characteristic: "unambiguous",
    fix: "name the error the user sees, what is rolled back, and how they recover",
  },
  {
    // failurePath, plain variant — emitted on every other FR at complex.
    re: /^the system rejects it with a clear, actionable error and no side effects$/,
    characteristic: "unambiguous",
    fix: "name which input is rejected, the message, and what state is left untouched",
  },
];

// Words that describe an intention rather than an observable outcome. A `then`
// whose entire promise rests on one of these cannot be turned into a test.
// Deliberately short: every entry here is one no acceptance criterion should
// lean on, in any product.
const VAGUE_THEN: Pattern[] = [
  {
    re: /\b(gracefully|appropriately|properly|correctly|seamlessly|robustly|as (?:needed|appropriate|expected))\b/i,
    characteristic: "verifiable",
    fix: "say what specifically happens — 'handled gracefully' is not something a test can assert",
  },
  {
    re: /\b(and so on|etc\.?|and more|among others)\b/i,
    characteristic: "complete",
    fix: "enumerate the cases; an open-ended list leaves the builder guessing",
  },
  {
    re: /\b(fast|quick|slow|scalable|performant|efficient|reliable|secure|simple|intuitive|user-friendly)\b/i,
    characteristic: "unambiguous",
    fix: "replace the adjective with a number and a unit",
  },
];

// Seeded prose elsewhere in the SRD that the gate never looked at.
const SCAFFOLD_PROSE: { get: (srd: SRD) => { where: string; text: string }[]; re: RegExp; characteristic: Characteristic; fix: string }[] = [
  {
    get: (srd) => srd.architecture.interfaces.map((i) => ({ where: `interface "${i.name}"`, text: i.summary ?? "" })),
    re: /Define the contract \(operations, data, failure modes\) during authoring\.$/,
    characteristic: "complete",
    fix: "define the operations, payloads and failure modes of this boundary",
  },
  {
    get: (srd) => srd.product.metrics.map((m, i) => ({ where: `success metric #${i + 1}`, text: m })),
    re: /^Define a measurable launch success metric\.$/,
    characteristic: "verifiable",
    fix: "state the outcome and the number that would prove it",
  },
  {
    get: (srd) => srd.scope.assumptions.map((a, i) => ({ where: `assumption #${i + 1}`, text: a })),
    re: /^No hard constraints were captured; revisit budget, timeline and team before committing\.$/,
    characteristic: "feasible",
    fix: "capture the real budget/timeline/team constraints, or record that there are none",
  },
];

function match(text: string, patterns: Pattern[]): Pattern | undefined {
  return patterns.find((p) => p.re.test(text.trim()));
}

/**
 * Lint an SRD's requirement prose. Pure — the caller decides severity from the
 * level, exactly as the existing templated-criterion rule does.
 */
export function lintRequirements(srd: SRD): LintFinding[] {
  const out: LintFinding[] = [];

  for (const fr of srd.functional) {
    fr.acceptance.forEach((a, i) => {
      const then = (a.then ?? "").trim();
      if (!then) return;
      const where = `${fr.id} acceptance #${i + 1}`;
      const scaffold = match(then, SCAFFOLD_THEN);
      if (scaffold) {
        out.push({ where, text: then, kind: "scaffold", characteristic: scaffold.characteristic, fix: scaffold.fix });
        return; // one finding per criterion; the scaffold is the thing to fix first
      }
      const vague = match(then, VAGUE_THEN);
      if (vague) out.push({ where, text: then, kind: "vague", characteristic: vague.characteristic, fix: vague.fix });
    });
  }

  for (const group of SCAFFOLD_PROSE) {
    for (const { where, text } of group.get(srd)) {
      if (text && group.re.test(text.trim())) {
        out.push({ where, text: text.trim(), kind: "scaffold", characteristic: group.characteristic, fix: group.fix });
      }
    }
  }

  return out;
}

/** One line per finding, naming the standard it fails. */
export function formatFinding(f: LintFinding): string {
  const head = f.kind === "scaffold" ? "still the renderer's scaffold" : "not verifiable as written";
  return `${f.where}: ${head} [29148 §5.2.4 ${f.characteristic}] — "${truncate(f.text)}". Fix: ${f.fix}.`;
}

function truncate(s: string, n = 90): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
