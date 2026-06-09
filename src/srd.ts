import { join } from "node:path";
import { keywords } from "./util.js";
import { resolveRepo } from "./clone.js";
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

// Evidence sources allowed to ground each claim type. A *functional* requirement
// can legitimately rest on prior art OR market signal (a competitor offering the
// feature validates building it). A *non-functional* requirement is a technical
// quality — marketing pages must not ground it (otherwise a competitor FAQ
// "grounds" a performance NFR via incidental word overlap).
const GROUND_REQUIREMENT = ["market", "oss", "docs", "so", "issue", "pr"];
const GROUND_QUALITY = ["oss", "docs", "so", "issue", "pr"];

// Deterministic keyword-overlap match: return up to `n` evidence ids whose
// title+snippet share the most *distinctive* keywords with `text`. Matching is
// token-set membership (word boundaries, not substring), requires a real overlap
// (so a single generic token can't ground a claim), and de-duplicates by URL so
// two excerpts of the same page never both cite.
export function matchEvidence(text: string, evidence: EvidenceItem[], n: number, onlySources?: string[]): string[] {
  const kws = keywords(text).map((k) => k.toLowerCase());
  if (kws.length === 0) return [];
  // Require a meaningful overlap: at least min(2, #kw) distinctive tokens AND a
  // third of the query's tokens. A one-word query (e.g. a competitor name) needs
  // one hit; a long statement needs several — this drops generic-word noise.
  const need = Math.min(2, kws.length);
  const ratioFloor = 0.34;

  const scored = evidence
    .filter((e) => !onlySources || onlySources.includes(e.source))
    .map((e) => {
      const hay = new Set(keywords(`${e.title} ${e.snippet}`).map((k) => k.toLowerCase()));
      let cov = 0;
      for (const kw of kws) if (hay.has(kw)) cov++;
      return { id: e.id, url: e.url ?? "", cov, ratio: cov / kws.length, score: e.score };
    })
    .filter((x) => x.cov >= need && x.ratio >= ratioFloor)
    .sort((a, b) => b.cov - a.cov || b.ratio - a.ratio || b.score - a.score || a.id.localeCompare(b.id));

  // De-dupe by canonical URL (keep the highest-ranked excerpt of any one page).
  const seenUrl = new Set<string>();
  const out: string[] = [];
  for (const x of scored) {
    if (x.url && seenUrl.has(x.url)) continue;
    if (x.url) seenUrl.add(x.url);
    out.push(x.id);
    if (out.length >= n) break;
  }
  return out;
}

// Required NFR categories per level. The hard `check` enforces these are present.
const REQUIRED_NFR: Record<Level, string[]> = {
  light: ["performance", "security", "reliability"],
  complex: ["performance", "security", "reliability", "usability", "observability", "cost"],
};

// Keyword signals that link a functional requirement to a non-core NFR category,
// so the traceability matrix carries real per-FR signal (privacy/a11y stop being
// orphaned).
const NFR_SIGNALS: Record<string, RegExp> = {
  privacy: /privac|gdpr|personal data|consent|self[- ]?host|own (your|the) data|no account/i,
  accessibility: /accessib|a11y|screen reader|wcag|keyboard/i,
  security: /auth|login|password|secret|token|encrypt|credential|account/i,
  performance: /fast|latenc|speed|sub-?second|under \d+ ?(s|sec|second|ms|minute)/i,
  reliability: /reliab|availab|recover|double-?book|never|busy|conflict|sync/i,
  observability: /log|metric|trace|monitor|audit/i,
  usability: /usab|onboard|guest|no account|widget|embed|reminder/i,
  cost: /cost|budget|cheap|self[- ]?host/i,
  i18n: /locale|i18n|timezone|language|translat/i,
};

// Integration nouns that signal an external boundary (used for system context,
// the FR→data-ADR trace, and failure-path acceptance criteria).
const INTEGRATION_RE = /calendar|caldav|google|ical|ics|sync|webhook|email|smtp|sms|widget|iframe|embed|oauth|payment|api/i;
const PERSIST_RE = /persist|store|database|datastore|save|record|booking|event|schedul|inventory|history/i;

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
// deterministic. The caller stamps generatedAt.
export function buildSRD(brief: Brief, evidence: EvidenceItem[], opts: { level: Level; generatedAt: string }): SRD {
  const level = opts.level;
  const productName = brief.product.name || titleFromIdea(brief.idea);
  const compliance = brief.constraints.compliance ?? [];
  const selfHost = /self[- ]?host|privacy|gdpr|own (your|the) data/i.test(`${brief.idea} ${brief.product.valueProp ?? ""}`) || compliance.length > 0;
  const timeGoal = timeTokenFromGoals(brief.goals);

  // --- Non-functional requirements: required core + brief priorities. -------
  const categories: string[] = [];
  for (const c of REQUIRED_NFR[level]) if (!categories.includes(c)) categories.push(c);
  for (const c of brief.nfrPriorities) {
    const k = c.toLowerCase().trim();
    if (k && !categories.includes(k)) categories.push(k);
  }
  const nonFunctional: NFR[] = categories.map((cat, i) => {
    const t = nfrFor(cat);
    const metric = specialiseMetric(cat, t.metric, { compliance, selfHost, timeGoal });
    const statement = specialiseStatement(cat, t.statement, { compliance, selfHost });
    return {
      id: `NFR-${pad3(i + 1)}`,
      category: cat,
      statement,
      metric,
      // Ground over the *specialised* text + distinctive brief facts (CalDAV,
      // GDPR…), restricted to authoritative sources (no marketing pages).
      rationaleEvidence: matchEvidence(`${cat} ${statement} ${brief.candidateTech.join(" ")} ${compliance.join(" ")}`, evidence, 1, GROUND_QUALITY),
    };
  });
  const coreNfrIds = nonFunctional.filter((n) => REQUIRED_NFR.light.includes(n.category.toLowerCase())).map((n) => n.id);

  // --- Architecture decision records. --------------------------------------
  const adrs: ADR[] = [];
  const stack = brief.candidateTech.length ? brief.candidateTech.join(", ") : "a stack to be selected";
  adrs.push({
    id: "",
    title: "Primary technology stack",
    status: brief.candidateTech.length ? "accepted" : "proposed",
    context: `Building "${productName}" requires a stack that fits the team (${brief.constraints.team || "to be defined"}) and timeline (${brief.constraints.timeline || "to be defined"}).`,
    decision: `Adopt ${stack} as the primary stack for the initial build.`,
    consequences: `The team commits to ${stack}; hiring, tooling and operational knowledge align to it. Revisit if a hard requirement is unmet.`,
    alternatives: brief.candidateTech.length
      ? "No explicit alternative stack was provided in the brief; evaluate one comparable option before locking this in."
      : "Alternative stacks were considered but not selected.",
    evidence: matchEvidence(`${stack} architecture stack`, evidence, 2, ["docs", "oss", "so"]),
  });
  if (selfHost) {
    adrs.push({
      id: "",
      title: "Self-hosting and data-ownership model",
      status: "accepted",
      context: `"${productName}" is positioned as privacy-first / self-hostable${compliance.length ? ` and must satisfy: ${compliance.join(", ")}` : ""}.`,
      decision: "Ship as a self-hostable deployment where the host owns all data; no user data is sent to a third-party service by default.",
      consequences: "Data residency and compliance become the host's responsibility (a feature, not a liability); the product must run with no mandatory external dependencies and document its data flows.",
      alternatives: "A hosted multi-tenant SaaS was considered but rejected as it conflicts with the privacy/data-ownership value proposition.",
      evidence: matchEvidence(`self-host privacy data ownership ${compliance.join(" ")}`, evidence, 2, GROUND_QUALITY),
    });
  }
  const integrates = brief.featureWishlist.some((f) => INTEGRATION_RE.test(`${f.title} ${f.notes ?? ""}`)) || INTEGRATION_RE.test(brief.idea);
  if (level === "complex" && (PERSIST_RE.test(briefText(brief)) || integrates)) {
    adrs.push({
      id: "",
      title: "Data persistence and integration approach",
      status: "proposed",
      context: `"${productName}" must persist state and integrate with external services (${brief.candidateTech.filter((t) => INTEGRATION_RE.test(t)).join(", ") || "calendar/email and similar"}) reliably.`,
      decision: "Use a single primary datastore with explicit, versioned integration boundaries for each external service.",
      consequences: "A clear data-ownership model; integrations are testable in isolation behind an adapter. Cross-service consistency must be designed explicitly.",
      alternatives: "A polyglot-persistence or event-sourced approach was considered; deferred until scale demands it.",
      evidence: matchEvidence(`${brief.candidateTech.join(" ")} database persistence integration`, evidence, 2, ["docs", "oss", "so"]),
    });
  }
  adrs.forEach((a, i) => (a.id = pad4(i + 1)));
  const stackAdrId = adrs[0]!.id;
  const dataAdr = adrs.find((a) => /persistence|integration/i.test(a.title));
  const privacyAdr = adrs.find((a) => /self-hosting|data-ownership/i.test(a.title));

  // --- Functional requirements from the feature wishlist. -------------------
  const functional: FR[] = brief.featureWishlist.map((f, i) => {
    const priority = priorityOf(f.priority);
    const text = `${f.title} ${f.notes ?? ""}`;
    const touchesIntegration = INTEGRATION_RE.test(text);
    const outcome = concreteOutcome(f.title, f.notes);
    const acceptance = [
      {
        given: `${productName} is available to a user`,
        when: `they ${lowerFirst(f.title)}`,
        then: outcome,
      },
      ...(level === "complex"
        ? [failurePath(f.title, touchesIntegration)]
        : []),
    ];
    // Per-FR NFR linkage: the required core + any non-core NFR the FR's text
    // signals (so privacy/a11y/etc. stop being orphaned).
    const nfrs = [...coreNfrIds];
    for (const n of nonFunctional) {
      if (coreNfrIds.includes(n.id)) continue;
      const sig = NFR_SIGNALS[n.category.toLowerCase()];
      if (sig && sig.test(text)) nfrs.push(n.id);
    }
    return {
      id: `FR-${pad3(i + 1)}`,
      title: f.title,
      description: f.notes?.trim() || `The product lets a user ${lowerFirst(f.title)}.`,
      priority,
      acceptance,
      rationaleEvidence: matchEvidence(text, evidence, 2, GROUND_REQUIREMENT),
      entities: [],
      interfaces: [],
      nfrs,
      unresolved: false,
    };
  });

  // --- Competitive landscape (notes derived from the matched evidence). -----
  const evById = new Map(evidence.map((e) => [e.id, e]));
  const competitors: CompetitorRow[] = brief.competitors.map((name) => {
    const ev = matchEvidence(name, evidence, 2, ["market"]);
    return { name, note: noteFrom(ev, evById) || `Comparable product / alternative to "${productName}".`, evidence: ev };
  });
  const ossByKey = new Map<string, OssRow>();
  const keyOf = (s: string) => {
    try {
      return resolveRepo(s).slug;
    } catch {
      return s.toLowerCase();
    }
  };
  for (const seed of brief.ossSeeds) {
    const ref = resolveRepo(seed);
    const label = ref.owner && ref.repo ? `${ref.owner}/${ref.repo}` : seed;
    const ev = matchEvidence(`${ref.owner ?? ""} ${ref.repo ?? ""}`.trim() || seed, evidence, 2, ["oss", "issue", "pr"]);
    ossByKey.set(keyOf(seed), { name: label, url: ref.webUrl ?? (/^https?:/.test(seed) ? seed : undefined), note: noteFrom(ev, evById) || "Seed OSS project mined for prior art.", evidence: ev });
  }
  for (const e of evidence.filter((x) => x.source === "oss")) {
    const k = keyOf(e.ref);
    if (ossByKey.has(k)) {
      if (!ossByKey.get(k)!.evidence.includes(e.id)) ossByKey.get(k)!.evidence.push(e.id);
      continue;
    }
    ossByKey.set(k, { name: e.title.replace(/ —.*$/, ""), url: e.url, note: firstSentence(e.snippet) || "Comparable open-source project (prior art).", evidence: [e.id] });
  }
  const oss = [...ossByKey.values()];

  // --- Build plan: milestones grouped by priority, risks from prior art. ----
  const buildPlan = buildMilestones(functional, brief, evidence, evById);

  // --- Traceability matrix (per-FR NFRs + the ADRs the FR actually touches). -
  const traceability: TraceRow[] = functional.map((fr) => {
    const text = `${fr.title} ${fr.description}`;
    const adrIds = [stackAdrId];
    if (dataAdr && (PERSIST_RE.test(text) || INTEGRATION_RE.test(text))) adrIds.push(dataAdr.id);
    if (privacyAdr && NFR_SIGNALS.privacy!.test(text)) adrIds.push(privacyAdr.id);
    return { fr: fr.id, nfrs: fr.nfrs, adrs: adrIds, entities: fr.entities, interfaces: fr.interfaces };
  });

  // --- Evidence index. -----------------------------------------------------
  const referenced = new Set<string>();
  for (const fr of functional) fr.rationaleEvidence.forEach((id) => referenced.add(id));
  for (const n of nonFunctional) n.rationaleEvidence.forEach((id) => referenced.add(id));
  for (const a of adrs) a.evidence.forEach((id) => referenced.add(id));
  for (const c of competitors) c.evidence.forEach((id) => referenced.add(id));
  for (const o of oss) o.evidence.forEach((id) => referenced.add(id));
  for (const m of buildPlan) (m.risks ?? []).forEach((r) => citationsIn(r).forEach((id) => referenced.add(id)));
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

// A concrete positive-path outcome: prefer a real clause from the notes; never
// emit the old tautology.
function concreteOutcome(title: string, notes?: string): string {
  const n = (notes ?? "").trim();
  // Capture the predicate AFTER the trigger word (not including it, so we don't
  // splice a double-modal like "succeeds and must …"), up to the first
  // sub-clause boundary (so a mid-string ';' can't leak through).
  const m = /\b(?:never|always|so that|so it|must|should|guarantee[sd]?|ensure[sd]?|without)\b\s+([^.;,]{4,})/i.exec(n);
  if (m && m[1]) {
    const clause = m[1].split(/[;,]/)[0]!.trim().replace(/\s+/g, " ");
    if (clause.length > 3) return `the action succeeds and ${lowerFirst(clause)}`;
  }
  const t = /\bin under [^.;,]+/i.exec(n);
  if (t) return `the action completes ${t[0].trim().replace(/\s+/g, " ")}`;
  return `the result of "${title.toLowerCase()}" is persisted and visible to the user`;
}

// A failure-path criterion, made concrete for external-integration features.
function failurePath(title: string, integration: boolean): { given: string; when: string; then: string } {
  if (integration) {
    return {
      given: `the external service required by "${title.toLowerCase()}" is unreachable or rejects the request`,
      when: `a user performs the action`,
      then: `the system surfaces a clear, specific error and makes no partial or inconsistent change`,
    };
  }
  return {
    given: `a user submits invalid or missing input for "${title.toLowerCase()}"`,
    when: `the action is submitted`,
    then: `the system rejects it with a clear, actionable error and no side effects`,
  };
}

function specialiseMetric(cat: string, base: string, ctx: { compliance: string[]; selfHost: boolean; timeGoal?: string }): string {
  const c = cat.toLowerCase();
  if ((c === "performance" || c === "usability") && ctx.timeGoal) {
    return `${base} Honour the product goal: ${ctx.timeGoal}.`;
  }
  if ((c === "privacy" || c === "security") && ctx.compliance.length) {
    return `${base} Comply with: ${ctx.compliance.join(", ")}.`;
  }
  return base;
}

function specialiseStatement(cat: string, base: string, ctx: { compliance: string[]; selfHost: boolean }): string {
  const c = cat.toLowerCase();
  if ((c === "privacy" || c === "security") && ctx.selfHost) {
    return `${base} No personal data leaves the self-hosted instance unless the host configures it.`;
  }
  return base;
}

function buildMilestones(functional: FR[], brief: Brief, evidence: EvidenceItem[], evById: Map<string, EvidenceItem>): Milestone[] {
  const groups: { key: Priority; title: string; outcome: string }[] = [
    { key: "must", title: "M1 — Walking skeleton (must-haves)", outcome: "A usable end-to-end slice covering every must-have requirement." },
    { key: "should", title: "M2 — Rounded product (should-haves)", outcome: "The product is complete enough for real users." },
    { key: "could", title: "M3 — Enhancements (could-haves)", outcome: "Nice-to-have capabilities that differentiate the product." },
  ];
  const priorPitfalls = evidence.filter((e) => e.source === "issue" || e.source === "pr");
  const out: Milestone[] = [];
  for (const g of groups) {
    const frs = functional.filter((f) => f.priority === g.key);
    if (frs.length === 0) continue;
    const risks: string[] = [];
    const text = frs.map((f) => `${f.title} ${f.description}`).join(" ");
    const matched = matchEvidence(text, priorPitfalls, 2);
    for (const id of matched) {
      const e = evById.get(id);
      if (e) risks.push(`Prior art shows a related pitfall: ${firstSentence(e.title)} [${id}]`);
    }
    out.push({ title: g.title, outcome: g.outcome, frIds: frs.map((f) => f.id), risks });
  }
  if (out.length === 0) out.push({ title: "M1 — Initial build", outcome: "Deliver the first usable version.", frIds: functional.map((f) => f.id), risks: [] });
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

// Enumerate the real external boundaries named in the brief, instead of a bare
// forward-reference.
function contextProse(name: string, brief: Brief): string {
  const actors = brief.product.users?.length ? brief.product.users : ["users"];
  const haystack = `${brief.idea} ${brief.candidateTech.join(" ")} ${brief.featureWishlist.map((f) => `${f.title} ${f.notes ?? ""}`).join(" ")}`;
  const boundaries: string[] = [];
  const add = (re: RegExp, label: string) => {
    if (re.test(haystack) && !boundaries.includes(label)) boundaries.push(label);
  };
  add(/calendar|caldav|ical|ics/i, "calendar systems (CalDAV/iCal)");
  add(/google/i, "Google APIs");
  add(/email|smtp/i, "an email/SMTP provider");
  add(/sms|twilio/i, "an SMS provider");
  add(/widget|iframe|embed/i, "external host sites (embed/iframe)");
  add(/payment|stripe|billing/i, "a payments provider");
  add(/webhook/i, "outbound webhooks");
  const stack = brief.candidateTech.length ? ` Built on ${brief.candidateTech.join(", ")}.` : "";
  const ext = boundaries.length ? ` It integrates with: ${boundaries.join("; ")}.` : "";
  return `"${name}" serves ${actors.join(", ")}.${stack}${ext} Each integration boundary is owned by an ADR and detailed in INTERFACES.md during authoring.`;
}

function noteFrom(ids: string[], evById: Map<string, EvidenceItem>): string | undefined {
  for (const id of ids) {
    const e = evById.get(id);
    const s = e ? firstSentence(e.snippet) : "";
    if (s) return s;
  }
  return undefined;
}

function firstSentence(s: string): string {
  const clean = s.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  // Match the EARLIEST sentence terminator (a genuine short first sentence like
  // "It is fast." must not be merged with the next sentence).
  const m = /^(.{1,200}?[.!?])(\s|$)/.exec(clean);
  return (m ? m[1]! : clean.slice(0, 160)).trim();
}

function timeTokenFromGoals(goals: string[]): string | undefined {
  for (const g of goals) {
    const m = /\b(?:in |under |within )?(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?)\b/i.exec(g);
    if (m) return `complete the primary task in under ${m[1]} ${m[2]!.toLowerCase()}`;
  }
  return undefined;
}

function briefText(brief: Brief): string {
  return `${brief.idea} ${brief.product.problem ?? ""} ${brief.featureWishlist.map((f) => `${f.title} ${f.notes ?? ""}`).join(" ")}`;
}

function citationsIn(s: string): string[] {
  const out: string[] = [];
  const re = /\[(E\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[1]!);
  return out;
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
