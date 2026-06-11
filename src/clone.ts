import { existsSync, statSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { tmpdir } from "node:os";
import type { RepoRef } from "./types.js";
import { sh, slugify } from "./util.js";
import { GIT_CLONE_TIMEOUT_MS, GIT_FETCH_TIMEOUT_MS, GIT_RESET_TIMEOUT_MS } from "./config.js";

// Root of the on-disk clone/index cache. Everything construct writes for a repo
// lives under /tmp/construct/<slug>/ so repeated questions reuse the clone and
// the index instead of re-fetching.
export function cacheRoot(): string {
  return join(tmpdir(), "construct");
}

// Parse any repo identifier into a RepoRef. Accepts:
//   - a local directory path (absolute or relative, existing)
//   - https://host/owner/repo(.git)
//   - git@host:owner/repo.git
//   - host/owner/repo
//   - owner/repo            (shorthand → github.com)
// GitLab subgroups are preserved: owner holds the full namespace
// ("group/subgroup"), repo holds the final segment.
export function resolveRepo(raw: string): RepoRef {
  const trimmed = raw.trim();

  // Local directory takes precedence — lets you point construct at a checkout
  // you already have, with no network. Require a non-empty string so an empty
  // seed never silently resolves to the current working directory.
  if (trimmed) {
    const asPath = resolve(trimmed);
    if (existsSync(asPath) && statSync(asPath).isDirectory()) {
      return {
        raw: trimmed,
        host: "local",
        isLocal: true,
        slug: "local-" + slugify(basename(asPath) + "-" + asPath),
      };
    }
  }

  let host: string;
  let path: string; // owner(/subgroups)/repo, no host, no .git

  const scp = /^git@([^:]+):(.+)$/.exec(trimmed); // git@github.com:owner/repo.git
  // Any URL scheme (http(s)/ssh/git), case-insensitive, stripping userinfo+port.
  const url = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i.exec(trimmed);
  const hostPath = /^([a-z0-9.-]+\.[a-z]{2,})\/(.+)$/i.exec(trimmed); // host/owner/repo

  if (scp) {
    host = scp[1]!;
    path = scp[2]!;
  } else if (url) {
    host = url[1]!;
    path = url[2]!;
  } else if (hostPath) {
    host = hostPath[1]!;
    path = hostPath[2]!;
  } else if (/^[\w.-]+\/[\w.-]+$/.test(trimmed)) {
    // bare "owner/repo" shorthand → github
    host = "github.com";
    path = trimmed;
  } else {
    // Unrecognisable seed (free text, a bare relative path, empty). Return a
    // non-cloneable generic ref with no synthesised URL so callers fall back to
    // the raw text rather than minting a malformed github.com URL.
    return { raw: trimmed, host: "generic", isLocal: false, slug: slugify(trimmed) || "seed" };
  }

  host = host.toLowerCase();
  path = path.replace(/\.git$/, "").replace(/\/+$/, "");
  const segments = path.split("/").filter(Boolean);
  const repo = segments.length ? segments[segments.length - 1] : undefined;
  const owner = segments.length > 1 ? segments.slice(0, -1).join("/") : undefined;

  const cloneUrl = /^https?:\/\//i.test(trimmed) || scp ? trimmed : `https://${host}/${path}.git`;
  const webUrl = `https://${host}/${path}`;

  return {
    raw: trimmed,
    host,
    owner,
    repo,
    cloneUrl: cloneUrl.endsWith(".git") ? cloneUrl : `${cloneUrl}.git`,
    webUrl,
    isLocal: false,
    slug: slugify(`${host}/${path}`),
  };
}

// Ensure a working tree exists on disk for `ref`, returning its absolute path.
// Local repos are used in place. Remote repos are shallow-cloned into the cache
// (reused on subsequent runs unless `refresh`). Throws a readable error if the
// clone fails (private repo, bad URL, no network).
export function ensureClone(
  ref: RepoRef,
  opts: { refresh?: boolean; branch?: string } = {},
): string {
  if (ref.isLocal) return resolve(ref.raw);

  const dir = join(cacheRoot(), ref.slug);
  const alreadyCloned = existsSync(join(dir, ".git"));

  if (alreadyCloned && !opts.refresh) return dir;

  if (alreadyCloned && opts.refresh) {
    sh("git", ["-C", dir, "fetch", "--depth", "1", "origin"], { timeoutMs: GIT_FETCH_TIMEOUT_MS });
    sh("git", ["-C", dir, "reset", "--hard", "FETCH_HEAD"], { timeoutMs: GIT_RESET_TIMEOUT_MS });
    return dir;
  }

  mkdirSync(cacheRoot(), { recursive: true });
  const args = ["clone", "--depth", "1", "--filter=blob:none"];
  if (opts.branch) args.push("--branch", opts.branch);
  args.push(ref.cloneUrl!, dir);

  const res = sh("git", args, { timeoutMs: GIT_CLONE_TIMEOUT_MS });
  if (!res.ok) {
    // The first attempt can leave a partial, non-empty dir behind; git clone
    // refuses to write into it, so the retry would fail for the wrong reason.
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    // Retry without the partial-clone filter; some servers reject it.
    const fallback = sh(
      "git",
      ["clone", "--depth", "1", ...(opts.branch ? ["--branch", opts.branch] : []), ref.cloneUrl!, dir],
      { timeoutMs: GIT_CLONE_TIMEOUT_MS },
    );
    if (!fallback.ok) {
      throw new Error(
        `git clone failed for ${ref.cloneUrl}\n${(res.stderr || fallback.stderr).trim()}`,
      );
    }
  }
  if (!existsSync(dir) || readdirSync(dir).length === 0) {
    throw new Error(`clone produced an empty tree at ${dir}`);
  }
  return dir;
}

// The short HEAD commit of a working tree, when it is a git repo. Recorded in
// the dossier so an answer is pinned to an exact revision.
export function headCommit(dir: string): string | undefined {
  const res = sh("git", ["-C", dir, "rev-parse", "--short", "HEAD"]);
  return res.ok ? res.stdout.trim() : undefined;
}

// The `origin` remote URL of a working tree, if any. Lets a question asked
// against a LOCAL checkout still resolve the host's issues/PRs API.
export function originUrl(dir: string): string | undefined {
  const res = sh("git", ["-C", dir, "remote", "get-url", "origin"]);
  return res.ok && res.stdout.trim() ? res.stdout.trim() : undefined;
}
