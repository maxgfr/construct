import { join } from "node:path";
import { keywords } from "./util.js";
import { SRD_SCHEMA_VERSION } from "./types.js";
import type {
  Brief,
  EvidenceItem,
  Level,
  Priority,
  SRD,
  FR,
  NFR,
  ADR,
  CompetitorRow,
  OssRow,
  Milestone,
  TraceRow,
} from "./types.js";

export function srdManifestPath(runDir: string): string {
  return join(runDir, "SRD.json");
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}
function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

// Deterministic keyword-overlap match: return up to `n` evidence ids whose
// title+snippet share the most keywords with `text`. This auto-attaches the
// [E#] hooks at render time; the agent refines them during authoring.
export function matchEvidence(text: string, evidence: EvidenceItem[], n: number, onlySources?: string[]): string[] {
  const kws = keywords(text).map((k) => k.toLowerCase());
  if (kws.length === 0) return [];
  const scored = evidence
    .filter((e) => !onlySources || onlySources.includes(e.source))
    .map((e) => {
      const hay = `${e.title} ${e.snippet}`.toLowerCase();
      let cov = 0;
      for (const kw of kws) if (hay.includes(kw)) cov++;
      return { id: e.id, cov, score: e.score };
    })
    .filter((x) => x.cov > 0)
    .sort((a, b) => b.cov - a.cov || b.score - a.score || a.id.localeCompare(b.id));
  return scored.slice(0, n).map((x) => x.id);
}

// Required NFR categories per level. The hard `check` enforces these are present.
const REQUIRED_NFR: Record<Level, string[]> = {
  light: ["performance", "security", "reliability"],
  complex: ["performance", "security", "reliability", "usability", "observability", "cost"],
};

const NFR_TEMPLATES: Record<string, { statement: string; metric: string }> = {
  performance: {
    statement: "The system responds to primary user actions without perceptible delay under expected load.",
    metric: "p95 latency < 300 ms for core interactions at expected concurrency.",
  },
  security: {
    statement: "User data and credentials are protected in transit and at rest, with least-privilege access.",
    metric: "All endpoints authenticated/authorized; secrets never logged; dependencies scanned in CI.",
  },
  reliability: {
    statement: "The system degrades gracefully and recovers from transient failures without data loss.",
    metric: "Monthly availability ≥ 99.9%; no data loss on a single-node failure.",
  },
  usability: {
    statement: "A new user can complete the primary task without external help.",
    metric: "≥ 80% task-completion rate in unmoderated usability testing.",
  },
  observability: {
    statement: "Operators can diagnose failures from logs, metrics and traces without reproducing locally.",
    metric: "Structured logs + metrics on every request; alert on error-rate and latency SLO breach.",
  },
  cost: {
    statement: "Running cost scales sub-linearly with usage and stays within the stated budget.",
    metric: "Cost per active user tracked; infra cost within the budget constraint.",
  },
  scalability: {
    statement: "The system scales horizontally to handle growth without re-architecture.",
    metric: "Throughput scales near-linearly to 10× the launch load.",
  },
  accessibility: {
    statement: "The interface is usable with assistive technology and meets recognised accessibility guidelines.",
    metric: "WCAG 2.1 AA conformance on primary flows.",
  },
  privacy: {
    statement: "Personal data is collected lawfully, minimised, and removable on request.",
    metric: "Data-retention policy enforced; export/delete available for user data.",
  },
  i18n: {
    statement: "The product supports multiple locales without code changes.",
    metric: "All user-facing copy externalised; locale switch covers core flows.",
  },
  maintainability: {
    statement: "The codebase is testable, documented, and changeable by a new contributor.",
    metric: "Test coverage gate in CI; onboarding to first PR within a day.",
  },
};

function nfrFor(category: string): { statement: string; metric: string } {
  const key = category.toLowerCase().trim();
  return (
    NFR_TEMPLATES[key] ?? {
      statement: `The system meets the "${category}" quality expectation defined for this product.`,
      metric: `A measurable target for "${category}" is agreed and tracked.`,
    }
  );
}

function priorityOf(p: Priority | undefined): Priority {
  return p === "must" || p === "should" || p === "could" ? p : "should";
}

// Build the in-memory SRD model from a brief + the evidence dossier. Pure and
// deterministic: same inputs → same output (no timestamps in the body; the
// caller stamps generatedAt). This is the keystone the renderer and `check`
// both rely on.
export function buildSRD(brief: Brief, evidence: EvidenceItem[], opts: { level: Level; generatedAt: string }): SRD {
  const level = opts.level;
  const productName = brief.product.name || titleFromIdea(brief.idea);
  const userLabel = brief.product.users?.[0] || "user";

  // --- Non-functional requirements: required core + brief priorities. -------
  const categories: string[] = [];
  for (const c of REQUIRED_NFR[level]) if (!categories.includes(c)) categories.push(c);
  for (const c of brief.nfrPriorities) {
    const k = c.toLowerCase().trim();
    if (k && !categories.includes(k)) categories.push(k);
  }
  const nonFunctional: NFR[] = categories.map((cat, i) => {
    const t = nfrFor(cat);
    return {
      id: `NFR-${pad3(i + 1)}`,
      category: cat,
      statement: t.statement,
      metric: t.metric,
      rationaleEvidence: matchEvidence(`${cat} ${t.statement}`, evidence, 1),
    };
  });
  // The core NFR ids every functional requirement is expected to honour.
  const coreNfrIds = nonFunctional
    .filter((n) => REQUIRED_NFR.light.includes(n.category.toLowerCase()))
    .map((n) => n.id);

  // --- Functional requirements from the feature wishlist. -------------------
  const functional: FR[] = brief.featureWishlist.map((f, i) => {
    const priority = priorityOf(f.priority);
    const acceptance = [
      {
        given: `${productName} is available to a ${userLabel}`,
        when: `they ${lowerFirst(f.title)}`,
        then: `the system fulfils the requirement and reflects the result`,
      },
      ...(level === "complex"
        ? [
            {
              given: `a ${userLabel} attempts to ${lowerFirst(f.title)} with invalid or missing input`,
              when: `the action is submitted`,
              then: `the system rejects it with a clear, actionable error and no side effects`,
            },
          ]
        : []),
    ];
    return {
      id: `FR-${pad3(i + 1)}`,
      title: f.title,
      description: f.notes?.trim() || `The product lets a ${userLabel} ${lowerFirst(f.title)}.`,
      priority,
      acceptance,
      rationaleEvidence: matchEvidence(`${f.title} ${f.notes ?? ""}`, evidence, 2),
      entities: [],
      interfaces: [],
      nfrs: coreNfrIds,
      unresolved: false,
    };
  });

  // --- Architecture decision records. --------------------------------------
  const adrs: ADR[] = [];
  const stack = brief.candidateTech.length ? brief.candidateTech.join(", ") : "a stack to be selected";
  adrs.push({
    id: pad4(1),
    title: "Primary technology stack",
    status: brief.candidateTech.length ? "accepted" : "proposed",
    context: `Building "${productName}" requires a stack that fits the team (${brief.constraints.team || "to be defined"}) and timeline (${brief.constraints.timeline || "to be defined"}).`,
    decision: `Adopt ${stack} as the primary stack for the initial build.`,
    consequences: `The team commits to ${stack}; hiring, tooling and operational knowledge align to it. Revisit if a hard requirement is unmet.`,
    alternatives: brief.competitors.length
      ? `Stacks observed in comparable products: ${brief.competitors.join(", ")}.`
      : "Alternative stacks were considered but not selected.",
    evidence: matchEvidence(`${stack} architecture stack`, evidence, 2, ["docs", "oss", "so"]),
  });
  if (level === "complex") {
    adrs.push({
      id: pad4(2),
      title: "Data persistence and integration approach",
      status: "proposed",
      context: `"${productName}" must persist state and integrate with external services reliably.`,
      decision: "Use a single primary datastore with explicit, versioned integration boundaries.",
      consequences: "A clear data ownership model; integrations are testable in isolation. Cross-service consistency must be designed explicitly.",
      alternatives: "A polyglot-persistence or event-sourced approach was considered; deferred until scale demands it.",
      evidence: matchEvidence("database persistence integration", evidence, 2, ["docs", "oss", "so"]),
    });
  }

  // --- Competitive landscape. ----------------------------------------------
  const competitors: CompetitorRow[] = brief.competitors.map((name) => ({
    name,
    note: `Comparable product / alternative to "${productName}".`,
    evidence: matchEvidence(name, evidence, 2, ["market"]),
  }));
  const ossEvidence = evidence.filter((e) => e.source === "oss" || e.source === "issue" || e.source === "pr");
  const ossByRef = new Map<string, OssRow>();
  for (const seed of brief.ossSeeds) {
    ossByRef.set(seed, { name: seed, url: /^https?:/.test(seed) ? seed : undefined, note: "Seed OSS project to mine for prior art.", evidence: matchEvidence(seed, evidence, 2) });
  }
  for (const e of ossEvidence.filter((x) => x.source === "oss")) {
    if (!ossByRef.has(e.ref)) {
      ossByRef.set(e.ref, { name: e.title.replace(/ —.*$/, ""), url: e.url, note: "Comparable open-source project (prior art).", evidence: [e.id] });
    }
  }
  const oss: OssRow[] = [...ossByRef.values()];

  // --- Build plan: milestones grouped by priority. -------------------------
  const buildPlan: Milestone[] = buildMilestones(functional);

  // --- Traceability matrix. ------------------------------------------------
  const traceability: TraceRow[] = functional.map((fr) => ({
    fr: fr.id,
    nfrs: fr.nfrs,
    adrs: [adrs[0]!.id],
    entities: fr.entities,
    interfaces: fr.interfaces,
  }));

  // --- Evidence index: every [E#] the SRD references. ----------------------
  const referenced = new Set<string>();
  for (const fr of functional) fr.rationaleEvidence.forEach((id) => referenced.add(id));
  for (const n of nonFunctional) n.rationaleEvidence.forEach((id) => referenced.add(id));
  for (const a of adrs) a.evidence.forEach((id) => referenced.add(id));
  for (const c of competitors) c.evidence.forEach((id) => referenced.add(id));
  for (const o of oss) o.evidence.forEach((id) => referenced.add(id));
  const evidenceIndex = [...referenced].sort((a, b) => evNum(a) - evNum(b));

  return {
    schemaVersion: SRD_SCHEMA_VERSION,
    level,
    generatedAt: opts.generatedAt,
    product: {
      name: productName,
      problem: brief.product.problem || brief.goals[0] || `Address the need described by: ${brief.idea}`,
      valueProp: brief.product.valueProp || `Deliver ${brief.idea} better than existing options.`,
      users: brief.product.users?.length ? brief.product.users : ["primary user"],
      metrics: brief.goals.length ? brief.goals : ["Define a measurable launch success metric."],
    },
    scope: {
      inScope: brief.featureWishlist.filter((f) => priorityOf(f.priority) !== "could").map((f) => f.title),
      outOfScope: brief.nonGoals,
      assumptions: deriveAssumptions(brief),
    },
    functional,
    nonFunctional,
    architecture: { context: contextProse(productName, brief), dataModel: [], interfaces: [], adrs },
    competitive: { competitors, oss },
    buildPlan,
    traceability,
    openQuestions: brief.openQuestions,
    evidenceIndex,
  };
}

function buildMilestones(functional: FR[]): Milestone[] {
  const groups: { key: Priority; title: string; outcome: string }[] = [
    { key: "must", title: "M1 — Walking skeleton (must-haves)", outcome: "A usable end-to-end slice covering every must-have requirement." },
    { key: "should", title: "M2 — Rounded product (should-haves)", outcome: "The product is complete enough for real users." },
    { key: "could", title: "M3 — Enhancements (could-haves)", outcome: "Nice-to-have capabilities that differentiate the product." },
  ];
  const out: Milestone[] = [];
  for (const g of groups) {
    const frIds = functional.filter((f) => f.priority === g.key).map((f) => f.id);
    if (frIds.length === 0) continue;
    out.push({ title: g.title, outcome: g.outcome, frIds, risks: [] });
  }
  if (out.length === 0) {
    out.push({ title: "M1 — Initial build", outcome: "Deliver the first usable version.", frIds: functional.map((f) => f.id), risks: [] });
  }
  return out;
}

function deriveAssumptions(brief: Brief): string[] {
  const a: string[] = [];
  if (brief.constraints.team) a.push(`The team is: ${brief.constraints.team}.`);
  if (brief.constraints.timeline) a.push(`The timeline is: ${brief.constraints.timeline}.`);
  if (brief.constraints.budget) a.push(`The budget is: ${brief.constraints.budget}.`);
  if (brief.constraints.compliance?.length) a.push(`Compliance applies: ${brief.constraints.compliance.join(", ")}.`);
  if (a.length === 0) a.push("No hard constraints were captured; revisit budget, timeline and team before committing.");
  return a;
}

function contextProse(name: string, brief: Brief): string {
  const integrations = brief.candidateTech.length ? ` It is expected to build on ${brief.candidateTech.join(", ")}.` : "";
  return `"${name}" is a new product that ${lowerFirst(brief.idea)}.${integrations} External services and integration boundaries are defined in the ADRs and refined during authoring.`;
}

function titleFromIdea(idea: string): string {
  const first = idea.split(/[.,;:]/)[0]?.trim() || idea.trim();
  return first.length > 40 ? first.slice(0, 40).trim() : first || "The Product";
}

function lowerFirst(s: string): string {
  const t = s.trim();
  return t ? t[0]!.toLowerCase() + t.slice(1) : t;
}

function evNum(id: string): number {
  const m = /^E(\d+)$/.exec(id);
  return m ? Number(m[1]) : 1e9;
}
