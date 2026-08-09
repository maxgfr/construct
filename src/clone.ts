import { existsSync, statSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { tmpdir } from "node:os";
import type { RepoRef } from "./types.js";
import { shAsync, slugify } from "./util.js";
import { GIT_CLONE_TIMEOUT_MS, GIT_FETCH_TIMEOUT_MS, GIT_RESET_TIMEOUT_MS } from "./config.js";

// Root of the on-disk clone/index cache. Everything construct writes for a repo
// lives under /tmp/construct/<slug>/ so repeated questions reuse the clone and
// the index instead of re-fetching.
// Adopted from webindex v1.13: the engine's resolveRepo is a strict superset,
// parsing ssh://, git:// and file:// URLs plus userinfo and ports. ensureClone
// stays below — it keys clones under THIS repo's cacheRoot(), which the rest of
// the file and the cache commands read, and the engine keys them elsewhere.
export { resolveRepo } from "./engine.js";
import { resolveRepo } from "./engine.js";

export function cacheRoot(): string {
  return join(tmpdir(), "construct");
}

// Ensure a working tree exists on disk for `ref`, returning its absolute path.
// Local repos are used in place. Remote repos are shallow-cloned into the cache
// (reused on subsequent runs unless `refresh`). Throws a readable error if the
// clone fails (private repo, bad URL, no network).
export async function ensureClone(ref: RepoRef, opts: { refresh?: boolean; branch?: string } = {}): Promise<string> {
  if (ref.isLocal) return resolve(ref.raw);

  const dir = join(cacheRoot(), ref.slug);
  const alreadyCloned = existsSync(join(dir, ".git"));

  if (alreadyCloned && !opts.refresh) return dir;

  if (alreadyCloned && opts.refresh) {
    await shAsync("git", ["-C", dir, "fetch", "--depth", "1", "origin"], { timeoutMs: GIT_FETCH_TIMEOUT_MS });
    await shAsync("git", ["-C", dir, "reset", "--hard", "FETCH_HEAD"], { timeoutMs: GIT_RESET_TIMEOUT_MS });
    return dir;
  }

  mkdirSync(cacheRoot(), { recursive: true });
  const args = ["clone", "--depth", "1", "--filter=blob:none"];
  if (opts.branch) args.push("--branch", opts.branch);
  args.push(ref.cloneUrl!, dir);

  const res = await shAsync("git", args, { timeoutMs: GIT_CLONE_TIMEOUT_MS });
  if (!res.ok) {
    // No git at all is not a retryable clone failure — name the real problem.
    if (res.missing) {
      throw new Error(`git is not installed or not on PATH — cannot clone ${ref.cloneUrl}`);
    }
    // The first attempt can leave a partial, non-empty dir behind; git clone
    // refuses to write into it, so the retry would fail for the wrong reason.
    if (existsSync(dir)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch (e) {
        throw new Error(`could not remove the partial clone at ${dir} before retrying: ${(e as Error).message} — delete it manually and re-run`);
      }
    }
    // Retry without the partial-clone filter; some servers reject it.
    const fallback = await shAsync("git", ["clone", "--depth", "1", ...(opts.branch ? ["--branch", opts.branch] : []), ref.cloneUrl!, dir], {
      timeoutMs: GIT_CLONE_TIMEOUT_MS,
    });
    if (!fallback.ok) {
      // Both attempts can fail for different reasons — report each one labeled,
      // instead of whichever stderr happened to be non-empty.
      throw new Error(
        [
          `git clone failed for ${ref.cloneUrl}`,
          `  attempt 1 (--filter=blob:none): ${res.stderr.trim() || `exit ${res.status}`}`,
          `  attempt 2 (no filter):          ${fallback.stderr.trim() || `exit ${fallback.status}`}`,
        ].join("\n"),
      );
    }
  }
  if (!existsSync(dir) || readdirSync(dir).length === 0) {
    throw new Error(`clone produced an empty tree at ${dir}`);
  }
  return dir;
}
