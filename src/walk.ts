import { readdirSync, lstatSync, readFileSync } from "node:fs";
import { join, relative, sep, extname } from "node:path";

// Directories that never carry signal for a documentation/code question and
// would bloat the index (dependencies, build output, VCS internals, caches).
const IGNORE_DIRS = new Set([
  ".git", "node_modules", ".pnpm", "bower_components", "vendor", "dist", "build", "out",
  "target", ".next", ".nuxt", ".svelte-kit", ".turbo", "coverage", "__pycache__", ".venv",
  "venv", ".tox", ".mypy_cache", ".pytest_cache", ".gradle", ".idea", ".vscode", ".cache",
  "tmp", ".construct", "Pods", "DerivedData", ".terraform", "elm-stuff", ".dart_tool",
]);

// Lockfiles: huge, machine-generated, and pure noise for a code/docs question —
// they'd otherwise rank as keyword-dense "code" hits (e.g. package-lock.json
// matching a dependency name). Skipped entirely.
const LOCKFILES = new Set([
  "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb",
  "composer.lock", "cargo.lock", "poetry.lock", "pipfile.lock", "gemfile.lock", "go.sum",
  "flake.lock", "packages.lock.json", "podfile.lock", "mix.lock",
]);

// Binary / non-source extensions to skip when reading file contents.
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".icns", ".svg", ".pdf", ".zip",
  ".gz", ".tar", ".tgz", ".bz2", ".xz", ".7z", ".rar", ".jar", ".war", ".class", ".so", ".dylib",
  ".dll", ".exe", ".bin", ".o", ".a", ".wasm", ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp3",
  ".mp4", ".mov", ".avi", ".webm", ".wav", ".flac", ".ogg", ".lock", ".min.js", ".map",
]);

export interface WalkOptions {
  maxFileBytes?: number; // skip files larger than this (default 1 MiB)
  maxFiles?: number; // hard cap on indexed files (default 20000)
}

export interface WalkedFile {
  rel: string; // path relative to root, posix-style
  abs: string;
  size: number;
  ext: string;
}

// Recursively list source-like files under `root`, applying ignore rules. Pure
// filesystem walk — no git dependency, so it works on any directory.
export function walk(root: string, opts: WalkOptions = {}): WalkedFile[] {
  const maxFileBytes = opts.maxFileBytes ?? 1024 * 1024;
  const maxFiles = opts.maxFiles ?? 20_000;
  const out: WalkedFile[] = [];

  const stack: string[] = [root];
  while (stack.length) {
    if (out.length >= maxFiles) break;
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (out.length >= maxFiles) break; // hard cap, even inside one directory
      const abs = join(dir, name);
      let st;
      try {
        // lstat (not stat) so symlinks report as symlinks: a symlinked dir is
        // neither isDirectory nor isFile here, so it is skipped — no clone loops.
        st = lstatSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (IGNORE_DIRS.has(name)) continue;
        stack.push(abs);
        continue;
      }
      if (!st.isFile()) continue;
      if (st.size > maxFileBytes) continue;
      if (LOCKFILES.has(name.toLowerCase())) continue;
      const ext = extname(name).toLowerCase();
      if (BINARY_EXT.has(ext)) continue;
      if (name.endsWith(".min.js") || name.endsWith(".min.css")) continue;
      out.push({ rel: relative(root, abs).split(sep).join("/"), abs, size: st.size, ext });
    }
  }
  return out;
}

// Read a file as UTF-8, returning "" on any error (unreadable, vanished). Skips
// content that looks binary (a NUL byte in the first 4 KiB).
export function readText(abs: string): string {
  try {
    const buf = readFileSync(abs);
    const head = buf.subarray(0, 4096);
    if (head.includes(0)) return "";
    return buf.toString("utf8");
  } catch {
    return "";
  }
}
