import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveRepo, ensureClone, cacheRoot } from "../src/clone.js";

// src/clone.ts is now a shim over the vendored engine, so what is left to assert
// here is the WIRING, not the algorithm: that this repo still resolves seeds the
// way it did, and that clones still land where /tmp/construct has always been.
//
// The clone algorithm itself — the two labelled attempts, the partial-directory
// cleanup, the missing-git message, refresh, branches, reuse — is tested against
// a real local repository in webindex's own suite, which is where the code is.
// It used to be tested here by mocking `shAsync`, a seam the engine's internals
// do not pass through; keeping those cases would have meant asserting against a
// mock nothing calls.

describe("resolveRepo", () => {
  it("parses ssh:// and uppercase-scheme URLs without garbling the owner", () => {
    expect(resolveRepo("ssh://git@github.com/owner/repo.git")).toMatchObject({ host: "github.com", owner: "owner", repo: "repo" });
    expect(resolveRepo("ssh://git@gitlab.com/group/sub/repo.git")).toMatchObject({ host: "gitlab.com", owner: "group/sub", repo: "repo" });
    expect(resolveRepo("HTTPS://GitHub.com/Owner/Repo")).toMatchObject({ host: "github.com", owner: "Owner", repo: "Repo" });
  });

  it("parses scp, host/owner/repo, and bare owner/repo", () => {
    expect(resolveRepo("git@github.com:a/b.git")).toMatchObject({ host: "github.com", owner: "a", repo: "b" });
    expect(resolveRepo("gitlab.com/group/sub/repo")).toMatchObject({ host: "gitlab.com", owner: "group/sub", repo: "repo" });
    expect(resolveRepo("owner/repo")).toMatchObject({ host: "github.com", owner: "owner", repo: "repo" });
  });

  it("returns a non-cloneable generic ref for free text — never a malformed github URL", () => {
    const r = resolveRepo("my cool idea");
    expect(r.host).toBe("generic");
    expect(r.webUrl).toBeUndefined();
    expect(r.cloneUrl).toBeUndefined();
    expect(r.isLocal).toBe(false);
  });

  it("does not resolve an empty/whitespace seed to the current working directory", () => {
    const r = resolveRepo("   ");
    expect(r.isLocal).toBe(false);
    expect(r.host).toBe("generic");
  });

  it("treats an existing local directory as a local checkout", () => {
    const dir = mkdtempSync(join(tmpdir(), "construct-clone-"));
    expect(resolveRepo(dir)).toMatchObject({ isLocal: true, host: "local" });
    rmSync(dir, { recursive: true, force: true });
  });

  it("builds a clean cloneUrl from a URL with a trailing slash (never repo/.git)", () => {
    expect(resolveRepo("https://github.com/owner/repo/").cloneUrl).toBe("https://github.com/owner/repo.git");
    expect(resolveRepo("https://github.com/owner/repo.git/").cloneUrl).toBe("https://github.com/owner/repo.git");
    expect(resolveRepo("https://github.com/owner/repo").cloneUrl).toBe("https://github.com/owner/repo.git");
  });
});

describe("where clones land", () => {
  it("still keys them under /tmp/construct, so an existing cache is not orphaned", () => {
    // The whole reason `ensureClone` was forked for so long. The engine takes
    // the directory from the brand now (src/engine.ts), and this is the
    // assertion that says adopting it did not quietly move anybody's clones.
    expect(cacheRoot()).toBe(join(tmpdir(), "construct"));
  });

  it("uses a local checkout in place rather than cloning it", async () => {
    const local = mkdtempSync(join(tmpdir(), "construct-local-"));
    try {
      expect(await ensureClone(resolveRepo(local))).toBe(resolve(local));
    } finally {
      rmSync(local, { recursive: true, force: true });
    }
  });

  it("reuses an already-cloned repo instead of fetching it again", async () => {
    const ref = resolveRepo("owner/reuse-fixture");
    const dir = join(cacheRoot(), ref.slug);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, ".git"), { recursive: true });
    try {
      // No network and no `git`: a clone that is already there is answered from
      // disk, which is what makes a re-run of the same research cheap.
      expect(await ensureClone(ref)).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
