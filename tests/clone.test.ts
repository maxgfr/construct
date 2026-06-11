import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveRepo, ensureClone } from "../src/clone.js";
import { sh } from "../src/util.js";

// ensureClone shells out through util.ts::sh — mock it (keep the rest real).
vi.mock("../src/util.js", async (importActual) => {
  const real = await importActual<typeof import("../src/util.js")>();
  return { ...real, sh: vi.fn() };
});

afterEach(() => vi.clearAllMocks());

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
});

describe("ensureClone failure reporting", () => {
  const shResult = (over: Partial<ReturnType<typeof sh>>) => ({ ok: false, status: 128, stdout: "", stderr: "", missing: false, ...over });

  it("names a missing git binary instead of a confusing clone failure", () => {
    vi.mocked(sh).mockReturnValue(shResult({ missing: true, status: null, stderr: "spawn git ENOENT" }));
    expect(() => ensureClone(resolveRepo("owner/repo"))).toThrow(/git is not installed or not on PATH/);
    expect(vi.mocked(sh)).toHaveBeenCalledTimes(1); // no pointless fallback attempt
  });

  it("reports both labeled attempts when the clone and its fallback fail differently", () => {
    vi.mocked(sh)
      .mockReturnValueOnce(shResult({ stderr: "fatal: filter not supported" }))
      .mockReturnValueOnce(shResult({ stderr: "fatal: repository not found" }));
    let msg = "";
    try {
      ensureClone(resolveRepo("owner/repo"));
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/attempt 1 \(--filter=blob:none\): fatal: filter not supported/);
    expect(msg).toMatch(/attempt 2 \(no filter\): *fatal: repository not found/);
  });

  it("falls back to the exit code when an attempt produced no stderr", () => {
    vi.mocked(sh).mockReturnValue(shResult({ status: 130, stderr: "" }));
    expect(() => ensureClone(resolveRepo("owner/repo"))).toThrow(/exit 130/);
  });
});
