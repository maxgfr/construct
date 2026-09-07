import { afterEach, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyRun } from "../src/verify.js";
import type { AcceptanceBinding } from "../src/types.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "ct-acceptance-"));
  dirs.push(dir);
  const app = join(dir, "app");
  mkdirSync(app);
  const srd = {
    functional: [
      {
        id: "FR-001",
        title: "Remember",
        description: "Store values privately",
        priority: "must",
        acceptance: [
          { given: "a value", when: "saved", then: "it is remembered" },
          { given: "another user", when: "reading", then: "access is denied" },
        ],
      },
    ],
  };
  const plan = {
    schemaVersion: 1,
    conventions: { appDir: app, frTagPattern: "FR-\\d{3}", testCommand: null },
    tasks: [
      {
        id: "T-001",
        frIds: ["FR-001"],
        acceptance: [
          { frId: "FR-001", index: 0 },
          { frId: "FR-001", index: 1 },
        ],
        dependsOn: [],
        artifacts: [],
        tests: ["app.test.js"],
        status: "done",
        verify: { commands: [], criteria: [] as AcceptanceBinding[] },
      },
    ],
  };
  writeFileSync(join(app, "app.test.js"), "// FR-001 only a tag");
  writeFileSync(join(app, "criterion.mjs"), "console.log('assertion executed');");
  const save = () => {
    writeFileSync(join(dir, "SRD.json"), JSON.stringify(srd));
    writeFileSync(join(dir, "BUILD-PLAN.json"), JSON.stringify(plan));
  };
  save();
  const check = (runTests = false) => verifyRun(dir, { acceptance: true, runTests });
  const bind = () => {
    const result = check();
    expect(result.acceptanceResults).toHaveLength(2);
    plan.tasks[0]!.verify.criteria = result.acceptanceResults!.map((c) => ({
      frId: c.frId,
      index: c.index,
      fingerprint: c.fingerprint,
      command: "node criterion.mjs",
    }));
    save();
  };
  return { dir, app, srd, plan, save, check, bind };
}

it("a tag alone cannot pass acceptance execution, and absent authority runs nothing", () => {
  const f = fixture();
  expect(f.check().ok).toBe(false);
  f.bind();
  writeFileSync(join(f.app, "criterion.mjs"), "import fs from 'node:fs'; fs.writeFileSync('executed', 'yes');");
  const result = f.check();
  expect(result.acceptanceResults!.map((c) => c.status)).toEqual(["not-tested", "not-tested"]);
  expect(existsSync(join(f.app, "executed"))).toBe(false);
});

it("records actual stdout/exit for each passed criterion and never imports a saved success", () => {
  const f = fixture();
  f.bind();
  const passed = f.check(true);
  expect(passed.ok).toBe(true);
  expect(passed.acceptanceResults!.every((c) => c.status === "passed" && c.exitCode === 0 && c.stdout?.includes("assertion executed"))).toBe(true);
  writeFileSync(join(f.app, "criterion.mjs"), "console.error('assertion failed'); process.exit(1);");
  const failed = f.check(true);
  expect(failed.ok).toBe(false);
  expect(failed.acceptanceResults!.every((c) => c.status === "failed" && c.exitCode === 1)).toBe(true);
});

it("rejects a changed full requirement before executing old criterion commands", () => {
  const f = fixture();
  f.srd.functional[0]!.description += " context".repeat(80);
  f.save();
  f.bind();
  f.srd.functional[0]!.description += " changed suffix";
  f.save();
  const result = f.check(true);
  expect(result.ok).toBe(false);
  expect(result.acceptanceResults!.every((c) => c.status === "not-tested" && /stale/i.test(c.reason ?? ""))).toBe(true);
});

it("fails closed on missing mappings, duplicates and a timeout", () => {
  const f = fixture();
  f.bind();
  f.plan.tasks[0]!.verify.criteria.pop();
  f.save();
  expect(f.check(true).ok).toBe(false);
  f.bind();
  f.plan.tasks[0]!.verify.criteria.push(f.plan.tasks[0]!.verify.criteria[0]!);
  f.save();
  expect(f.check(true).ok).toBe(false);
  f.bind();
  writeFileSync(join(f.app, "criterion.mjs"), "setInterval(() => {}, 1000);");
  f.plan.tasks[0]!.verify.criteria.forEach((c) => {
    c.timeoutMs = 100;
  });
  f.save();
  const result = f.check(true);
  expect(result.ok).toBe(false);
  expect(result.acceptanceResults!.every((c) => c.status === "failed")).toBe(true);
});

it("refuses vacuous, unfinished and unknown criteria mappings", () => {
  const f = fixture();
  f.bind();
  f.plan.tasks[0]!.status = "todo";
  f.save();
  expect(f.check(true).acceptanceResults!.every((c) => c.status === "not-tested")).toBe(true);
  f.plan.tasks[0]!.status = "done";
  f.plan.tasks[0]!.verify.criteria.push({ frId: "FR-999", index: 0, fingerprint: "fake", command: "true" });
  f.save();
  expect(f.check(true).ok).toBe(false);
  f.srd.functional = [];
  f.save();
  expect(f.check(true).ok).toBe(false);
});

it("does not turn output overflow or a missing executable into passing evidence", () => {
  const f = fixture();
  f.bind();
  writeFileSync(join(f.app, "criterion.mjs"), "console.log('x'.repeat(100000));");
  const overflow = f.check(true);
  expect(overflow.ok).toBe(false);
  expect(overflow.acceptanceResults!.every((c) => c.status === "failed" && c.stdout!.length <= 65536)).toBe(true);
  f.plan.tasks[0]!.verify.criteria.forEach((c) => {
    c.command = "no-such-acceptance-audit-command";
  });
  f.save();
  expect(f.check(true).acceptanceResults!.every((c) => c.status === "failed")).toBe(true);
});

it.skipIf(process.platform === "win32")("rejects a timeout even when the shell catches SIGTERM and exits zero", () => {
  const f = fixture();
  f.bind();
  f.plan.tasks[0]!.verify.criteria.forEach((c) => {
    c.command = "trap 'exit 0' TERM; while :; do :; done";
    c.timeoutMs = 100;
  });
  f.save();
  const result = f.check(true);
  expect(result.ok).toBe(false);
  expect(result.acceptanceResults!.every((c) => c.status === "failed")).toBe(true);
});

it.skipIf(process.platform === "win32")("terminates the owned shell group after a timeout, including an ordinary child", async () => {
  const f = fixture();
  f.bind();
  writeFileSync(join(f.app, "child.mjs"), "import fs from 'node:fs';setTimeout(()=>fs.writeFileSync('escaped','yes'),700);");
  f.plan.tasks[0]!.verify.criteria.forEach((c) => {
    c.command = "node child.mjs & wait";
    c.timeoutMs = 100;
  });
  f.save();
  expect(f.check(true).ok).toBe(false);
  await new Promise((resolve) => setTimeout(resolve, 800));
  expect(existsSync(join(f.app, "escaped"))).toBe(false);
});
