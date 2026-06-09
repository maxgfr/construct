import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveRepo } from "../src/clone.js";

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
