import { join } from "node:path";
import { keywords } from "./util.js";
import { resolveRepo } from "./clone.js";
import { SRD_SCHEMA_VERSION, REQUIRED_NFR, DESIGN_TOKEN_CATEGORIES, COMPONENT_STATES } from "./types.js";
import type {
  Brief,
  EvidenceItem,
  Level,
  Priority,
  SRD,
  FR,
  NFR,
  ADR,
  Entity,
  Interface,
  CompetitorRow,
  OssRow,
  Milestone,
  TraceRow,
  DesignSystem,
  DesignToken,
  UIComponent,
  Screen,
  UserFlow,
  A11yRequirement,
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
export const GROUND_REQUIREMENT = ["market", "oss", "docs", "so", "issue", "pr"];
export const GROUND_QUALITY = ["oss", "docs", "so", "issue", "pr"];

// Deterministic keyword-overlap match: return up to `n` evidence ids whose
// title+snippet share the most *distinctive* keywords with `text`. Matching is
// token-set membership (word boundaries, not substring), requires a real overlap
// (so a single generic token can't ground a claim), and de-duplicates on a
// stable key — the URL, or `source:ref` for url-less items (e.g. local-repo OSS
// summaries) — so two excerpts of one page/repo never both cite.
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
      return { id: e.id, key: e.url || `${e.source}:${e.ref}`, cov, ratio: cov / kws.length, score: e.score };
    })
    .filter((x) => x.cov >= need && x.ratio >= ratioFloor)
    .sort((a, b) => b.cov - a.cov || b.ratio - a.ratio || b.score - a.score || a.id.localeCompare(b.id));

  // De-dupe on the stable key (keep the highest-ranked excerpt of any one
  // page or url-less source like a local repo summary).
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of scored) {
    if (seen.has(x.key)) continue;
    seen.add(x.key);
    out.push(x.id);
    if (out.length >= n) break;
  }
  return out;
}

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

// ---------------------------------------------------------------------------
// Entity / interface inference. Deterministic heuristics over feature titles so
// DATA-MODEL.md and INTERFACES.md start seeded instead of blank; the rendered
// docs carry an explicit "inferred — verify" marker and the agent corrects
// during authoring. Attributes stay minimal and honest (never invented).
// ---------------------------------------------------------------------------

// Leading verbs commonly opening a feature title ("Save an article…"). Stripped
// so the direct object surfaces; also filtered out as entity candidates.
const FEATURE_VERBS = new Set([
  "create",
  "add",
  "manage",
  "book",
  "view",
  "send",
  "track",
  "sync",
  "edit",
  "delete",
  "list",
  "share",
  "export",
  "import",
  "search",
  "save",
  "read",
  "tag",
  "organize",
  "organise",
  "schedule",
  "upload",
  "download",
  "browse",
  "filter",
  "sort",
  "archive",
  "publish",
  "invite",
  "assign",
  "stream",
]);
// Words that name actions or qualities, not data — never entities.
const NON_ENTITY_WORDS = new Set(["search", "login", "signup", "support", "setup", "offline", "online", "mobile", "desktop", "full", "text", "user", "users"]);

function singularize(w: string): string {
  if (/ies$/.test(w)) return w.slice(0, -3) + "y";
  if (/(?:ches|shes|xes|zes|ses)$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w) && !/(?:ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

function titleCase(w: string): string {
  return w ? w[0]!.toUpperCase() + w.slice(1) : w;
}

// Candidate entity tokens of one feature title: singularized keywords minus
// verbs, action words, past/present participles, and brand/tech names from the
// brief (a competitor is prior art, not a data entity).
function entityTokens(title: string, exclude: Set<string>): { tokens: string[]; verbLed: boolean } {
  const words = keywords(title).map((w) => w.toLowerCase());
  const verbLed = words.length > 0 && FEATURE_VERBS.has(words[0]!);
  const rest = verbLed ? words.slice(1) : words;
  const tokens = rest
    .filter((w) => w.length >= 3 && !FEATURE_VERBS.has(w) && !NON_ENTITY_WORDS.has(w) && !/(?:ed|ing)$/.test(w))
    .map(singularize)
    .filter((w) => !exclude.has(w));
  return { tokens, verbLed };
}

// Infer core entities: a token is an entity when it recurs across features
// (shared nouns are the data the product is about) or is the direct object of a
// verb-led must-have. Mutates fr.entities symmetrically so the reference
// closure and the traceability matrix carry real signal.
function inferEntities(brief: Brief, functional: FR[]): Entity[] {
  const exclude = new Set(
    [...brief.competitors, ...brief.candidateTech, brief.product.name ?? ""].flatMap((s) => keywords(s).map((w) => singularize(w.toLowerCase()))),
  );
  const perFr = functional.map((fr) => ({ fr, ...entityTokens(fr.title, exclude) }));

  const freq = new Map<string, number>();
  for (const p of perFr) for (const t of new Set(p.tokens)) freq.set(t, (freq.get(t) ?? 0) + 1);

  const chosen = new Set<string>();
  for (const [t, n] of freq) if (n >= 2) chosen.add(t);
  for (const p of perFr) {
    if (p.verbLed && p.fr.priority === "must" && p.tokens[0]) chosen.add(p.tokens[0]);
  }

  const names = [...chosen].sort((a, b) => freq.get(b)! - freq.get(a)! || a.localeCompare(b)).slice(0, 8);

  const entities: Entity[] = names.map((n) => {
    const name = titleCase(n);
    const refs = perFr.filter((p) => p.tokens.includes(n)).map((p) => p.fr.id);
    return {
      name,
      attributes: [
        { name: "id", type: "identifier" },
        { name: "createdAt", type: "timestamp" },
      ],
      referencedByFRs: refs,
    };
  });
  for (const fr of functional) {
    fr.entities = entities.filter((e) => e.referencedByFRs.includes(fr.id)).map((e) => e.name);
  }
  return entities;
}

// External boundaries named in the brief — shared by the system-context prose
// and interface inference so the two never disagree.
interface BoundaryDef {
  re: RegExp;
  label: string; // prose label for SYSTEM-CONTEXT.md
  name: string; // interface name for INTERFACES.md
  kind: Interface["kind"];
}
const BOUNDARY_DEFS: BoundaryDef[] = [
  { re: /calendar|caldav|ical|ics/i, label: "calendar systems (CalDAV/iCal)", name: "Calendar Integration", kind: "api" },
  { re: /google/i, label: "Google APIs", name: "Google API Integration", kind: "api" },
  { re: /email|smtp/i, label: "an email/SMTP provider", name: "Email Delivery", kind: "api" },
  { re: /sms|twilio/i, label: "an SMS provider", name: "SMS Delivery", kind: "api" },
  { re: /widget|iframe|embed/i, label: "external host sites (embed/iframe)", name: "Embeddable Widget", kind: "ui" },
  { re: /payment|stripe|billing/i, label: "a payments provider", name: "Payments Integration", kind: "api" },
  { re: /webhook/i, label: "outbound webhooks", name: "Outbound Webhooks", kind: "event" },
  { re: /browser extension|chrome extension|firefox add-?on/i, label: "a browser extension", name: "Browser Extension", kind: "ui" },
];

function boundaryHaystack(brief: Brief): string {
  return `${brief.idea} ${brief.candidateTech.join(" ")} ${brief.featureWishlist.map((f) => `${f.title} ${f.notes ?? ""}`).join(" ")}`;
}

function detectBoundaries(brief: Brief): BoundaryDef[] {
  const haystack = boundaryHaystack(brief);
  return BOUNDARY_DEFS.filter((b) => b.re.test(haystack));
}

// Infer interfaces: one per detected external boundary, plus the primary UI
// surface when the brief names its users. Mutates fr.interfaces symmetrically.
function inferInterfaces(brief: Brief, functional: FR[]): Interface[] {
  const out: Interface[] = [];
  for (const b of detectBoundaries(brief)) {
    const related = functional.filter((fr) => b.re.test(`${fr.title} ${fr.description}`)).map((fr) => fr.id);
    out.push({
      name: b.name,
      kind: b.kind,
      summary: `Boundary with ${b.label}. Define the contract (operations, data, failure modes) during authoring.`,
      relatedFRs: related,
    });
  }
  if (brief.product.users?.length) {
    out.push({
      name: "Web App",
      kind: "ui",
      summary: `The primary user-facing surface through which ${brief.product.users.join(", ")} use the product.`,
      relatedFRs: functional.map((f) => f.id),
    });
  }
  for (const fr of functional) {
    fr.interfaces = out.filter((i) => i.relatedFRs.includes(fr.id)).map((i) => i.name);
  }
  return out;
}

// Build the in-memory SRD model from a brief + the evidence dossier. Pure and
// deterministic. The caller stamps generatedAt.
export function buildSRD(brief: Brief, evidence: EvidenceItem[], opts: { level: Level; generatedAt: string; design?: boolean }): SRD {
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
    const metric = specialiseMetric(cat, t.metric, { compliance, selfHost, timeGoal, budget: brief.constraints.budget });
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
      consequences:
        "Data residency and compliance become the host's responsibility (a feature, not a liability); the product must run with no mandatory external dependencies and document its data flows.",
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
      consequences:
        "A clear data-ownership model; integrations are testable in isolation behind an adapter. Cross-service consistency must be designed explicitly.",
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
      ...(level === "complex" ? [failurePath(f.title, touchesIntegration)] : []),
    ];
    // Per-FR NFR linkage: the required core + any non-core NFR the FR's text
    // signals (so privacy/a11y/etc. stop being orphaned).
    const nfrs = [...coreNfrIds];
    for (const n of nonFunctional) {
      if (coreNfrIds.includes(n.id)) continue;
      const sig = NFR_SIGNALS[n.category.toLowerCase()];
      if (sig?.test(text)) nfrs.push(n.id);
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

  // --- Data model + interfaces: inferred seeds (agent verifies during
  // authoring). Sets FR.entities / FR.interfaces symmetrically so the reference
  // closure and the traceability matrix are real from the first render.
  const dataModel = inferEntities(brief, functional);
  const interfaces = inferInterfaces(brief, functional);

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
    ossByKey.set(keyOf(seed), {
      name: label,
      url: ref.webUrl ?? (/^https?:/.test(seed) ? seed : undefined),
      note: noteFrom(ev, evById) || "Seed OSS project mined for prior art.",
      evidence: ev,
    });
  }
  for (const e of evidence.filter((x) => x.source === "oss")) {
    const k = keyOf(e.ref);
    if (ossByKey.has(k)) {
      if (!ossByKey.get(k)!.evidence.includes(e.id)) ossByKey.get(k)!.evidence.push(e.id);
      continue;
    }
    ossByKey.set(k, {
      name: e.title.replace(/ —.*$/, ""),
      url: e.url,
      note: firstSentence(e.snippet) || "Comparable open-source project (prior art).",
      evidence: [e.id],
    });
  }
  const oss = [...ossByKey.values()];

  // --- Build plan: milestones grouped by priority, risks from prior art. ----
  const buildPlan = buildMilestones(functional, brief, evidence, evById);

  // --- Design system (optional): seeded UI/UX contract, only when requested
  // (complex render without --no-design). Absent → light SRDs stay byte-identical.
  const design = opts.design ? buildDesignSystem(brief, functional) : undefined;

  // --- Traceability matrix (per-FR NFRs + the ADRs the FR actually touches). -
  const traceability: TraceRow[] = functional.map((fr) => {
    const text = `${fr.title} ${fr.description}`;
    const adrIds = [stackAdrId];
    if (dataAdr && (PERSIST_RE.test(text) || INTEGRATION_RE.test(text))) adrIds.push(dataAdr.id);
    if (privacyAdr && NFR_SIGNALS.privacy!.test(text)) adrIds.push(privacyAdr.id);
    const row: TraceRow = { fr: fr.id, nfrs: fr.nfrs, adrs: adrIds, entities: fr.entities, interfaces: fr.interfaces };
    if (design) {
      row.components = design.components.filter((c) => c.relatedFRs.includes(fr.id)).map((c) => c.name);
      row.screens = design.screens.filter((s) => s.relatedFRs.includes(fr.id)).map((s) => s.name);
    }
    return row;
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
    architecture: { context: contextProse(productName, brief), dataModel, interfaces, adrs },
    competitive: { competitors, oss },
    buildPlan,
    traceability,
    openQuestions: brief.openQuestions,
    evidenceIndex,
    ...(design ? { design } : {}),
  };
}

// ---------------------------------------------------------------------------
// Design system seeding. Pure, deterministic inference over the brief + the
// already-derived functional requirements / interfaces. Like the data-model and
// interface inference above, the output is an explicit "seeded — verify" scaffold
// the author enriches (see references/design-system-authoring.md). Never invents
// brand values it cannot know; tokens are sensible neutral defaults.
// ---------------------------------------------------------------------------

// Resolve the accessibility standard to target: an explicit brief override wins,
// else a recognised standard named in compliance/nfrPriorities, else WCAG 2.2 AA.
export function deriveA11yStandard(brief: Brief): string {
  const explicit = brief.design?.accessibilityTarget?.trim();
  if (explicit) return explicit;
  const hay = `${(brief.constraints.compliance ?? []).join(" ")} ${brief.nfrPriorities.join(" ")}`.toLowerCase();
  if (/\brgaa\b/.test(hay)) return "RGAA 4.1 (aligned to WCAG 2.2 AA)";
  if (/\b508\b|section 508/.test(hay)) return "Section 508 (WCAG 2.0 AA)";
  if (/en\s?301\s?549/.test(hay)) return "EN 301 549 (WCAG 2.1 AA)";
  return "WCAG 2.2 AA";
}

function buildPrinciples(brief: Brief): string[] {
  const hay = `${brief.idea} ${brief.product.valueProp ?? ""} ${brief.product.problem ?? ""} ${brief.nfrPriorities.join(" ")} ${brief.featureWishlist
    .map((f) => `${f.title} ${f.notes ?? ""}`)
    .join(" ")}`;
  const out: string[] = [];
  if (/self[- ]?host|privac|gdpr|own (your|the) data|no account/i.test(hay)) {
    out.push("Privacy by default — the UI never surfaces or transmits data the user did not choose to share.");
  }
  if (/fast|speed|sub-?second|latenc|instant|under \d/i.test(hay)) {
    out.push("Perceived performance first — optimistic UI, skeletons over spinners, immediate feedback on every action.");
  }
  out.push("Accessible to everyone — every flow works with the keyboard and assistive technology, by construction.");
  out.push("Consistency over novelty — reuse tokens and components before inventing new ones.");
  out.push("Progressive disclosure — show the essential first; reveal complexity only on demand.");
  out.push("Clear over clever — plain language, obvious affordances, honest empty and error states.");
  return out.slice(0, 5);
}

// Sensible, brand-neutral default tokens across every required category. Real
// values are an authoring task; the scaffold makes the shape concrete.
function seedTokens(brief: Brief): DesignToken[] {
  const brand = brief.design?.brandConstraints?.trim();
  const byCategory: Record<(typeof DESIGN_TOKEN_CATEGORIES)[number], DesignToken[]> = {
    color: [
      { category: "color", name: "color.bg", value: "#ffffff", note: brand ? `Adjust to brand: ${brand}` : "Primary surface" },
      { category: "color", name: "color.fg", value: "#111827", note: "Primary text" },
      { category: "color", name: "color.primary", value: "#2563eb", note: "Primary action / brand accent" },
      { category: "color", name: "color.danger", value: "#dc2626", note: "Destructive / error" },
      { category: "color", name: "color.muted", value: "#6b7280", note: "Secondary text / borders" },
    ],
    typography: [
      { category: "typography", name: "font.sans", value: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
      { category: "typography", name: "font.mono", value: "ui-monospace, SFMono-Regular, Menlo, monospace" },
      { category: "typography", name: "scale.body", value: "16px / 1.5" },
      { category: "typography", name: "scale.h1", value: "32px / 1.25" },
      { category: "typography", name: "scale.small", value: "13px / 1.4" },
    ],
    spacing: [
      { category: "spacing", name: "space.1", value: "4px" },
      { category: "spacing", name: "space.2", value: "8px" },
      { category: "spacing", name: "space.3", value: "12px" },
      { category: "spacing", name: "space.4", value: "16px" },
      { category: "spacing", name: "space.6", value: "24px" },
      { category: "spacing", name: "space.8", value: "32px" },
    ],
    radius: [
      { category: "radius", name: "radius.sm", value: "4px" },
      { category: "radius", name: "radius.md", value: "8px" },
      { category: "radius", name: "radius.lg", value: "12px" },
    ],
    elevation: [
      { category: "elevation", name: "shadow.sm", value: "0 1px 2px rgba(0,0,0,0.06)" },
      { category: "elevation", name: "shadow.md", value: "0 4px 12px rgba(0,0,0,0.10)" },
    ],
    motion: [
      { category: "motion", name: "motion.fast", value: "120ms ease-out" },
      { category: "motion", name: "motion.base", value: "200ms ease-out" },
    ],
  };
  // Emit in the canonical category order so the token set is deterministic.
  return DESIGN_TOKEN_CATEGORIES.flatMap((c) => byCategory[c]);
}

// The component inventory: a base set of cross-cutting UI components, each linked
// to the functional requirements it realises (regex over FR text, so the
// traceability is real). A `.*` concern links to every FR.
const COMPONENT_DEFS: { name: string; purpose: string; re: RegExp }[] = [
  { name: "App Shell & Navigation", purpose: "Overall layout, navigation and routing chrome that frames every screen.", re: /.*/ },
  { name: "Button & Actions", purpose: "Primary, secondary and destructive action controls with loading/disabled states.", re: /.*/ },
  {
    name: "Form & Input",
    purpose: "Labelled inputs with inline validation and accessible error messaging.",
    re: /save|add|create|edit|import|tag|organi[sz]e|login|sign|submit|upload|compose|write|configure|invite/i,
  },
  {
    name: "List & Collection",
    purpose: "Paginated/virtualised lists of saved items with selection and bulk actions.",
    re: /list|search|browse|organi[sz]e|tag|feed|library|archive|history|result|collection|inbox/i,
  },
  { name: "Detail View", purpose: "The focused reading/detail surface for a single item.", re: /read|view|open|detail|article|item|show|preview|document/i },
  { name: "Search & Filter", purpose: "Query input, filters and ranked results with empty/no-match handling.", re: /search|filter|find|query|sort|facet/i },
  { name: "Feedback & Notifications", purpose: "Toasts, banners and inline status for success, error and async progress.", re: /.*/ },
  { name: "Empty & Error States", purpose: "First-run, no-data and failure states that teach the next action.", re: /.*/ },
];

function buildComponents(functional: FR[]): UIComponent[] {
  const out: UIComponent[] = [];
  for (const def of COMPONENT_DEFS) {
    const relatedFRs = functional.filter((fr) => def.re.test(`${fr.title} ${fr.description}`)).map((fr) => fr.id);
    if (relatedFRs.length === 0) continue;
    out.push({ name: def.name, purpose: def.purpose, states: [...COMPONENT_STATES], relatedFRs, evidence: [] });
  }
  return out;
}

// One screen per in-scope (must/should) FR, plus a home and a settings surface.
function buildScreens(functional: FR[]): Screen[] {
  const inScope = functional.filter((fr) => fr.priority !== "could");
  const mustIds = functional.filter((fr) => fr.priority === "must").map((fr) => fr.id);
  const screens: Screen[] = [
    { name: "Home / Dashboard", purpose: "The landing surface after sign-in; entry point to the primary tasks.", relatedFRs: mustIds },
  ];
  for (const fr of inScope) {
    screens.push({ name: `${fr.title}`, purpose: `Where a user can ${lowerFirst(fr.title)}.`, relatedFRs: [fr.id] });
  }
  screens.push({ name: "Settings & Account", purpose: "Preferences, data export/delete and account management.", relatedFRs: [] });
  return screens;
}

// A happy-path flow per must-have FR, plus first-run onboarding.
function buildFlows(functional: FR[]): UserFlow[] {
  const must = functional.filter((fr) => fr.priority === "must");
  const flows: UserFlow[] = [
    {
      name: "First-run onboarding",
      steps: ["Arrive at an empty, explanatory first-run state", "Complete the minimal setup", "Reach the dashboard ready to act"],
      frIds: must.map((fr) => fr.id),
    },
  ];
  for (const fr of must) {
    flows.push({
      name: `${fr.title} — happy path`,
      steps: ["Navigate to the relevant screen", `Perform: ${lowerFirst(fr.title)}`, "Receive clear confirmation of the outcome"],
      frIds: [fr.id],
    });
  }
  return flows;
}

// A fixed, standard-agnostic set of testable accessibility requirements.
function a11yRequirements(): A11yRequirement[] {
  const defs: { statement: string; given: string; when: string; then: string }[] = [
    {
      statement: "Every interactive control is fully keyboard operable.",
      given: "a user navigates with the keyboard only",
      when: "they tab through any flow",
      then: "every interactive control is reachable, operable and follows a logical focus order",
    },
    {
      statement: "Focus is always visible.",
      given: "an element receives keyboard focus",
      when: "the user is navigating",
      then: "a visible focus indicator is shown and meets the non-text contrast minimum",
    },
    {
      statement: "Colour contrast meets the target standard.",
      given: "any text or essential UI element",
      when: "it is rendered in any supported theme",
      then: "contrast meets the target (≥ 4.5:1 for body text, ≥ 3:1 for large text and UI)",
    },
    {
      statement: "Every control and image exposes an accessible name.",
      given: "a form control, icon-only button or meaningful image",
      when: "it is read by assistive technology",
      then: "it exposes a programmatic label/name and images carry meaningful alt text (decorative images are hidden)",
    },
    {
      statement: "Structure and async changes are conveyed semantically.",
      given: "a screen is parsed by a screen reader",
      when: "the user explores it",
      then: "headings, landmarks and roles convey the structure and live regions announce asynchronous changes",
    },
    {
      statement: "Reduced motion and zoom are respected.",
      given: "a user prefers reduced motion or zooms to 200%",
      when: "they use the product",
      then: "non-essential motion is reduced or disabled and content reflows without loss of content or function",
    },
  ];
  return defs.map((d, i) => ({
    id: `A11Y-${pad3(i + 1)}`,
    statement: d.statement,
    acceptance: [{ given: d.given, when: d.when, then: d.then }],
  }));
}

function buildContentVoice(brief: Brief): string[] {
  const tone = brief.design?.tone?.trim();
  return [
    tone ? `Voice & tone: ${tone}.` : "Voice & tone: clear, concise and human — plain language over jargon.",
    "Label actions with the outcome the user gets, not the system operation behind it.",
    "Error messages state what happened, why, and the next step — never blame the user.",
    "Empty states teach the first useful action; success states confirm exactly what changed.",
  ];
}

function buildDesignSystem(brief: Brief, functional: FR[]): DesignSystem {
  return {
    principles: buildPrinciples(brief),
    tokens: seedTokens(brief),
    components: buildComponents(functional),
    screens: buildScreens(functional),
    flows: buildFlows(functional),
    accessibility: { standard: deriveA11yStandard(brief), requirements: a11yRequirements() },
    contentVoice: buildContentVoice(brief),
  };
}

// A concrete positive-path outcome: prefer a real clause from the notes; never
// emit the old tautology.
function concreteOutcome(title: string, notes?: string): string {
  const n = (notes ?? "").trim();
  // Capture the predicate AFTER the trigger word (not including it, so we don't
  // splice a double-modal like "succeeds and must …"), up to the first
  // sub-clause boundary (so a mid-string ';' can't leak through).
  // A numeric bound in the notes ("within 2 seconds", "at least 99.9%", "up to
  // 10k items") is the most testable outcome available. Prefer the trigger-word
  // clause only when it carries the bound itself (or no bound exists at all).
  const q = /\b(?:within|at least|at most|no more than|up to|under)\s+\d[^.;,]{0,60}/i.exec(n);
  const m = /\b(?:never|always|so that|so it|must|should|guarantee[sd]?|ensure[sd]?|without)\b\s+([^.;,]{4,})/i.exec(n);
  if (m?.[1]) {
    const clause = m[1].split(/[;,]/)[0]!.trim().replace(/\s+/g, " ");
    if (clause.length > 3 && (/\d/.test(clause) || !q)) return `the action succeeds and ${lowerFirst(clause)}`;
  }
  const t = /\bin under [^.;,]+/i.exec(n);
  if (t) return `the action completes ${t[0].trim().replace(/\s+/g, " ")}`;
  if (q) return `the outcome honours the stated bound: ${q[0].trim().replace(/\s+/g, " ").toLowerCase()}`;
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

function specialiseMetric(cat: string, base: string, ctx: { compliance: string[]; selfHost: boolean; timeGoal?: string; budget?: string }): string {
  const c = cat.toLowerCase();
  if ((c === "performance" || c === "usability") && ctx.timeGoal) {
    return `${base} Honour the product goal: ${ctx.timeGoal}.`;
  }
  if ((c === "privacy" || c === "security") && ctx.compliance.length) {
    return `${base} Comply with: ${ctx.compliance.join(", ")}.`;
  }
  if (c === "cost" && ctx.budget) {
    return `${base} Stay within the stated budget: ${ctx.budget}.`;
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

function buildMilestones(functional: FR[], _brief: Brief, evidence: EvidenceItem[], evById: Map<string, EvidenceItem>): Milestone[] {
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
  const boundaries = detectBoundaries(brief).map((b) => b.label);
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
