import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { walk, readText } from "../src/walk.js";

const dirs: string[] = [];
function freshDir(): string {
  const d = mkdtempSync(join(tmpdir(), "construct-walk-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function seed(root: string, rel: string, content = "x"): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}

describe("walk", () => {
  it("skips dependency/VCS/build dirs, lockfiles and binary extensions", () => {
    const root = freshDir();
    seed(root, "src/index.ts");
    seed(root, "node_modules/dep/index.js");
    seed(root, ".git/HEAD");
    seed(root, "dist/bundle.js");
    seed(root, "pnpm-lock.yaml");
    seed(root, "logo.png");
    seed(root, "app.min.js");
    const rels = walk(root).map((f) => f.rel);
    expect(rels).toEqual(["src/index.ts"]);
  });

  it("skips files larger than maxFileBytes and honours the maxFiles cap", () => {
    const root = freshDir();
    seed(root, "small.ts", "ok");
    seed(root, "big.ts", "y".repeat(64));
    expect(walk(root, { maxFileBytes: 32 }).map((f) => f.rel)).toEqual(["small.ts"]);
    seed(root, "a.ts");
    seed(root, "b.ts");
    expect(walk(root, { maxFiles: 2 })).toHaveLength(2);
  });

  it("reports rel posix-style even for nested paths", () => {
    const root = freshDir();
    seed(root, "a/b/c.ts");
    const [f] = walk(root);
    expect(f!.rel).toBe("a/b/c.ts");
    expect(f!.ext).toBe(".ts");
    expect(f!.size).toBe(1);
  });

  it.skipIf(process.platform === "win32")("does not follow directory symlinks (no clone loops)", () => {
    const root = freshDir();
    seed(root, "real/file.ts");
    symlinkSync(join(root, "real"), join(root, "loop"), "dir");
    const rels = walk(root).map((f) => f.rel);
    expect(rels).toEqual(["real/file.ts"]); // the symlinked dir is not traversed
  });
});

describe("readText", () => {
  it("returns '' for binary-looking content (NUL byte) and missing files", () => {
    const root = freshDir();
    const bin = join(root, "blob");
    writeFileSync(bin, Buffer.from([0x68, 0x00, 0x69]));
    expect(readText(bin)).toBe("");
    expect(readText(join(root, "nope.txt"))).toBe("");
  });

  it("reads UTF-8 text", () => {
    const root = freshDir();
    const f = join(root, "t.md");
    writeFileSync(f, "héllo");
    expect(readText(f)).toBe("héllo");
  });
});
