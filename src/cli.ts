import { resolve, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { VERSION, ALL_SOURCE_KINDS } from "./types.js";
import type { Angle, ResearchContext, WebEngine, EvidenceItem, DossierMeta, Level, SourceResult, SourceKind, BuildPlanDoc } from "./types.js";
import { slugify } from "./util.js";
import { initBrief, saveBrief, loadBrief, validateBrief } from "./brief.js";
import { initBrainstorm, loadBrainstorm, saveBrainstorm, mergeBrainstorm, brainstormCounts, writeBrainstormMd } from "./brainstorm.js";
import { runResearch } from "./research/registry.js";
import { FETCH_CONCURRENCY, MAX_TECH } from "./config.js";
import { configureCache, clean as cacheClean, stats as cacheStats } from "./research/cache.js";
import { marketAngle } from "./research/market.js";
import { ossAngle } from "./research/oss.js";
import { techAngle } from "./research/tech.js";
import { stackoverflow } from "./research/stackoverflow.js";
import { webFetchUrls } from "./research/web.js";
import { assignIds, renderEvidenceMarkdown } from "./research/dossier.js";
import { renderSRD, renderFromSRD } from "./render.js";
import { checkRun, formatCheckReport } from "./check.js";
import { analyzeRun, formatGapReport } from "./analyze.js";
import { verifyRun, formatVerifyReport } from "./verify.js";
import { runReview, applyVerdicts, formatReviewReport } from "./review.js";
import { loadPlan, readyFrontier } from "./plan.js";
import { listPhases, orchestrateRun } from "./orchestrate.js";
import { stackControl } from "./research/semantic.js";
import { configureFirecrawl } from "./research/firecrawl.js";

const HELP = `construct v${VERSION}
Turn a product idea into a grounded, buildable SRD suite. Interview → research
(market / OSS prior-art / tech feasibility / optional local semantic) → render →
check. Grounding is advisory; structural completeness is enforced.

Usage:
  construct init     --idea "<one-liner>" [--out <dir>]
  construct brainstorm --out <run> [--merge] [--json]
  construct research --out <run> [--angles market,oss,tech,semantic] [--q "<focus>"] [--url <u,...>] [--semantic]
  construct analyze  --out <run> [--json]
  construct web|oss|tech|so --out <run> [--q "<focus>"] [--url <u,...>] [--seeds <u,...>]
  construct render   --out <run> [--level light|complex] [--merge] [--no-design] [--prd|--no-prd]
  construct render   --out <run> --from-srd [--merge] [--prd|--no-prd]
  construct check    --out <run> [--min-grounding <0-100>] [--semantic [--allow-unverified]] [--json]
  construct review   --out <run> [--apply <verdicts.json>] [--max-review N] [--json]
  construct verify   --out <run> [--app <dir>] [--run-tests] [--strict] [--json]
  construct status   --out <run> [--json]
  construct orchestrate --out <run> [--phase research|claim-review|adr-judges|build] [--adr <id>] [--eco] [--list]
  construct semantic up|down|status
  construct firecrawl up|down|status
  construct cache    status|clean [--all] [--json]

Commands:
  init       Scaffold a run folder + brief.json (fill it via the interview).
  brainstorm Divergent ideation BEFORE the interview: scaffold a board of
             candidate ideas (brainstorm.json + BRAINSTORM.md). --merge folds
             kept ideas into brief.json (parked → 🧠 openQuestions).
  research   Gather evidence across angles into <run>/evidence (a dossier).
  analyze    Report what is thin (gaps that will render ungrounded) + drill commands.
  web        Drill the market/web angle.       oss   Drill OSS prior-art mining.
  tech       Drill tech docs + StackOverflow.   so    Drill StackOverflow only.
  render     Render the SRD tree + SRD.json from brief.json + the dossier.
             At --level complex this also renders a design-system subtree
             (design/: principles, tokens, components, screens, accessibility);
             --no-design opts out. --prd also emits requirements/prd/ — one
             standalone PRD per functional requirement + an index.
             --from-srd re-emits the tree from an edited SRD.json WITHOUT
             rebuilding it (the enrich→re-render path; keeps markdown in sync
             with the gated manifest).
  check      Hard structural gate + advisory grounding-coverage report.
             --semantic also folds in the review verdicts (fails on a claim its
             cited evidence does not support).
  review     Emit a claim↔evidence worklist for adversarial support-checking,
             then (--apply <verdicts.json>) gate on refuted/unsupported claims.
             Mechanizes the manual adversarial-review of SRD grounding.
  verify     Check a built app against BUILD-PLAN.json + the SRD (static by
             default; --run-tests executes the declared test commands).
  status     Show what exists in a run (brief / evidence / SRD / check).
  orchestrate Emit the run's multi-agent orchestration from its CURRENT state
             into <run>/orchestration/: one launchable workflow script per
             ready fan-out phase (research gaps · claim-review pairs · the
             adr-judges 3-lens panel · build frontier tasks), the dispatch
             contracts (agents/<role>.md) and a sequential RUNBOOK.md fallback.
             Subagents RETURN fragments; you stay the sole writer of the run
             folder (references/orchestration.md). Exits 2 when the named
             phase's worklist does not exist yet — and says which command
             produces it. Re-run after any worklist change (idempotent).
  semantic   Manage the optional local Docker stack (Qdrant + Ollama + SearXNG).
  firecrawl  Manage the optional local Firecrawl stack (compose profile
             'extract'): keyless main-content extraction. While it is up, every
             page fetch is cleaned through it instead of the built-in HTML
             stripper; when it is down (or --firecrawl off) nothing changes.
  cache      Inspect or prune the on-disk page cache that makes a 'research'
             re-run (the dig-deeper fold-in) nearly free. 'clean' drops stale
             entries; --all drops everything.

Options:
  --idea <s>           One-line product idea                     (required for init)
  --out <dir>          The run folder                            (required for most)
  --angles <list>      market,oss,tech,semantic   (default: market,oss,tech)
  --q, --question <s>  Focus the research/drill on a sub-question
  --url <u,...>        For 'web': specific page(s) to fetch + PRINT (drill only —
                       stdout, not persisted; use 'research --url' to ground)
                       For 'research': pin page(s) into the dossier (market angle,
                       persisted evidence — this is what actually grounds a claim)
  --seeds <u,...>      OSS repo URLs to mine (overrides brief.ossSeeds)
  --docs-url <u,...>   For 'tech': docs page(s) to fetch + PRINT (drill only —
                       stdout, not persisted; use 'research --docs-url' to ground)
                       For 'research': pin docs page(s) into the dossier (tech
                       angle, persisted evidence — this is what actually grounds)
  --level <l>          light | complex                           (default: light)
  --min-grounding <n>  For 'check': fail unless ≥ n% of claims are grounded (opt-in)
  --semantic           For 'check': fold in the 'review' claim-support verdicts
                       (fail-closed: no/unreadable VERIFY.json fails the check)
  --allow-unverified   For 'check --semantic': degrade a missing/unreadable
                       VERIFY.json to a warning instead of failing
  --apply <file>       For 'review': consume an adjudicated verdicts file + gate
  --max-review <n>     For 'review': cap the worklist at the n highest-score
                       pairs (default: review ALL cited pairs; dropped pairs
                       are named in VERIFY.md)
  --app <dir>          For 'verify': the built app directory (default: conventions.appDir)
  --phase <name>       For 'orchestrate': emit one phase only —
                       research | claim-review | adr-judges | build
  --adr <id>           For 'orchestrate': the contested ADR the judge panel
                       rules on (required with --phase adr-judges)
  --eco                For 'orchestrate': emit only RUNBOOK.md + agents/*.md —
                       the explicit low-token sequential path
  --list               For 'orchestrate': print the phases + readiness as JSON
  --run-tests          For 'verify': also execute testCommand + per-task verify commands
  --strict             For 'verify': a built must-have FR with no referencing test FAILS
  --web-engine <e>     auto | searxng | ddg | claude | firecrawl (default: auto;
                       'firecrawl' is explicit-only — 'auto' never probes it)
  --firecrawl <url>    Firecrawl base URL, or 'off' to force the built-in
                       extractor        (default: $CONSTRUCT_FIRECRAWL or
                       http://localhost:3002)
  --per-source <n>     Max evidence items kept per source        (default: 6)
  --concurrency <n>    Max retrievals in flight inside one angle  (default: 4)
  --max-tech <n>       Candidate technologies the tech angle grounds (default: 3)
  --merge              Also emit a single-file SRD.md bundle
  --no-design          For 'render': skip the design-system subtree (complex only)
  --prd                For 'render': also emit one PRD file per FR (requirements/prd/)
  --no-prd             For 'render': deliberately delete an existing requirements/prd/
                       (without it, a render that omits --prd refuses to destroy the tree)
  --semantic           Rescore evidence with the local embedding model
  --refresh            Ignore the page cache and re-clone mined OSS repos
  --offline            Work only from the page cache; never hit the network
                       (a miss is reported honestly, never treated as empty)
  --all                For 'cache clean': drop fresh entries too
  --json               Machine-readable output
  -h, --help           Show this help
  -v, --version        Show version

Workflow:
  construct init --idea "..." --out ./my-idea     # then fill brief.json (interview)
  construct research --out ./my-idea              # grounds the SRD in real evidence
  construct render --out ./my-idea --level complex # writes the SRD tree
  construct check --out ./my-idea                 # structural gate + coverage report
`;

const COMMANDS = new Set([
  "init",
  "brainstorm",
  "research",
  "analyze",
  "web",
  "oss",
  "tech",
  "so",
  "render",
  "check",
  "verify",
  "review",
  "status",
  "orchestrate",
  "semantic",
  "firecrawl",
  "cache",
]);
const VALUE_FLAGS = new Set([
  "idea",
  "out",
  "run",
  "angles",
  "q",
  "question",
  "url",
  "seeds",
  "docs-url",
  "level",
  "web-engine",
  "firecrawl",
  "per-source",
  "source",
  "min-grounding",
  "app",
  "apply",
  "max-review",
  "phase",
  "adr",
  "concurrency",
  "max-tech",
]);
const BOOL_FLAGS = new Set([
  "semantic",
  "merge",
  "json",
  "refresh",
  "run-tests",
  "strict",
  "no-design",
  "prd",
  "no-prd",
  "allow-unverified",
  "from-srd",
  "eco",
  "list",
  "offline",
  "all",
]);

function fail(message: string): never {
  process.stderr.write(`construct: ${message}\n`);
  process.exit(1);
}

function oneOf<T extends string>(name: string, value: string, allowed: readonly T[]): T {
  if (!(allowed as readonly string[]).includes(value)) {
    fail(`invalid --${name} "${value}" (expected: ${allowed.join(", ")})`);
  }
  return value as T;
}

interface Parsed {
  command: string;
  positional: string[];
  values: Record<string, string>;
  bools: Set<string>;
}

export function parseArgs(argv: string[]): Parsed {
  if (argv.length === 0) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  if (argv[0] === "-h" || argv[0] === "--help") {
    process.stdout.write(HELP);
    process.exit(0);
  }
  if (argv[0] === "-v" || argv[0] === "--version") {
    process.stdout.write(VERSION + "\n");
    process.exit(0);
  }

  const command = argv[0]!;
  if (!COMMANDS.has(command)) {
    fail(`unknown command: ${command} (run --help for usage)`);
  }

  const values: Record<string, string> = {};
  const bools = new Set<string>();
  const positional: string[] = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(HELP);
      process.exit(0);
    }
    if (arg === "-v" || arg === "--version") {
      process.stdout.write(VERSION + "\n");
      process.exit(0);
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const key = eq !== -1 ? arg.slice(2, eq) : arg.slice(2);
      if (BOOL_FLAGS.has(key)) {
        if (eq !== -1) fail(`--${key} is a boolean flag and does not take a value`);
        bools.add(key);
        continue;
      }
      if (!VALUE_FLAGS.has(key)) {
        fail(`unknown flag: --${key} (run --help for the supported options)`);
      }
      let value: string;
      if (eq !== -1) {
        value = arg.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith("--")) {
          fail(`missing value for --${key}`);
        }
        value = next;
        i++;
      }
      values[key] = value;
      continue;
    }
    positional.push(arg);
  }
  return { command, positional, values, bools };
}

const ALL_ANGLES: Angle[] = ["market", "oss", "tech", "semantic"];
const DEFAULT_ANGLES: Angle[] = ["market", "oss", "tech"];

function parseAngles(s: string): Angle[] {
  const out: Angle[] = [];
  for (const t of s
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)) {
    if (!(ALL_ANGLES as string[]).includes(t)) fail(`unknown angle "${t}" (use: market,oss,tech,semantic)`);
    if (!out.includes(t as Angle)) out.push(t as Angle);
  }
  if (out.length === 0) fail("--angles resolved to nothing");
  return out;
}

function csv(s: string | undefined): string[] {
  return (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function requireOut(p: Parsed): string {
  // Use || (not ??) and trim so an empty `--out=` doesn't shadow a valid `--run`.
  const out = (p.values.out || p.values.run || "").trim();
  if (!out) fail("missing --out <run>");
  return resolve(out);
}

const warnBrief = (w: string): void => void process.stderr.write(`  ⚠ brief: ${w}\n`);

function buildResearchContext(p: Parsed, runDir: string, angles: Angle[]): ResearchContext {
  const brief = loadBrief(runDir, warnBrief);
  const perSource = p.values["per-source"] ? Number(p.values["per-source"]) : 6;
  if (!Number.isFinite(perSource) || perSource <= 0) fail("invalid --per-source");
  const concurrency = p.values.concurrency ? Number(p.values.concurrency) : FETCH_CONCURRENCY;
  if (!Number.isFinite(concurrency) || concurrency <= 0) fail("invalid --concurrency");
  const maxTech = p.values["max-tech"] ? Number(p.values["max-tech"]) : MAX_TECH;
  if (!Number.isFinite(maxTech) || maxTech <= 0) fail("invalid --max-tech");
  // The cache is process-wide (it sits under httpGet), so configure it once here
  // rather than threading it through every angle.
  configureCache({ refresh: p.bools.has("refresh"), offline: p.bools.has("offline") });
  // Same reasoning as the cache: the extraction layer sits under fetchAndExtract,
  // far below every angle, so it is configured once here instead of threaded.
  if (p.values.firecrawl) configureFirecrawl({ base: p.values.firecrawl });
  const webEngine = oneOf<WebEngine>("web-engine", p.values["web-engine"] ?? "auto", ["auto", "searxng", "ddg", "claude", "firecrawl"]);
  if (p.values.seeds) brief.ossSeeds = csv(p.values.seeds);
  return {
    brief,
    runDir,
    angles,
    query: p.values.q ?? p.values.question ?? "",
    webEngine,
    semantic: p.bools.has("semantic"),
    perSource,
    concurrency,
    maxTech,
    refresh: p.bools.has("refresh"),
    docsUrls: p.values["docs-url"] ? csv(p.values["docs-url"]) : undefined,
    marketUrls: p.values.url ? csv(p.values.url) : undefined,
  };
}

function printDrill(p: Parsed, results: SourceResult[], idea: string, angles: Angle[]): void {
  const evidence = assignIds(results);
  if (p.bools.has("json")) {
    process.stdout.write(JSON.stringify(evidence, null, 2) + "\n");
    return;
  }
  const meta: DossierMeta = {
    idea,
    angles,
    query: p.values.q ?? p.values.question,
    sources: [...new Set(evidence.map((e) => e.source))],
    semantic: false,
    evidenceCount: evidence.length,
    builtAt: new Date().toISOString(),
    notes: results.flatMap((r) => r.notes),
  };
  process.stdout.write(renderEvidenceMarkdown(evidence, meta) + "\n");
}

async function main(): Promise<void> {
  const p = parseArgs(process.argv.slice(2));

  switch (p.command) {
    case "init": {
      const idea = p.values.idea;
      if (!idea) fail('missing --idea "<one-liner>"');
      const out = p.values.out ? resolve(p.values.out) : resolve(slugify(idea) || "construct-run");
      const brief = initBrief(idea, new Date().toISOString());
      const path = saveBrief(out, brief);
      process.stderr.write(
        [
          `construct: scaffolded a run at ${out}`,
          `  brief:  ${path}`,
          `  next:   fill brief.json via the interview (product, users, goals, features,`,
          `          constraints, candidateTech, competitors, ossSeeds), then:`,
          `          construct research --out ${out}`,
        ].join("\n") + "\n",
      );
      return;
    }

    case "brainstorm": {
      const out = requireOut(p);
      // Brainstorm sits on top of the brief (it seeds the idea from it and folds
      // ideas back into it) — require an initialized run.
      const brief = loadBrief(out, warnBrief);
      if (p.bools.has("merge")) {
        const b = loadBrainstorm(out, warnBrief);
        if (!b) fail(`no brainstorm.json in ${out} — run \`construct brainstorm --out ${out}\` first to scaffold one.`);
        const r = mergeBrainstorm(brief, b!, new Date().toISOString(), warnBrief);
        saveBrief(out, r.brief);
        saveBrainstorm(out, r.brainstorm);
        writeBrainstormMd(out, r.brainstorm);
        if (p.bools.has("json")) {
          process.stdout.write(JSON.stringify({ merged: r.merged, parkedFolded: r.parkedFolded, skipped: r.skipped, proposed: r.proposed }, null, 2) + "\n");
          return;
        }
        process.stderr.write(
          [
            `construct: merged brainstorm → brief.json`,
            `  merged:   ${r.merged} kept idea(s) folded into the brief`,
            `  parked:   ${r.parkedFolded} parked idea(s) → openQuestions (🧠 — resolve before check passes)`,
            `  skipped:  ${r.skipped} kept idea(s) not merged (no target / conflict — see warnings)`,
            `  proposed: ${r.proposed} idea(s) still awaiting a decision`,
            `  next:     construct research --out ${out}`,
          ].join("\n") + "\n",
        );
        return;
      }
      // Scaffold or re-render the board (never clobbers existing ideas).
      let b = loadBrainstorm(out, warnBrief);
      if (!b) {
        b = initBrainstorm(brief.idea, new Date().toISOString());
        saveBrainstorm(out, b);
      }
      writeBrainstormMd(out, b);
      if (p.bools.has("json")) {
        process.stdout.write(JSON.stringify(b, null, 2) + "\n");
        return;
      }
      const c = brainstormCounts(b);
      process.stderr.write(
        [
          `construct: brainstorm board at ${join(out, "BRAINSTORM.md")}`,
          `  ideas:  ${b.ideas.length} (${c.kept} kept · ${c.parked} parked · ${c.proposed} proposed · ${c.rejected} rejected)`,
          `  next:   generate ideas WITH the user (references/brainstorm-playbook.md), mark statuses in`,
          `          brainstorm.json, then: construct brainstorm --out ${out} --merge`,
        ].join("\n") + "\n",
      );
      return;
    }

    case "research": {
      const out = requireOut(p);
      const angles = p.values.angles ? parseAngles(p.values.angles) : DEFAULT_ANGLES;
      const ctx = buildResearchContext(p, out, angles);
      const v = validateBrief(ctx.brief);
      for (const w of v.warnings) process.stderr.write(`  ⚠ ${w}\n`);
      const r = await runResearch(ctx, new Date().toISOString());
      if (p.bools.has("json")) {
        process.stdout.write(JSON.stringify({ dir: r.dir, meta: r.meta }, null, 2) + "\n");
        return;
      }
      const bySource = r.meta.sources.map((s) => `${s}: ${r.evidence.filter((e) => e.source === s).length}`);
      process.stderr.write(
        [
          `construct: ${r.evidence.length} evidence item(s) for "${ctx.brief.idea}"`,
          `  angles:   ${angles.join(", ")}`,
          `  sources:  ${bySource.join(" · ") || "(none)"}`,
          ...(r.meta.notes.length ? [`  notes:    ${r.meta.notes.length} (see EVIDENCE.md)`] : []),
          `  dossier:  ${r.paths.evidenceMd}`,
          `  next:     construct render --out ${out} [--level complex]`,
        ].join("\n") + "\n",
      );
      return;
    }

    case "web":
    case "oss":
    case "tech":
    case "so": {
      const out = requireOut(p);
      const ctx = buildResearchContext(p, out, [p.command === "web" ? "market" : (p.command as Angle)]);
      let results: SourceResult[];
      if (p.command === "web") {
        if (p.values.url) {
          const urls = csv(p.values.url);
          const q = ctx.query || urls.join(" ");
          // The user named these URLs explicitly: file them under the source kind
          // they asked for (default market) and fetch ALL of them, not half.
          const source = oneOf<SourceKind>("source", p.values.source ?? "market", ALL_SOURCE_KINDS);
          const { items, notes } = await webFetchUrls(urls, q, ctx.perSource, source, true);
          results = [{ source, items, notes }];
        } else {
          results = await marketAngle(ctx);
        }
      } else if (p.command === "oss") {
        results = await ossAngle(ctx);
      } else if (p.command === "tech") {
        results = await techAngle(ctx);
      } else {
        results = [await stackoverflow(ctx.query || ctx.brief.idea, ctx.perSource)];
      }
      printDrill(p, results, ctx.brief.idea, ctx.angles);
      return;
    }

    case "render": {
      const out = requireOut(p);
      // --from-srd re-emits the tree from an edited SRD.json without rebuilding
      // it from the brief + evidence — the enrich→re-render path.
      if (p.bools.has("from-srd")) {
        if (p.values.level) process.stderr.write("construct: --level is ignored with --from-srd (the manifest's level is authoritative).\n");
        if (p.bools.has("no-design"))
          process.stderr.write("construct: --no-design is ignored with --from-srd (re-run a full render to change the design subtree).\n");
        const r = renderFromSRD(out, { merge: p.bools.has("merge"), prd: p.bools.has("prd"), noPrd: p.bools.has("no-prd") });
        process.stderr.write(
          [
            `construct: re-emitted the SRD tree from ${join(out, "SRD.json")}`,
            `  files:    ${r.files.length} (${r.srd.functional.length} FR · ${r.srd.nonFunctional.length} NFR · ${r.srd.architecture.adrs.length} ADR)`,
            `  next:     construct check --out ${out}`,
          ].join("\n") + "\n",
        );
        return;
      }
      const brief = loadBrief(out, warnBrief);
      const v = validateBrief(brief);
      if (!v.ok) fail(`brief is incomplete:\n${v.errors.map((e) => "  - " + e).join("\n")}`);
      const level = oneOf<Level>("level", p.values.level ?? "light", ["light", "complex"]);
      const evidence = loadEvidence(out);
      const r = renderSRD(brief, evidence, {
        level,
        out,
        merge: p.bools.has("merge"),
        noDesign: p.bools.has("no-design"),
        prd: p.bools.has("prd"),
        noPrd: p.bools.has("no-prd"),
        generatedAt: new Date().toISOString(),
      });
      const design = r.srd.design;
      process.stderr.write(
        [
          `construct: rendered the ${level} SRD for "${brief.idea}"`,
          `  files:    ${r.files.length} (${r.srd.functional.length} FR · ${r.srd.nonFunctional.length} NFR · ${r.srd.architecture.adrs.length} ADR)`,
          ...(design ? [`  design:   ${design.components.length} components · ${design.tokens.length} tokens · a11y ${design.accessibility.standard}`] : []),
          `  manifest: ${join(out, "SRD.json")}`,
          `  next:     construct check --out ${out}`,
        ].join("\n") + "\n",
      );
      return;
    }

    case "analyze": {
      const out = requireOut(p);
      const r = analyzeRun(out);
      if (p.bools.has("json")) {
        process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      } else {
        process.stdout.write(formatGapReport(r, out) + "\n");
      }
      return; // informational — never gates
    }

    case "check": {
      const out = requireOut(p);
      let minGrounding: number | undefined;
      const rawMinGrounding = p.values["min-grounding"];
      if (rawMinGrounding !== undefined) {
        minGrounding = Number(rawMinGrounding);
        // Reject an empty/blank value: Number("") is 0, which would silently turn
        // the opt-in gate into a no-op (a 0% threshold always passes).
        if (rawMinGrounding.trim() === "" || !Number.isFinite(minGrounding) || minGrounding < 0 || minGrounding > 100) {
          fail("invalid --min-grounding (expected a number between 0 and 100)");
        }
      }
      const res = checkRun(out, { minGrounding, semantic: p.bools.has("semantic"), allowUnverified: p.bools.has("allow-unverified") });
      if (p.bools.has("json")) {
        process.stdout.write(JSON.stringify(res, null, 2) + "\n");
      } else {
        process.stdout.write(formatCheckReport(res, out) + "\n");
      }
      if (!res.ok) process.exit(1);
      return;
    }

    case "review": {
      const out = requireOut(p);
      if (p.values.apply) {
        const res = applyVerdicts(out, resolve(p.values.apply));
        if (p.bools.has("json")) process.stdout.write(JSON.stringify(res, null, 2) + "\n");
        else process.stdout.write(formatReviewReport(res) + "\n");
        if (!res.ok) process.exit(1);
        return;
      }
      let maxReview: number | undefined;
      if (p.values["max-review"] !== undefined) {
        maxReview = Number(p.values["max-review"]);
        if (p.values["max-review"].trim() === "" || !Number.isFinite(maxReview) || maxReview <= 0) fail("invalid --max-review");
      }
      const wl = runReview(out, { maxReview });
      if (p.bools.has("json")) {
        process.stdout.write(JSON.stringify(wl, null, 2) + "\n");
        return;
      }
      process.stderr.write(
        `construct: ${wl.pairs.length} claim↔evidence pair(s) → ${out}/VERIFY.md & VERIFY.todo.json\n` +
          `  adjudicate each verdict, save as verdicts.json, then: construct review --apply verdicts.json --out ${out}\n`,
      );
      return;
    }

    case "verify": {
      const out = requireOut(p);
      const res = verifyRun(out, {
        appDir: p.values.app ? resolve(p.values.app) : undefined,
        runTests: p.bools.has("run-tests"),
        strict: p.bools.has("strict"),
      });
      if (p.bools.has("json")) {
        process.stdout.write(JSON.stringify(res, null, 2) + "\n");
      } else {
        process.stdout.write(formatVerifyReport(res, out) + "\n");
      }
      if (!res.ok) process.exit(1);
      return;
    }

    case "status": {
      const out = requireOut(p);
      const plan = loadPlan(out);
      if (p.bools.has("json")) {
        // The build frontier — buildable tasks now, blocked tasks and what they
        // wait on. Lets the orchestrator fan out a milestone without eyeballing
        // the DAG (references/build-playbook.md). null when no plan exists yet.
        process.stdout.write(JSON.stringify(plan ? readyFrontier(plan) : null, null, 2) + "\n");
        return;
      }
      const has = (rel: string) => (existsSync(join(out, rel)) ? "✓" : "·");
      const planLine = plan
        ? `  ✓ BUILD-PLAN.json (build: ${plan.tasks.filter((t) => t.status === "done").length}/${plan.tasks.length} tasks done)`
        : `  · BUILD-PLAN.json (build plan)`;
      const bs = loadBrainstorm(out);
      const bsLine = bs
        ? (() => {
            const c = brainstormCounts(bs);
            return `  ✓ brainstorm.json (${c.kept} kept · ${c.parked} parked · ${c.proposed} proposed · ${c.rejected} rejected)`;
          })()
        : `  · brainstorm.json (optional divergence)`;
      process.stdout.write(
        [
          `construct status: ${out}`,
          bsLine,
          `  ${has("brief.json")} brief.json`,
          `  ${has("evidence/evidence.json")} evidence/evidence.json (research)`,
          `  ${has("SRD.json")} SRD.json (render)`,
          `  ${has("requirements/FUNCTIONAL.md")} requirements/FUNCTIONAL.md`,
          planLine,
          ``,
          `  Next: ${nextCommand(out, plan)}`,
        ].join("\n") + "\n",
      );
      return;
    }

    case "orchestrate": {
      // Family exit-code contract (shared with the sibling skills): 2 when the
      // run/phase is missing or not ready, naming the exact producing command.
      const rawOut = (p.values.out || p.values.run || "").trim();
      if (!rawOut) {
        process.stderr.write("construct orchestrate: --out <run> is required (the run folder to orchestrate).\n");
        process.exit(2);
      }
      const runDir = resolve(rawOut);
      // The engine's own absolute path — what the emitted artifacts tell
      // subagents to invoke, valid from any cwd (realpath so a symlinked
      // install still resolves).
      const engineAbs = realpathSync(fileURLToPath(import.meta.url));
      if (p.bools.has("list")) {
        if (!existsSync(runDir)) {
          process.stderr.write(`construct orchestrate: run dir not found: ${runDir}.\n`);
          process.exit(2);
        }
        process.stdout.write(JSON.stringify({ phases: listPhases(runDir, engineAbs) }, null, 2) + "\n");
        return;
      }
      const res = orchestrateRun(runDir, engineAbs, {
        phase: p.values.phase,
        adr: p.values.adr,
        eco: p.bools.has("eco"),
      });
      if (res.exitCode !== 0) {
        for (const e of res.errors) process.stderr.write(`construct orchestrate: ${e}\n`);
        process.exit(res.exitCode);
      }
      process.stderr.write("construct orchestrate: generated\n");
      for (const w of res.written) process.stderr.write(`  ${w}\n`);
      for (const n of res.notices) process.stderr.write(`construct orchestrate: note — ${n}\n`);
      const workflows = res.written.filter((w) => w.endsWith(".workflow.mjs"));
      if (workflows.length) {
        process.stderr.write("\n");
        for (const w of workflows) process.stderr.write(`Launch: Workflow({ scriptPath: ${JSON.stringify(w)} })\n`);
        process.stderr.write(
          "Then fold the returned fragments in yourself and run the fold command named at the tail of each workflow (you stay the sole writer).\n",
        );
      } else {
        process.stderr.write(`Follow ${join(runDir, "orchestration", "RUNBOOK.md")} sequentially (the eco path).\n`);
      }
      return;
    }

    case "semantic":
    case "firecrawl": {
      const action = p.positional[0] ?? "status";
      const r = stackControl(p.command, action);
      process.stdout.write(r.message + "\n");
      if (r.code !== 0) process.exit(r.code);
      return;
    }

    case "cache": {
      const action = p.positional[0] ?? "status";
      if (action === "clean") {
        const all = p.bools.has("all");
        const removed = cacheClean(all);
        const out = { action: "clean", all, removed, dir: cacheStats().dir };
        if (p.bools.has("json")) process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
        else process.stdout.write(`Removed ${removed} ${all ? "" : "stale "}cache entr${removed === 1 ? "y" : "ies"} from ${out.dir}\n`);
        return;
      }
      if (action !== "status") fail(`unknown cache action "${action}" — use status | clean`);
      const st = cacheStats();
      if (p.bools.has("json")) {
        process.stdout.write(`${JSON.stringify(st, null, 2)}\n`);
        return;
      }
      const mb = (st.bytes / (1024 * 1024)).toFixed(1);
      process.stdout.write(
        [
          `HTTP cache: ${st.dir}`,
          `  entries:  ${st.entries} (${st.fresh} fresh · ${st.stale} stale)`,
          `  size:     ${mb} MB`,
          `  ttl:      ${st.ttlHours} h (CONSTRUCT_CACHE_TTL_HOURS)`,
          ...(st.entries ? [`  oldest:   ${st.oldest}`, `  newest:   ${st.newest}`] : []),
          "",
          "  A cached page makes a `research` re-run free — which is what the",
          "  dig-deeper loop does on every fold-in. `--refresh` bypasses it,",
          "  `--offline` requires it, `cache clean [--all]` prunes it.",
        ].join("\n") + "\n",
      );
      return;
    }
  }
}

/**
 * The single command to run next, from what the run folder actually holds.
 *
 * A skill document can only stay short if the tool itself carries the pipeline
 * state. Without this, an agent resuming a run has to reconstruct where it got
 * to by reading eight prose steps and eyeballing a checklist.
 */
function nextCommand(out: string, plan: BuildPlanDoc | null): string {
  const has = (rel: string) => existsSync(join(out, rel));
  if (!has("brief.json")) return `construct init --idea "<one-liner>" --out ${out}   (then fill brief.json via the interview)`;
  if (!has("evidence/evidence.json")) return `construct research --out ${out} --angles market,oss,tech`;
  if (!has("SRD.json")) return `construct render --out ${out} --level complex`;
  if (plan?.tasks.length) {
    const done = plan.tasks.filter((t) => t.status === "done").length;
    if (done === plan.tasks.length) return `construct verify --out ${out} --run-tests --strict   (the build is complete — gate it)`;
    if (done > 0) return `construct status --out ${out} --json   (read the build frontier, then build the next ready task)`;
  }
  if (!has("VERIFY.json")) return `construct check --out ${out}   (then \`construct review\` to adjudicate the citations)`;
  return `construct check --out ${out} --semantic`;
}

function loadEvidence(runDir: string): EvidenceItem[] {
  const path = join(runDir, "evidence", "evidence.json");
  if (!existsSync(path)) return [];
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    // Reject not just non-arrays but malformed elements (a null/partial entry in
    // a hand-edited dossier otherwise crashes render at e.source).
    return Array.isArray(data) ? data.filter(isEvidenceItem) : [];
  } catch {
    return [];
  }
}

function isEvidenceItem(e: unknown): e is EvidenceItem {
  return !!e && typeof e === "object" && typeof (e as { id?: unknown }).id === "string" && typeof (e as { source?: unknown }).source === "string";
}

// Only run when invoked directly (node scripts/construct.mjs), not when imported
// by tests. Realpath both sides so a symlinked install path still matches.
function isInvokedDirectly(): boolean {
  const argv1 = process.argv[1];
  if (argv1 === undefined) return false;
  const modulePath = fileURLToPath(import.meta.url);
  try {
    if (realpathSync(argv1) === realpathSync(modulePath)) return true;
  } catch {
    /* a path may be virtual — fall through */
  }
  return import.meta.url === pathToFileURL(argv1).href;
}

if (isInvokedDirectly()) {
  main().catch((e) => fail((e as Error).message));
}
