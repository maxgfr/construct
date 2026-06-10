// Single source of truth for the version the CLI/bundle reports. Kept in
// lockstep with package.json and SKILL.md by scripts/sync-version.mjs during a
// semantic-release run. Do not edit by hand outside a release.
export const VERSION = "1.1.0";

// ---------------------------------------------------------------------------
// Research subsystem (grounding) — ported from the ultradoc evidence model.
// ---------------------------------------------------------------------------

// The mechanism a piece of evidence was retrieved through. The model cites
// evidence by id; `source` lets the dossier group items and lets the advisory
// grounding pass classify citations.
export type SourceKind = "market" | "oss" | "docs" | "so" | "issue" | "pr";

export const ALL_SOURCE_KINDS: readonly SourceKind[] = [
  "market",
  "oss",
  "docs",
  "so",
  "issue",
  "pr",
];

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
  featureWishlist: FeatureWish[];
  nfrPriorities: string[]; // e.g. ["performance","security","a11y"]
  openQuestions: string[]; // become 🧠 callouts at render time
  createdAt: string;
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
