import { execFile, spawnSync } from "node:child_process";
import { SH_DEFAULT_TIMEOUT_MS } from "./config.js";

// Result of a subprocess call. `ok` is true on exit code 0 with the binary
// found; `missing` is true when the binary isn't on PATH (so callers can fall
// back gracefully instead of crashing — e.g. no ripgrep, no gh, no docker).
export interface ShResult {
  ok: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
  missing: boolean;
}

// Run a command synchronously. Sync keeps the CLI simple and deterministic
// (mirrors how the engine is structured); the work is I/O-bound git/rg/gh calls
// where parallelism buys little. `input` feeds stdin; `maxBuffer` is generous
// for large `rg --json` / `git log` output.
export function sh(cmd: string, args: string[], opts: { cwd?: string; input?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): ShResult {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd,
    input: opts.input,
    encoding: "utf8",
    timeout: opts.timeoutMs ?? SH_DEFAULT_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
    env: opts.env ?? process.env,
  });
  const missing = !!res.error && (res.error as NodeJS.ErrnoException).code === "ENOENT";
  return {
    ok: !res.error && res.status === 0,
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? (res.error ? String(res.error.message) : ""),
    missing,
  };
}

/**
 * The async twin of `sh` — same result shape, but it does NOT block the event
 * loop.
 *
 * This matters in exactly one place and it matters a lot: the research angles
 * run concurrently (`Promise.all` in research/registry.ts), and the `oss` angle
 * shells out to `git clone` and `gh`. Under `spawnSync` those calls froze the
 * whole process, so the market and tech angles' in-flight fetches stopped
 * progressing until the clone finished — the concurrency was nominal. A baseline
 * run spent 13.7 s inside the oss angle without issuing a single HTTP request.
 *
 * Sequential callers (verify's test commands, docker compose) keep using `sh`:
 * there is nothing to overlap there, and sync keeps them simple.
 */
export function shAsync(cmd: string, args: string[], opts: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<ShResult> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      {
        cwd: opts.cwd,
        encoding: "utf8",
        timeout: opts.timeoutMs ?? SH_DEFAULT_TIMEOUT_MS,
        maxBuffer: 64 * 1024 * 1024,
        env: opts.env ?? process.env,
      },
      (error, stdout, stderr) => {
        const err = error as (Error & { code?: number | string; killed?: boolean }) | null;
        const missing = !!err && err.code === "ENOENT";
        // execFile reports the exit code on `error.code` for a non-zero exit and
        // leaves it unset on success; normalise to sh()'s `status` contract.
        const status = !err ? 0 : typeof err.code === "number" ? err.code : null;
        resolve({ ok: !err, status, stdout: stdout ?? "", stderr: stderr || (err ? String(err.message) : ""), missing });
      },
    );
  });
}

// Is a binary available on PATH? Cached because we probe the same few tools
// (rg, gh, git, docker) repeatedly within a run.
const whichCache = new Map<string, boolean>();
export function have(cmd: string): boolean {
  const cached = whichCache.get(cmd);
  if (cached !== undefined) return cached;
  const probe = sh(process.platform === "win32" ? "where" : "which", [cmd]);
  const found = probe.ok && probe.stdout.trim().length > 0;
  whichCache.set(cmd, found);
  return found;
}

// Turn an arbitrary repo identifier into a filesystem-safe cache slug, e.g.
// "github.com/expressjs/express" -> "github.com-expressjs-express".
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^git@/, "")
    .replace(/\.git$/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

// Pull the meaningful keywords out of a natural-language question: lowercase,
// split on non-word chars, drop stopwords and very short tokens, dedupe. Used
// to drive lexical search and symbol ranking deterministically (no LLM).
// Keyword extraction now comes from the vendored webindex engine. Its tokeniser
// is Unicode-aware where this copy was ASCII-only, so an accented term survives
// as one keyword instead of splitting at the accent — and its stopword list
// covers French question scaffolding, which this product is written in.
export { keywords, rankedKeywords, isStopword } from "./engine.js";
