import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { srdManifestPath } from "./srd.js";
import { buildPlanPath, loadPlan } from "./plan.js";
import { walk, readText } from "./walk.js";
import { sh } from "./util.js";
import { VERIFY_COMMAND_TIMEOUT_MS } from "./config.js";
import { BUILD_PLAN_SCHEMA_VERSION } from "./types.js";
import type { BuildPlanDoc, FrTestCoverage, SRD, VerifyResult } from "./types.js";

// `construct verify` — does the built app match BUILD-PLAN.json and the SRD?
//
// Static by default (pure reads): plan well-formed, DAG acyclic, every ref
// resolves into SRD.json, done tasks' artifacts/tests exist, and every FR is
// referenced by at least one test (greps conventions.frTagPattern). Command
// execution — the app's own test suite and per-task verify commands — is
// strictly opt-in via --run-tests, because running user-declared commands is
// side-effectful. The engine verifies; it never writes app code.

export interface VerifyOptions {
  appDir?: string;
  runTests?: boolean;
  strict?: boolean;
}

// Dotted (.test.ts/.spec.js), suffixed (foo_test.go/foo_spec.rb) and
// pytest-prefixed (test_foo.py) conventions.
const TEST_FILE_RE = /\.(test|spec)\.[^./]+$|_(test|spec)\.[^./]+$|(^|\/)test_[^/]+\.[^./]+$/i;
// JVM/C# suffix style (FooTest.java, FooTests.cs). Case-SENSITIVE on purpose:
// `latest.java` must not match.
const TEST_SUFFIX_RE = /(^|\/)[^/]*[A-Z]\w*Tests?\.(java|kt|kts|cs|scala|groovy)$/;
const TEST_DIR_RE = /(^|\/)(tests?|__tests__|spec|specs|e2e)\//i;

export function isTestFile(rel: string): boolean {
  return TEST_FILE_RE.test(rel) || TEST_SUFFIX_RE.test(rel) || TEST_DIR_RE.test(rel);
}

function detectCycle(plan: BuildPlanDoc): string | null {
  const byId = new Map(plan.tasks.map((t) => [t.id, t]));
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string, path: string[]): string | null => {
    const s = state.get(id);
    if (s === "done") return null;
    if (s === "visiting") return [...path, id].join(" → ");
    state.set(id, "visiting");
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      if (!byId.has(dep)) continue; // dangling deps reported separately
      const cyc = visit(dep, [...path, id]);
      if (cyc) return cyc;
    }
    state.set(id, "done");
    return null;
  };
  for (const t of plan.tasks) {
    const cyc = visit(t.id, []);
    if (cyc) return cyc;
  }
  return null;
}

// Run a declared command line through the platform shell (the command is the
// agent/user's own toolchain — pnpm test, cargo test…), bounded by a timeout.
function runCommand(command: string, cwd: string): { command: string; ok: boolean; exitCode: number | null } {
  const r =
    process.platform === "win32"
      ? sh("cmd", ["/c", command], { cwd, timeoutMs: VERIFY_COMMAND_TIMEOUT_MS })
      : sh("sh", ["-c", command], { cwd, timeoutMs: VERIFY_COMMAND_TIMEOUT_MS });
  return { command, ok: r.ok, exitCode: r.status };
}

export function verifyRun(runDir: string, opts: VerifyOptions = {}): VerifyResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const frTestCoverage: FrTestCoverage[] = [];

  // --- Load the plan and the SRD. ------------------------------------------
  const planPath = buildPlanPath(runDir);
  if (!existsSync(planPath)) {
    errors.push(`No BUILD-PLAN.json in ${runDir} — render the SRD first (construct render).`);
    return { ok: false, errors, warnings, frTestCoverage };
  }
  const plan = loadPlan(runDir);
  if (!plan) {
    errors.push(`BUILD-PLAN.json is unreadable or malformed.`);
    return { ok: false, errors, warnings, frTestCoverage };
  }
  if (plan.schemaVersion !== BUILD_PLAN_SCHEMA_VERSION) {
    errors.push(`BUILD-PLAN.json schemaVersion ${plan.schemaVersion} is not supported (expected ${BUILD_PLAN_SCHEMA_VERSION}).`);
    return { ok: false, errors, warnings, frTestCoverage };
  }
  const manifest = srdManifestPath(runDir);
  if (!existsSync(manifest)) {
    errors.push(`No SRD.json in ${runDir} — the plan cannot be verified against a missing SRD.`);
    return { ok: false, errors, warnings, frTestCoverage };
  }
  let srd: SRD;
  try {
    srd = JSON.parse(readFileSync(manifest, "utf8")) as SRD;
  } catch (e) {
    errors.push(`SRD.json is unreadable: ${(e as Error).message}`);
    return { ok: false, errors, warnings, frTestCoverage };
  }

  // --- Plan integrity: ids, DAG, reference closure into the SRD. -----------
  const ids = new Set<string>();
  for (const t of plan.tasks) {
    if (ids.has(t.id)) errors.push(`Duplicate task id ${t.id}.`);
    ids.add(t.id);
  }
  const frById = new Map(srd.functional.map((f) => [f.id, f]));
  for (const t of plan.tasks) {
    for (const dep of t.dependsOn) {
      if (!ids.has(dep)) errors.push(`${t.id} depends on unknown task "${dep}".`);
    }
    for (const frId of t.frIds) {
      if (!frById.has(frId)) errors.push(`${t.id} references unknown requirement "${frId}".`);
    }
    for (const a of t.acceptance) {
      const fr = frById.get(a.frId);
      if (!fr) errors.push(`${t.id} acceptance ref points at unknown requirement "${a.frId}".`);
      else if (!Number.isInteger(a.index) || a.index < 0 || a.index >= fr.acceptance.length) {
        errors.push(`${t.id} acceptance ref ${a.frId}[${a.index}] is out of range (FR has ${fr.acceptance.length} criteria).`);
      }
    }
  }
  const plannedFrs = new Set(plan.tasks.flatMap((t) => t.frIds));
  for (const f of srd.functional) {
    if (!plannedFrs.has(f.id)) warnings.push(`${f.id} is in the SRD but no build task implements it — re-render to refresh the plan.`);
  }
  const cycle = detectCycle(plan);
  if (cycle) errors.push(`Task dependency cycle: ${cycle}.`);

  // --- The app directory. ---------------------------------------------------
  const rawApp = opts.appDir ?? plan.conventions.appDir ?? undefined;
  const appDir = rawApp ? (isAbsolute(rawApp) ? rawApp : resolve(runDir, rawApp)) : undefined;
  const doneTasks = plan.tasks.filter((t) => t.status === "done");
  if (!appDir) {
    if (doneTasks.length) {
      errors.push(`${doneTasks.length} task(s) are done but no app directory is declared — pass --app <dir> or set conventions.appDir.`);
    } else {
      warnings.push(`No app directory declared yet (conventions.appDir / --app) — file and test checks skipped.`);
    }
    const ok = errors.length === 0;
    return { ok, errors, warnings, frTestCoverage };
  }
  if (!existsSync(appDir)) {
    errors.push(`App directory does not exist: ${appDir}.`);
    return { ok: false, errors, warnings, frTestCoverage };
  }

  // --- Done tasks: declared artifacts and tests must exist. -----------------
  for (const t of doneTasks) {
    for (const rel of [...t.artifacts, ...t.tests]) {
      if (!existsSync(join(appDir, rel))) errors.push(`${t.id} is done but its declared file is missing: ${rel}.`);
    }
    if (t.frIds.length && t.tests.length === 0) {
      warnings.push(`${t.id} is done but declares no tests — record the test files that exercise ${t.frIds.join(", ")}.`);
    }
  }

  // --- FR → test coverage (greps the FR-tag convention). --------------------
  let tagRe: RegExp | null = null;
  try {
    tagRe = new RegExp(plan.conventions.frTagPattern, "g");
  } catch {
    errors.push(`conventions.frTagPattern is not a valid regex: ${plan.conventions.frTagPattern}.`);
  }
  if (tagRe) {
    const testFiles = walk(appDir).filter((f) => isTestFile(f.rel));
    const refs = new Map<string, string[]>(); // FR id → test files naming it
    for (const f of testFiles) {
      const text = readText(f.abs);
      if (!text) continue;
      tagRe.lastIndex = 0;
      const found = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = tagRe.exec(text))) found.add(m[0]);
      for (const id of found) {
        if (!refs.has(id)) refs.set(id, []);
        refs.get(id)!.push(f.rel);
      }
    }
    // Stale tags: a test naming an FR the SRD no longer has usually means the
    // ids shifted on a re-render — retag before trusting the coverage below.
    const known = new Set(srd.functional.map((f) => f.id));
    const stale = [...refs.keys()].filter((id) => !known.has(id)).sort();
    if (stale.length) {
      warnings.push(`Tests reference FR id(s) absent from the SRD (${stale.join(", ")}) — ids may have shifted on a re-render; retag the tests.`);
    }
    for (const fr of srd.functional) {
      const files = (refs.get(fr.id) ?? []).sort();
      frTestCoverage.push({ fr: fr.id, priority: fr.priority, testFiles: files });
      // Only gate FRs someone claims to have built: an FR whose task is still
      // todo has honestly not been tested yet.
      const claimed = plan.tasks.some((t) => t.frIds.includes(fr.id) && t.status === "done");
      if (files.length === 0 && claimed) {
        const msg = `${fr.id} (${fr.priority}) is built but no test references it — name the FR id in a test (pattern: ${plan.conventions.frTagPattern}).`;
        if (opts.strict && fr.priority === "must") errors.push(msg);
        else warnings.push(msg);
      }
    }
  }

  // --- Opt-in command execution. --------------------------------------------
  let commandResults: VerifyResult["commandResults"];
  if (opts.runTests) {
    commandResults = [];
    if (plan.conventions.testCommand) {
      const r = runCommand(plan.conventions.testCommand, appDir);
      commandResults.push(r);
      if (!r.ok) errors.push(`Test command failed (exit ${r.exitCode}): ${r.command}`);
    } else {
      warnings.push(`--run-tests requested but conventions.testCommand is not set.`);
    }
    for (const t of doneTasks) {
      for (const cmd of t.verify.commands) {
        const r = runCommand(cmd, appDir);
        commandResults.push(r);
        if (!r.ok) errors.push(`${t.id} verify command failed (exit ${r.exitCode}): ${cmd}`);
      }
    }
  }

  const ok = errors.length === 0;
  return { ok, errors, warnings, frTestCoverage, commandResults };
}

export function formatVerifyReport(r: VerifyResult, runDir: string): string {
  const lines: string[] = [];
  lines.push(`construct verify: ${runDir}`);
  lines.push(``);
  lines.push(`Plan & artifacts (hard):`);
  for (const e of r.errors) lines.push(`  ✗ ${e}`);
  for (const w of r.warnings) lines.push(`  ⚠ ${w}`);
  lines.push(r.ok ? `  ✓ build state is consistent with the plan and the SRD` : `  ✗ build state does NOT match the plan/SRD`);
  if (r.frTestCoverage.length) {
    lines.push(``);
    lines.push(`Requirement → test coverage:`);
    for (const c of r.frTestCoverage) {
      lines.push(`  ${c.testFiles.length ? "✓" : "·"} ${c.fr} (${c.priority}): ${c.testFiles.length ? c.testFiles.join(", ") : "no test references it"}`);
    }
  }
  if (r.commandResults) {
    lines.push(``);
    lines.push(`Commands (--run-tests):`);
    for (const c of r.commandResults) lines.push(`  ${c.ok ? "✓" : "✗"} ${c.command} (exit ${c.exitCode})`);
  }
  return lines.join("\n");
}
