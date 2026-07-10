// Single source of truth for the version the CLI/bundle reports. Kept in
// lockstep with package.json and SKILL.md by scripts/sync-version.mjs during a
// semantic-release run. Do not edit by hand outside a release.
export const VERSION = "1.11.2";

// ---------------------------------------------------------------------------
// Research subsystem (grounding) — ported from the ultradoc evidence model.
// ---------------------------------------------------------------------------

// The mechanism a piece of evidence was retrieved through. The model cites
// evidence by id; `source` lets the dossier group items and lets the advisory
// grounding pass classify citations.
export type SourceKind = "market" | "oss" | "docs" | "so" | "issue" | "pr";

export const ALL_SOURCE_KINDS: readonly SourceKind[] = ["market", "oss", "docs", "so", "issue", "pr"];

// A research angle is the CLI/orchestrator concept; one angle can emit several
// evidence `source` kinds (e.g. the `tech` angle emits `docs` + `so`, the `oss`
// angle emits `oss` + `issue` + `pr`).
export type Angle = "market" | "oss" | "tech" | "semantic";
export const ALL_ANGLES: readonly Angle[] = ["market", "oss", "tech", "semantic"];

// A single piece of grounded evidence. `id` is stable within a run ("E1", "E2",
// …) and is what the SRD cites. `ref` is a short provenance token; `url` is the
// clickable source when one exists.
export interface EvidenceItem {
  id: string;
  source: SourceKind;
  title: string;
  ref: string;
  location?: string;
  score: number;
  snippet: string;
  url?: string;
  meta?: Record<string, unknown>;
}

export type RawItem = Omit<EvidenceItem, "id">;

// Where an OSS repo lives and how to reach it (used by the `oss` angle).
// Produced by resolveRepo(); the slug keys the on-disk cache at /tmp/construct.
export interface RepoRef {
  raw: string;
  host: string; // github.com | gitlab.com | "local" | "generic"
  owner?: string;
  repo?: string;
  cloneUrl?: string;
  webUrl?: string;
  isLocal: boolean;
  slug: string;
}

// What a research angle returns: ranked evidence (ids assigned later by the
// dossier) plus notes surfaced honestly in EVIDENCE.md (e.g. "SearXNG
// unreachable", "no issues API for this host").
export interface SourceResult {
  source: SourceKind;
  items: RawItem[];
  notes: string[];
}

// Which web-discovery engine to use; "auto" tries searxng → ddg → claude.
export type WebEngine = "auto" | "searxng" | "ddg" | "claude";

// Context handed to every research angle for a run.
export interface ResearchContext {
  brief: Brief;
  runDir: string; // the --out run folder
  angles: Angle[];
  query: string; // focused query (a --q drill, else derived from the brief)
  webEngine: WebEngine;
  semantic: boolean;
  perSource: number;
  refresh: boolean;
  docsUrls?: string[]; // --docs-url: docs pages to ground directly (tech angle)
  marketUrls?: string[]; // --url: market pages to pin into the dossier (market angle)
}

export interface DossierMeta {
  idea: string;
  angles: Angle[];
  query?: string;
  sources: SourceKind[]; // evidence kinds actually present
  semantic: boolean;
  evidenceCount: number;
  builtAt: string;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Brief — the captured product idea (the interview output). The interview
// itself is AI-driven (SKILL.md playbook); this is a passive schema store, the
// analog of reconstruct's plan.json.
// ---------------------------------------------------------------------------

export const BRIEF_SCHEMA_VERSION = 1;

export interface FeatureWish {
  title: string;
  priority?: "must" | "should" | "could";
  notes?: string;
  module?: string; // a declared Brief.modules id (modules mode)
}

// A product module declared in the brief (modules mode). When any are declared,
// render emits one PRD per module under prd/<id>/ and the hard `check` enforces
// every FR is assigned to one. `id` is a slug; `dependsOn` references other
// declared module ids.
export interface ModuleDef {
  id: string;
  name: string;
  description?: string;
  dependsOn?: string[];
}

export interface Brief {
  schemaVersion: number;
  idea: string; // the one-liner from `init --idea`
  product: {
    name?: string;
    problem?: string;
    users?: string[];
    valueProp?: string;
  };
  goals: string[]; // outcomes, not features
  nonGoals: string[];
  constraints: {
    budget?: string;
    timeline?: string;
    team?: string;
    compliance?: string[];
  };
  candidateTech: string[]; // technologies to ground against docs/SO
  competitors: string[]; // seed names for the market angle
  ossSeeds: string[]; // optional GitHub/GitLab URLs to mine
  modules?: ModuleDef[]; // optional module decomposition (modules mode)
  featureWishlist: FeatureWish[];
  nfrPriorities: string[]; // e.g. ["performance","security","a11y"]
  openQuestions: string[]; // become 🧠 callouts at render time
  design?: DesignInput; // optional design-system intent captured in the interview
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Brainstorm — the optional DIVERGENT step before the convergent interview.
// The interview elicits decisions the user already holds; brainstorm GENERATES
// candidate ideas (feature reframes, user segments, differentiators, anti-goals,
// wildcards) for the user to keep/park/reject, then `brainstorm --merge` folds
// the kept ones into the brief deterministically. The engine persists + merges;
// the AI runs the session (references/brainstorm-playbook.md).
// ---------------------------------------------------------------------------
export const BRAINSTORM_SCHEMA_VERSION = 1;

export type BrainstormAngle = "reframe" | "segment" | "feature" | "differentiator" | "anti-goal" | "wildcard";
export type BrainstormStatus = "proposed" | "kept" | "parked" | "rejected";
export type BrainstormTarget = "featureWishlist" | "competitors" | "nonGoals" | "goals" | "candidateTech" | "openQuestions";

export interface BrainstormIdea {
  id: string; // "B-001", assigned sequentially, stable once assigned
  angle: BrainstormAngle;
  title: string; // one line, whitespace-collapsed like brief fields
  notes?: string;
  status: BrainstormStatus; // default "proposed"
  target?: BrainstormTarget; // required to merge a "kept" idea
  priority?: "must" | "should" | "could"; // honored only for target=featureWishlist (default "could")
  mergedAt?: string; // ISO stamp set by --merge; merged ideas are skipped forever after
}

export interface Brainstorm {
  schemaVersion: number;
  idea: string; // copied from brief.idea at scaffold time
  createdAt: string;
  updatedAt?: string;
  ideas: BrainstormIdea[];
}

// Optional design intent captured during the interview. All fields optional —
// the renderer derives sensible defaults from the rest of the brief when absent.
export interface DesignInput {
  platforms?: string[]; // web, ios, android, desktop, …
  brandConstraints?: string; // existing brand/colours/typography, or "greenfield"
  referenceSystems?: string[]; // design systems to emulate (Material, shadcn, …)
  accessibilityTarget?: string; // explicit standard override (e.g. "RGAA 4.1")
  tone?: string; // voice & tone for content
}

// ---------------------------------------------------------------------------
// SRD — the rendered Software Requirements Document model (SRD.json manifest).
// ---------------------------------------------------------------------------

export const SRD_SCHEMA_VERSION = 1;
export type Level = "light" | "complex";
export type Priority = "must" | "should" | "could";

// Required NFR categories per level. buildSRD seeds them; the hard `check`
// enforces they are present. Single definition so the two can never drift.
export const REQUIRED_NFR: Record<Level, string[]> = {
  light: ["performance", "security", "reliability"],
  complex: ["performance", "security", "reliability", "usability", "observability", "cost"],
};

// The design-token categories a complete design system must cover. buildSRD
// seeds one group per category; the hard `check` enforces they are all present
// (the design analog of REQUIRED_NFR). Single definition so the two can't drift.
export const DESIGN_TOKEN_CATEGORIES = ["color", "typography", "spacing", "radius", "elevation", "motion"] as const;

// The interaction states a UI component spec should account for. Seeded onto
// every inferred component so a design spec covers real states, not just a name.
export const COMPONENT_STATES = ["default", "hover", "focus", "active", "disabled", "loading", "empty", "error"] as const;

// Banner the design-token renderer emits while the values are still the seeded
// defaults; `check` flags it as an advisory authoring nudge (renderer-only, so
// zero false positives — same rule as the 🧠 and templated-criteria phrasings).
export const DESIGN_TOKENS_SEEDED_BANNER = "Seeded defaults — replace these with the product's real brand tokens during authoring.";

export interface AcceptanceCriterion {
  given: string;
  when: string;
  then: string;
}

export interface FR {
  id: string; // FR-001 …
  title: string;
  description: string;
  priority: Priority;
  acceptance: AcceptanceCriterion[];
  rationaleEvidence: string[]; // [E#] ids that ground this requirement
  entities: string[]; // data entities this FR touches (must resolve)
  interfaces: string[]; // interfaces this FR uses (must resolve)
  nfrs: string[]; // NFR ids this FR relates to (must resolve)
  unresolved: boolean; // true when an open decision (🧠) remains
  module?: string; // owning module id (modules mode; must resolve in srd.modules)
}

// A module in the rendered SRD (modules mode): the brief's ModuleDef plus the
// computed FR partition. Present only when the brief declares modules — same
// absent-means-identical pattern as `design`.
export interface SRDModule {
  id: string;
  name: string;
  description?: string;
  frIds: string[];
  dependsOn: string[];
}

export interface NFR {
  id: string; // NFR-001 …
  category: string; // performance | security | reliability | …
  statement: string;
  metric?: string;
  rationaleEvidence: string[];
}

export interface ADR {
  id: string; // 0001 …
  title: string;
  status: "proposed" | "accepted";
  context: string;
  decision: string;
  consequences: string;
  alternatives?: string;
  evidence: string[];
}

export interface Entity {
  name: string;
  attributes: { name: string; type: string }[];
  referencedByFRs: string[];
}

export interface Interface {
  name: string;
  kind: "api" | "event" | "ui" | "cli";
  summary: string;
  relatedFRs: string[];
}

export interface CompetitorRow {
  name: string;
  note: string;
  evidence: string[];
}

export interface OssRow {
  name: string;
  url?: string;
  note: string;
  evidence: string[];
}

export interface Milestone {
  title: string;
  outcome: string;
  frIds: string[];
  risks: string[];
}

export interface TraceRow {
  fr: string;
  nfrs: string[];
  adrs: string[];
  entities: string[];
  interfaces: string[];
  // Design traceability — the components/screens that realise each FR. Optional
  // so a light/no-design SRD's matrix is byte-identical to before.
  components?: string[];
  screens?: string[];
  // Owning module (modules mode) — optional for the same reason.
  module?: string;
}

// ---------------------------------------------------------------------------
// Design system — the optional UI/UX contract rendered at `complex` level (the
// `design/` subtree). Seeded deterministically by inference from the brief +
// functional requirements, then enriched by the author (see
// references/design-system-authoring.md). Absent at `light` / with --no-design.
// ---------------------------------------------------------------------------

// A single design token (a named value the UI consumes). `category` is one of
// DESIGN_TOKEN_CATEGORIES; `value` is a sensible seeded default the author tunes.
export interface DesignToken {
  category: string;
  name: string;
  value: string;
  note?: string;
}

// A UI component in the inventory. `states` is the interaction-state checklist
// (COMPONENT_STATES); `relatedFRs` must resolve to functional-requirement ids.
export interface UIComponent {
  name: string;
  purpose: string;
  states: string[];
  relatedFRs: string[];
  evidence: string[]; // [E#] ids grounding the component (empty until authored)
}

// A screen/route in the product, mapped to the FRs it serves.
export interface Screen {
  name: string;
  purpose: string;
  relatedFRs: string[];
}

// A primary user flow — an ordered path through the product realising some FRs.
export interface UserFlow {
  name: string;
  steps: string[];
  frIds: string[];
}

// An accessibility requirement with testable Given/When/Then criteria. The
// `standard` (WCAG/RGAA/…) is derived from the brief; `check` enforces each
// requirement carries at least one acceptance criterion.
export interface A11yRequirement {
  id: string; // A11Y-001 …
  statement: string;
  acceptance: AcceptanceCriterion[];
}

export interface DesignSystem {
  principles: string[];
  tokens: DesignToken[];
  components: UIComponent[];
  screens: Screen[];
  flows: UserFlow[];
  accessibility: { standard: string; requirements: A11yRequirement[] };
  contentVoice: string[];
}

// Advisory grounding coverage — never fails the build, just reports.
export interface CoverageReport {
  frTotal: number;
  frGrounded: number;
  nfrTotal: number;
  nfrGrounded: number;
  adrTotal: number;
  adrGrounded: number;
  dangling: string[]; // [E#] cited but absent from evidence.json
  uncited: string[]; // evidence ids never cited (informational)
}

export interface SRD {
  schemaVersion: number;
  level: Level;
  generatedAt: string;
  product: {
    name: string;
    problem: string;
    valueProp: string;
    users: string[];
    metrics: string[];
  };
  scope: { inScope: string[]; outOfScope: string[]; assumptions: string[] };
  functional: FR[];
  // The module partition (modules mode). Present only when the brief declares
  // modules; render then emits prd/<id>/PRD.md per entry and `check` gates it.
  modules?: SRDModule[];
  nonFunctional: NFR[];
  architecture: {
    context: string;
    dataModel: Entity[];
    interfaces: Interface[];
    adrs: ADR[];
  };
  competitive: { competitors: CompetitorRow[]; oss: OssRow[] };
  buildPlan: Milestone[];
  traceability: TraceRow[];
  openQuestions: string[]; // unresolved decisions, surfaced as 🧠 callouts
  evidenceIndex: string[]; // every [E#] referenced by the SRD
  // The design-system contract. Present only at `complex` level without
  // --no-design; absent (undefined) otherwise — keeps light SRDs byte-identical.
  design?: DesignSystem;
  coverage?: CoverageReport; // filled by `check` (advisory)
}

// ---------------------------------------------------------------------------
// Validation — the dual `check`.
// ---------------------------------------------------------------------------

export interface CheckResult {
  // True when the hard structural gate passes AND the opt-in grounding gate (if
  // requested via --min-grounding) passes: structural.ok && (grounding?.ok ?? true).
  // Without the flag this is exactly the structural verdict, as before.
  ok: boolean;
  // Hard structural / buildability gate.
  structural: {
    ok: boolean;
    errors: string[];
    warnings: string[];
  };
  // Advisory grounding coverage — informational, never flips `ok` by itself.
  coverage: CoverageReport & { citations: string[]; resolved: string[] };
  // Present ONLY when the caller opted into a grounding threshold
  // (`check --min-grounding N`). The advisory default is unchanged without it.
  grounding?: { threshold: number; actualPct: number; ok: boolean };
  // Present ONLY with `check --semantic` (folds the `review` verdicts). Fails the
  // gate on a refuted/unsupported claim. Undefined — and `ok` unchanged — without it.
  semantic?: ClaimVerifyResult;
  // Present when `--semantic` was requested but the gate could not engage
  // (missing/unreadable/verdict-less VERIFY.json) and `--allow-unverified` was
  // not passed. Fail-closed: its presence means `ok` is false.
  semanticError?: string;
  // Present when the SRD carries resolved citations but the caller did NOT pass
  // `--semantic`: the claim-support gate never engaged, so the citations are
  // unverified. Advisory only — reported loudly, never flips `ok`.
  semanticSkipped?: { citedClaims: number; verifyExists: boolean };
}

// ---------------------------------------------------------------------------
// Semantic claim-support review. The structural gate proves an SRD is complete
// and the coverage report counts which claims CITE evidence — but neither proves
// the cited evidence actually SUPPORTS the claim (today that's the manual
// adversarial review). `construct review` emits ClaimEvidencePair[] — a
// deterministic worklist over the SRD's grounded claims; an agent fills a
// ClaimVerdict per pair; `review --apply` / `check --semantic` then FAIL on a
// refuted/unsupported claim. (Distinct from `verify`/VerifyResult, which referee
// the BUILT app against BUILD-PLAN.json — a different gate.)
// ---------------------------------------------------------------------------
export type VerdictKind = "supported" | "partial" | "refuted" | "unsupported";

// One grounded SRD claim paired with one evidence item it cites + that item's
// snippet, for an agent to adjudicate.
export interface ClaimEvidencePair {
  claimId: string; // FR-001 / NFR-001 / ADR-0001 / COMP-1 / OSS-1
  kind: "FR" | "NFR" | "ADR" | "competitor" | "oss";
  claim: string; // the claim text (capped)
  evidenceId: string; // the cited [E#]
  source: SourceKind;
  digest: string; // the cited item's snippet
}

export interface ClaimVerdict extends ClaimEvidencePair {
  verdict: VerdictKind;
  note: string;
}

export interface ClaimVerifyResult {
  ok: boolean; // false when any claim is refuted/unsupported
  pairs: number;
  adjudicated: number;
  supported: number;
  partial: number;
  refuted: number;
  unsupported: number;
  failures: { claimId: string; evidenceId: string; verdict: VerdictKind; note: string }[];
  unadjudicated: string[];
  verdicts?: ClaimVerdict[];
}

// ---------------------------------------------------------------------------
// Build plan — BUILD-PLAN.json, the machine-readable bridge from SRD to app.
// The engine derives the task DAG from the SRD (and re-derives it on every
// render); the building AGENT owns progress fields (artifacts, tests, verify
// commands, status), which mergePlan preserves across re-renders. The engine
// never generates app code — it plans and verifies.
// ---------------------------------------------------------------------------

export const BUILD_PLAN_SCHEMA_VERSION = 1;

// A pointer into SRD.json — functional[frId].acceptance[index]. Refs, never
// copies: the SRD stays the single source of truth for what "done" means.
export interface AcceptanceRef {
  frId: string;
  index: number;
}

export type TaskStatus = "todo" | "in-progress" | "done";

export interface BuildTask {
  // Engine-derived (regenerated every render):
  id: string; // T-000 …
  title: string;
  milestone: string; // M1 | M2 | M3
  module?: string; // owning module id (modules mode; from the task's FR)
  frIds: string[];
  acceptance: AcceptanceRef[];
  dependsOn: string[];
  // Agent-owned (preserved across re-renders, keyed by the task's frIds):
  artifacts: string[]; // app-relative paths implementing the task
  tests: string[]; // app-relative test files exercising the task
  verify: { commands: string[] }; // per-task commands `verify --run-tests` executes
  status: TaskStatus;
}

export interface BuildPlanDoc {
  schemaVersion: number;
  product: string;
  generatedAt: string;
  conventions: {
    // Test names/content must reference the FR id they exercise — this is what
    // `construct verify` greps for. Engine-derived default: FR-\d{3}.
    frTagPattern: string;
    // Agent-owned: the app's test command and the app directory (relative to
    // the run folder or absolute).
    testCommand: string | null;
    appDir: string | null;
  };
  tasks: BuildTask[];
}

// `construct verify` — does the built app match the plan and the SRD?
export interface FrTestCoverage {
  fr: string;
  priority: Priority;
  testFiles: string[]; // test files whose content references the FR id
}

export interface VerifyResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  frTestCoverage: FrTestCoverage[];
  // Present only with --run-tests.
  commandResults?: { command: string; ok: boolean; exitCode: number | null }[];
}

// ---------------------------------------------------------------------------
// Gap analysis — `construct analyze`, the post-research "what's thin?" signal.
// Pure prediction: it reuses the same matcher render will use, so a gap here is
// a claim that WILL render ungrounded. Informational only, never gates.
// ---------------------------------------------------------------------------

export interface GapReport {
  evidenceCount: number;
  bySource: Record<string, number>;
  notes: string[]; // angle failures etc., surfaced from the dossier meta
  ungroundedFeatures: { title: string; priority: string }[];
  unmatchedCompetitors: string[];
  unmatchedTech: string[];
  unminedSeeds: string[];
  suggestions: string[]; // concrete drill commands, one per gap
}
