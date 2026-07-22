// Thin adapter over the vendored codeindex engine (see scripts/sync-engine.mjs).
// construct only ever needed a flat file list (research language histograms,
// verify test counts), so the local walker clone was replaced by the shared
// engine — which additionally honors .gitignore, guards symlink escapes, and
// keeps ignore rules consistent across the whole skill family. Signatures are
// unchanged: walk() still returns the flat array construct's call sites expect
// (the engine's WalkedFile is a superset — it adds mtimeMs).
import { walk as engineWalk, readText, type WalkedFile, type WalkOptions } from "./vendor/codeindex-engine.mjs";

export type { WalkedFile, WalkOptions };
export { readText };

export function walk(root: string, opts: WalkOptions = {}): WalkedFile[] {
  return engineWalk(root, opts).files;
}
