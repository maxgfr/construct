#!/usr/bin/env node
// Phase-by-phase timing for a construct run — the baseline any perf work is
// measured against.
//
//   node scripts/bench.mjs              # offline: render + check from fixtures
//   node scripts/bench.mjs --network    # full loop, real retrieval
//   node scripts/bench.mjs --json       # machine-readable
//
// Offline mode is deterministic and safe in CI: it exercises the render/check
// path from the committed fixtures. --network additionally runs `research` and
// `analyze` against the live web, which is where the wall-clock actually goes —
// use it when tuning retrieval, and record the numbers so the next change has
// something to beat.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engine = join(root, "scripts", "construct.mjs");
const fixtures = join(root, "tests", "fixtures");

const args = process.argv.slice(2);
const network = args.includes("--network");
const asJson = args.includes("--json");

const runDir = mkdtempSync(join(tmpdir(), "construct-bench-"));
process.on("exit", () => rmSync(runDir, { recursive: true, force: true }));

function phase(name, argv) {
  const started = performance.now();
  const res = spawnSync(process.execPath, [engine, ...argv], { encoding: "utf8" });
  const ms = Math.round(performance.now() - started);
  return { name, ms, status: res.status ?? -1, stderr: (res.stderr || "").trim(), stdout: res.stdout || "" };
}

const phases = [];

if (network) {
  phases.push(phase("init", ["init", "--idea", readFixtureIdea(), "--out", runDir]));
  // Re-seed the full brief so retrieval has real competitors/tech to work with.
  cpSync(join(fixtures, "sample-brief.json"), join(runDir, "brief.json"));
  phases.push(phase("research", ["research", "--out", runDir, "--angles", "market,oss,tech"]));
  phases.push(phase("analyze", ["analyze", "--out", runDir]));
} else {
  mkdirSync(join(runDir, "evidence"), { recursive: true });
  cpSync(join(fixtures, "sample-brief.json"), join(runDir, "brief.json"));
  cpSync(join(fixtures, "sample-evidence.json"), join(runDir, "evidence", "evidence.json"));
}

phases.push(phase("render", ["render", "--out", runDir, "--level", "complex", "--merge"]));
phases.push(phase("check", ["check", "--out", runDir]));

function readFixtureIdea() {
  return JSON.parse(readFileSync(join(fixtures, "sample-brief.json"), "utf8")).idea;
}

// Retrieval cost, when there was any retrieval.
let retrieval = null;
const metaPath = join(runDir, "evidence", "meta.json");
if (network && existsSync(metaPath)) {
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  retrieval = {
    evidenceCount: meta.evidenceCount ?? 0,
    timings: meta.timings ?? [],
    requests: (meta.timings ?? []).reduce((n, t) => n + t.requests, 0),
    cacheHits: (meta.timings ?? []).reduce((n, t) => n + t.cacheHits, 0),
    bytes: (meta.timings ?? []).reduce((n, t) => n + t.bytes, 0),
  };
}

const total = phases.reduce((n, p) => n + p.ms, 0);
const report = { mode: network ? "network" : "offline", totalMs: total, phases, retrieval };

if (asJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`construct bench — ${report.mode}\n\n`);
  const w = Math.max(...phases.map((p) => p.name.length));
  for (const p of phases) {
    const flag = p.status === 0 ? "" : `  [exit ${p.status}]`;
    process.stdout.write(`  ${p.name.padEnd(w)}  ${String(p.ms).padStart(7)} ms${flag}\n`);
  }
  process.stdout.write(`  ${"total".padEnd(w)}  ${String(total).padStart(7)} ms\n`);
  if (retrieval) {
    process.stdout.write(`\n  retrieval: ${retrieval.evidenceCount} items · ${retrieval.requests} requests · ${retrieval.cacheHits} cache hits\n`);
    for (const t of retrieval.timings) {
      process.stdout.write(`    ${t.angle.padEnd(9)} ${String(t.ms).padStart(7)} ms · ${t.requests} req · ${t.cacheHits} hit\n`);
    }
  }
  const failed = phases.filter((p) => p.status !== 0);
  if (failed.length) {
    process.stdout.write(`\n  ${failed.length} phase(s) exited non-zero:\n`);
    for (const p of failed) process.stdout.write(`    ${p.name}: ${p.stderr.split("\n").slice(0, 3).join(" / ")}\n`);
  }
}
