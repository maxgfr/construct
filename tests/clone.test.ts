import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveRepo, ensureClone, cacheRoot } from "../src/clone.js";
import { shAsync } from "../src/util.js";

const okSh = { ok: true, status: 0, stdout: "", stderr: "", missing: false } as const;

// ensureClone shells out through util.ts::shAsync — mock it (keep the rest real).
vi.mock("../src/util.js", async (importActual) => {
  const real = await importActual<typeof import("../src/util.js")>();
  return { ...real, shAsync: vi.fn() };
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

  it("builds a clean cloneUrl from a URL with a trailing slash (never repo/.git)", () => {
    expect(resolveRepo("https://github.com/owner/repo/").cloneUrl).toBe("https://github.com/owner/repo.git");
    expect(resolveRepo("https://github.com/owner/repo.git/").cloneUrl).toBe("https://github.com/owner/repo.git");
    expect(resolveRepo("https://github.com/owner/repo").cloneUrl).toBe("https://github.com/owner/repo.git");
  });
});

describe("ensureClone failure reporting", () => {
  const shResult = (over: Partial<Awaited<ReturnType<typeof shAsync>>>) => ({ ok: false, status: 128, stdout: "", stderr: "", missing: false, ...over });

  it("names a missing git binary instead of a confusing clone failure", async () => {
    vi.mocked(shAsync).mockResolvedValue(shResult({ missing: true, status: null, stderr: "spawn git ENOENT" }));
    await expect(() => ensureClone(resolveRepo("owner/repo"))).rejects.toThrow(/git is not installed or not on PATH/);
    expect(vi.mocked(shAsync)).toHaveBeenCalledTimes(1); // no pointless fallback attempt
  });

  it("reports both labeled attempts when the clone and its fallback fail differently", async () => {
    vi.mocked(shAsync)
      .mockResolvedValueOnce(shResult({ stderr: "fatal: filter not supported" }))
      .mockResolvedValueOnce(shResult({ stderr: "fatal: repository not found" }));
    let msg = "";
    try {
      await ensureClone(resolveRepo("owner/repo"));
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/attempt 1 \(--filter=blob:none\): fatal: filter not supported/);
    expect(msg).toMatch(/attempt 2 \(no filter\): *fatal: repository not found/);
  });

  it("falls back to the exit code when an attempt produced no stderr", async () => {
    vi.mocked(shAsync).mockResolvedValue(shResult({ status: 130, stderr: "" }));
    await expect(() => ensureClone(resolveRepo("owner/repo"))).rejects.toThrow(/exit 130/);
  });
});

describe("ensureClone caching + success paths", () => {
  // Each test uses a distinct fixture slug so a leftover cache dir can't leak
  // across tests; every dir is removed in a finally.
  async function withCacheDir(seed: string, setup: (dir: string) => void, run: (dir: string) => Promise<void> | void): Promise<void> {
    const ref = resolveRepo(seed);
    const dir = join(cacheRoot(), ref.slug);
    rmSync(dir, { recursive: true, force: true });
    setup(dir);
    try {
      await run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("uses a local checkout in place, never shelling out", async () => {
    const local = mkdtempSync(join(tmpdir(), "construct-local-"));
    try {
      expect(await ensureClone(resolveRepo(local))).toBe(resolve(local));
      expect(vi.mocked(shAsync)).not.toHaveBeenCalled();
    } finally {
      rmSync(local, { recursive: true, force: true });
    }
  });

  it("reuses an already-cloned repo without fetching when not refreshing", async () => {
    await withCacheDir(
      "owner/reuse-fixture",
      (dir) => mkdirSync(join(dir, ".git"), { recursive: true }),
      async (dir) => {
        expect(await ensureClone(resolveRepo("owner/reuse-fixture"))).toBe(dir);
        expect(vi.mocked(shAsync)).not.toHaveBeenCalled();
      },
    );
  });

  it("fetches + hard-resets an existing clone under --refresh instead of re-cloning", async () => {
    await withCacheDir(
      "owner/refresh-fixture",
      (dir) => mkdirSync(join(dir, ".git"), { recursive: true }),
      async (dir) => {
        vi.mocked(shAsync).mockResolvedValue({ ...okSh });
        expect(await ensureClone(resolveRepo("owner/refresh-fixture"), { refresh: true })).toBe(dir);
        const args = vi.mocked(shAsync).mock.calls.map((c) => c[1]);
        expect(args[0]).toEqual(expect.arrayContaining(["fetch", "--depth", "1"]));
        expect(args[1]).toEqual(expect.arrayContaining(["reset", "--hard", "FETCH_HEAD"]));
      },
    );
  });

  it("throws when a 'successful' clone leaves an empty tree", async () => {
    await withCacheDir(
      "owner/empty-fixture",
      () => {},
      async () => {
        vi.mocked(shAsync).mockResolvedValue({ ...okSh });
        await expect(() => ensureClone(resolveRepo("owner/empty-fixture"))).rejects.toThrow(/empty tree/);
      },
    );
  });

  it("removes a partial clone before the no-filter retry", async () => {
    await withCacheDir(
      "owner/partial-fixture",
      async (dir) => {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "partial"), "x"); // a non-empty leftover from attempt 1
      },
      async () => {
        vi.mocked(shAsync)
          .mockResolvedValueOnce({ ok: false, status: 128, stdout: "", stderr: "filter unsupported", missing: false })
          .mockResolvedValueOnce({ ...okSh }); // fallback "succeeds" but writes nothing → empty tree
        await expect(() => ensureClone(resolveRepo("owner/partial-fixture"))).rejects.toThrow(/empty tree/);
        // the retry drops the partial-clone filter
        expect(vi.mocked(shAsync).mock.calls[1]![1]).not.toContain("--filter=blob:none");
      },
    );
  });
});
