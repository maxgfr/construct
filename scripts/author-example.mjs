// One-off authoring pass that turns the Readpile scaffold into the reference
// SRD shipped in assets/example-srd/. Run once; the authored SRD.json is what
// gets committed.
import { readFileSync, writeFileSync } from "node:fs";

const path = process.argv[2];
const srd = JSON.parse(readFileSync(path, "utf8"));

const ac = (given, when, then) => ({ given, when, then });

const FR = {
  "FR-001": {
    description:
      "A signed-in user saves a web article by pasting its URL into the Web App or clicking the browser extension. Readpile fetches the page, extracts the readable body, and stores it locally so the saved copy survives the original going offline.",
    rationaleEvidence: ["E4", "E1"],
    entities: ["Article"],
    interfaces: ["Web App", "Browser Extension"],
    acceptance: [
      ac(
        "a signed-in user with a reachable article URL",
        "they submit it via the Web App or the browser extension",
        "the readable body (title, author, text, inline images) is extracted and stored locally, and the article appears at the top of their list within 2 seconds [E4]",
      ),
      ac(
        "the article URL returns HTTP 404, or does not respond within 10 seconds",
        "the user submits it",
        "the save is rejected with the HTTP status in the message, nothing partial is written to the library, and the URL stays in the input so the user can retry without re-typing it",
      ),
      ac(
        "a URL the user has already saved",
        "they submit it again",
        "no duplicate is created; the existing article is re-fetched, its body replaced, and its original saved-at timestamp preserved",
      ),
    ],
  },
  "FR-002": {
    description:
      "A user finds any saved article by searching its full text. Search covers title, author and body, tolerates one typo per word, and returns results fast enough to feel instant while typing.",
    rationaleEvidence: ["E3"],
    entities: ["Article"],
    interfaces: ["Web App"],
    acceptance: [
      ac(
        "a library of 5,000 saved articles",
        "the user types a two-word query containing one typo",
        "matching articles are returned in under 300 ms at p95, ranked by relevance, with the typo tolerated and the matched terms highlighted in the excerpt [E3]",
      ),
      ac(
        "the search backend is unreachable",
        "the user submits a query",
        "the Web App falls back to a substring match over titles held locally, labels the results as degraded, and does not report zero results as an empty library",
      ),
      ac(
        "a query matching no article",
        "the user submits it",
        "an empty state names the query and offers to clear the active tag filter, rather than rendering a blank list",
      ),
    ],
  },
  "FR-003": {
    description:
      "A user organises the library with free-form tags. Tags are created inline while tagging, can be applied in bulk from the list view, and filter the library additively.",
    rationaleEvidence: ["E1"],
    entities: ["Article", "Tag"],
    interfaces: ["Web App"],
    acceptance: [
      ac(
        "an article open in the reader",
        "the user types a tag name that does not exist yet and confirms",
        "the tag is created, applied to that article, and offered as a suggestion the next time any article is tagged",
      ),
      ac(
        "a tag applied to 40 articles",
        "the user deletes the tag",
        "the tag is removed from all 40 articles in one operation, the articles themselves are untouched, and the action is reported with the count",
      ),
      ac(
        "two tags selected as filters",
        "the user views the library",
        "only articles carrying BOTH tags are listed, and the active filters are shown with a one-click way to clear each",
      ),
    ],
  },
  "FR-004": {
    description:
      "A user migrates off a hosted service by importing a Pocket or Instapaper export file. The import is incremental and resumable: a single unreadable entry never aborts the run.",
    rationaleEvidence: ["E5", "E2"],
    entities: ["Article", "Tag"],
    interfaces: ["Web App"],
    acceptance: [
      ac(
        "a Pocket export containing up to 10,000 articles",
        "the user uploads it",
        "entries are imported in batches of 100 with a visible progress count, and the import survives a browser refresh by resuming from the last committed batch [E5]",
      ),
      ac(
        "an export in which 12 entries have an unreachable URL",
        "the import runs",
        "the other entries import successfully, the 12 failures are listed with their URL and reason in a downloadable report, and the import completes rather than aborting wholesale [E5]",
      ),
      ac(
        "a file that is not a recognised Pocket or Instapaper export",
        "the user uploads it",
        "the upload is rejected before any write, naming which formats are accepted; the library is unchanged",
      ),
    ],
  },
  "FR-005": {
    description:
      "A user reads previously synced articles on a phone with no connectivity. Article bodies and images are cached on the device; reading position syncs back when connectivity returns.",
    rationaleEvidence: ["E2"],
    entities: ["Article"],
    interfaces: ["Web App"],
    acceptance: [
      ac(
        "a device that has synced 200 articles and is now in airplane mode",
        "the user opens any of those 200 articles",
        "the full text and inline images render from the local cache within 1 second, and no network error is shown",
      ),
      ac(
        "an article that was never synced to the device",
        "the user opens it while offline",
        "the reader shows the stored title and excerpt with an explicit 'not downloaded' state and a retry action, instead of a blank page or a generic error",
      ),
      ac(
        "reading position advanced on 3 articles while offline",
        "connectivity returns",
        "the positions sync to the server within 30 seconds; if the server holds a newer position for an article, the most recently updated one wins and the other is discarded silently",
      ),
    ],
  },
};

for (const fr of srd.functional) {
  const a = FR[fr.id];
  if (!a) continue;
  Object.assign(fr, a);
}

// --- NFRs: real, falsifiable targets -----------------------------------------
const NFR = {
  performance: {
    statement: "Search and library rendering stay responsive on a self-hosted single-node install.",
    metric: "p95 search latency < 300 ms over a 5,000-article library on 2 vCPU / 2 GB RAM; library list first paint < 1 s [E3]",
    rationaleEvidence: ["E3"],
  },
  security: {
    statement: "A self-hosted instance is safe to expose to the public internet.",
    metric: "every endpoint except /health requires an authenticated session; credentials and session tokens never appear in logs; dependencies scanned in CI and no known-exploited CVE ships in a release",
    rationaleEvidence: [],
  },
  reliability: {
    statement: "A crash or a bad deploy never costs the user their library.",
    metric: "99.5% monthly availability measured from the instance's own health endpoint; RPO ≤ 24 h via nightly snapshot, RTO ≤ 1 h with a documented single-command restore verified on every release",
    rationaleEvidence: [],
  },
  usability: {
    statement: "A new self-hoster reaches value without reading documentation end to end.",
    metric: "a first-time user saves their first article within 2 minutes of first login, unaided, in moderated testing with 5 participants",
    rationaleEvidence: [],
  },
  observability: {
    statement: "A failure can be diagnosed from the instance's own logs, without reproducing it.",
    metric: "every request carries a trace id echoed in error responses; save, search and import each emit a structured success/failure event with duration",
    rationaleEvidence: [],
  },
  cost: {
    statement: "Running a personal instance costs about what a cheap VPS costs.",
    metric: "runs within 2 vCPU / 2 GB RAM / 20 GB disk for a single user with 5,000 articles — under $10/month at 2026 VPS pricing, matching the stated side-project budget",
    rationaleEvidence: [],
  },
  privacy: {
    statement: "The user owns their data and can leave without loss.",
    metric: "full export to JSON + original HTML on demand; account deletion removes all rows and cached bodies within 24 h; no third-party analytics or telemetry ships enabled [E1]",
    rationaleEvidence: ["E1"],
  },
};
for (const n of srd.nonFunctional) {
  const a = NFR[n.category];
  if (a) Object.assign(n, a);
}

// --- ADRs ---------------------------------------------------------------------
const ADR = {
  "0001": {
    context:
      "The product is a single-developer, 8-week MVP that must run on a cheap VPS and be installable by non-experts. It needs relational storage, full-text search with typo tolerance, and a server-rendered web UI.",
    decision:
      "Build on Next.js with PostgreSQL as the system of record and Meilisearch as the search index, shipped together as a docker-compose stack [E3].",
    consequences:
      "One language across server and client keeps a solo developer productive. Meilisearch adds a second stateful service to run and back up, which is the main operational cost of the choice; PostgreSQL full-text search was rejected because typo tolerance would have to be hand-built. The stack fits the 2 vCPU / 2 GB target.",
    alternatives: [
      "PostgreSQL full-text search alone — one fewer service, but no typo tolerance without significant custom work.",
      "SQLite + FTS5 — simplest to operate, but weak concurrent-write behaviour under import load.",
    ],
    evidence: ["E3"],
    status: "accepted",
  },
  "0002": {
    context:
      "The value proposition is data ownership: users are leaving hosted read-it-later services precisely because those services lock data in or shut down.",
    decision: "Ship self-hosted only for the MVP: no hosted multi-tenant offering, no account on any Readpile-operated server [E1].",
    consequences:
      "Removes all multi-tenancy, billing and abuse-handling work from the MVP, which is what makes 8 weeks credible. It also caps adoption to people who can run docker-compose — accepted deliberately, and the reason the install path is a first-class usability requirement.",
    alternatives: ["A hosted tier alongside self-hosting — contradicts the stated non-goal and roughly doubles the MVP surface."],
    evidence: ["E1"],
    status: "accepted",
  },
  "0003": {
    context:
      "Saved articles must survive the source going offline, and imports of up to 10,000 entries must not lose data or block the UI. Prior art shows bulk imports are where read-it-later tools break [E5].",
    decision:
      "Store extracted article bodies as rows in PostgreSQL with images on the filesystem, and process imports through a resumable batch job that commits every 100 entries [E5][E2].",
    consequences:
      "A refresh or a crash mid-import loses at most one batch, and a single bad entry is recorded rather than fatal. Storing bodies in PostgreSQL keeps backup to a single pg_dump; large libraries grow the database rather than an object store, which is acceptable at the stated single-user scale.",
    alternatives: [
      "One transaction for the whole import — simpler, but a 10,000-entry rollback loses hours of work.",
      "Object storage for bodies — better at scale, but adds a service the self-hosting target does not need.",
    ],
    evidence: ["E5", "E2"],
    status: "accepted",
  },
};
for (const a of srd.architecture.adrs) {
  const x = ADR[a.id];
  if (x) Object.assign(a, x);
}

// --- data model ---------------------------------------------------------------
srd.architecture.dataModel = [
  {
    name: "Article",
    attributes: [
      { name: "id", type: "uuid" },
      { name: "url", type: "text" },
      { name: "title", type: "text" },
      { name: "author", type: "text" },
      { name: "body", type: "text" },
      { name: "excerpt", type: "text" },
      { name: "savedAt", type: "timestamptz" },
      { name: "readPosition", type: "float" },
      { name: "syncedAt", type: "timestamptz" },
    ],
  },
  {
    name: "Tag",
    attributes: [
      { name: "id", type: "uuid" },
      { name: "name", type: "text" },
      { name: "createdAt", type: "timestamptz" },
    ],
  },
  {
    name: "ImportJob",
    attributes: [
      { name: "id", type: "uuid" },
      { name: "source", type: "text" },
      { name: "totalEntries", type: "int" },
      { name: "committedEntries", type: "int" },
      { name: "failures", type: "jsonb" },
      { name: "startedAt", type: "timestamptz" },
      { name: "finishedAt", type: "timestamptz" },
    ],
  },
];

srd.architecture.interfaces = [
  {
    name: "Web App",
    kind: "ui",
    summary:
      "Server-rendered Next.js UI over an internal JSON API: POST /articles (save), GET /articles?q= (search + filter), POST /tags, POST /imports (multipart upload), GET /imports/:id (progress). Session-cookie authenticated; 401 on any unauthenticated call, 503 with a Retry-After when the search index is unreachable.",
    relatedFRs: ["FR-001", "FR-002", "FR-003", "FR-004", "FR-005"],
  },
  {
    name: "Browser Extension",
    kind: "api",
    summary:
      "A WebExtension that POSTs {url, title} to the instance's /articles endpoint using a long-lived token the user pastes once. Failure modes: unreachable instance (surface the host and keep the URL in the popup), 401 (prompt to re-paste the token), 409 duplicate (report the existing article rather than erroring).",
    relatedFRs: ["FR-001"],
  },
];

// Entities carry their reverse index; recompute it from the FRs below.
for (const e of srd.architecture.dataModel) e.referencedByFRs = [];

// Keep FR references closed over the new model.
for (const fr of srd.functional) {
  fr.entities = (fr.entities ?? []).filter((e) => srd.architecture.dataModel.some((d) => d.name === e));
  fr.interfaces = (fr.interfaces ?? []).filter((i) => srd.architecture.interfaces.some((x) => x.name === i));
}
srd.functional.find((f) => f.id === "FR-004")?.entities.push("ImportJob");
for (const fr of srd.functional) {
  for (const name of fr.entities) {
    const e = srd.architecture.dataModel.find((d) => d.name === name);
    if (e && !e.referencedByFRs.includes(fr.id)) e.referencedByFRs.push(fr.id);
  }
}

// --- scope, metrics, assumptions ---------------------------------------------
srd.product.metrics = [
  "A user re-finds any saved article in under 10 seconds, measured end to end from opening the app",
  "1,000 self-hosted installs reporting in during the first year",
];
srd.scope.assumptions = [
  "One full-stack developer, 8 weeks to MVP, no paid infrastructure beyond a ~$10/month VPS.",
  "Users can run docker-compose; a one-command install is in scope, a hosted option is not.",
  "Article extraction quality is bounded by what the source page exposes; paywalled content is out of scope.",
];

// --- design tokens: a real brand, not the seeded neutrals ---------------------
const BRAND = {
  "color.bg": "#FBF9F4",
  "color.fg": "#1B2A41",
  "color.primary": "#C1654A",
  "color.muted": "#5A6B7D",
  "color.border": "#E3DED3",
  "color.danger": "#A8322D",
  "color.success": "#2F6F4F",
  "type.font-sans": "'Inter', system-ui, sans-serif",
  "type.font-mono": "'JetBrains Mono', ui-monospace, monospace",
  "type.size-base": "1.0625rem",
  "type.leading-base": "1.7",
};
if (Array.isArray(srd.design?.tokens)) {
  for (const t of srd.design.tokens) {
    if (BRAND[t.name] !== undefined) t.value = BRAND[t.name];
  }
  // Mark the tokens as authored so the renderer drops the "seeded defaults"
  // banner and `check` stops warning about them.
  srd.design.tokensAuthored = true;
}

writeFileSync(path, JSON.stringify(srd, null, 2));
console.log("authored", path);
