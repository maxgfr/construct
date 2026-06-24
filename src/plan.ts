import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUILD_PLAN_SCHEMA_VERSION } from "./types.js";
import type { BuildPlanDoc, BuildTask, SRD, TaskStatus } from "./types.js";

// BUILD-PLAN.json — the machine-readable bridge from the SRD to a built app.
// derivePlan is pure (SRD → task DAG); mergePlan preserves the agent's progress
// across re-renders so amending the SRD never loses build state.

export function buildPlanPath(runDir: string): string {
  return join(runDir, "BUILD-PLAN.json");
}

// "M1 — Walking skeleton (must-haves)" → "M1".
function milestoneLabel(title: string): string {
  return title.split("—")[0]!.trim() || title.trim();
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

// Derive the task DAG from the SRD. Deterministic:
//   - T-000 is always the project skeleton (repo, test harness, CI).
//   - one task per FR, in build-plan milestone order (must → should → could);
//   - every task depends on T-000;
//   - a task additionally depends on the earliest prior task from an EARLIER
//     milestone that shares a data entity (same-milestone tasks stay parallel).
export function derivePlan(srd: SRD): BuildPlanDoc {
  const frById = new Map(srd.functional.map((f) => [f.id, f]));

  // FR order: milestone groups in build-plan order, then any FR the plan
  // missed (defensive — buildMilestones covers all FRs today).
  const ordered: { frId: string; milestone: string }[] = [];
  const seen = new Set<string>();
  for (const m of srd.buildPlan) {
    for (const frId of m.frIds) {
      if (frById.has(frId) && !seen.has(frId)) {
        ordered.push({ frId, milestone: milestoneLabel(m.title) });
        seen.add(frId);
      }
    }
  }
  for (const f of srd.functional) {
    if (!seen.has(f.id)) ordered.push({ frId: f.id, milestone: "M1" });
  }

  const tasks: BuildTask[] = [
    {
      id: "T-000",
      title: "Project skeleton — repo layout, test harness, CI",
      milestone: ordered[0]?.milestone ?? "M1",
      frIds: [],
      acceptance: [],
      dependsOn: [],
      artifacts: [],
      tests: [],
      verify: { commands: [] },
      status: "todo",
    },
  ];

  ordered.forEach(({ frId, milestone }, i) => {
    const fr = frById.get(frId)!;
    const dependsOn = ["T-000"];
    // Entity edge: build on the earliest earlier-milestone task that touches a
    // shared entity (its data model must exist before this task extends it).
    if (fr.entities.length) {
      for (let j = 0; j < i; j++) {
        const prev = ordered[j]!;
        if (prev.milestone === milestone) continue;
        const prevFr = frById.get(prev.frId)!;
        if (prevFr.entities.some((e) => fr.entities.includes(e))) {
          dependsOn.push(`T-${pad3(j + 1)}`);
          break;
        }
      }
    }
    tasks.push({
      id: `T-${pad3(i + 1)}`,
      title: `${fr.id} — ${fr.title}`,
      milestone,
      frIds: [fr.id],
      acceptance: fr.acceptance.map((_, idx) => ({ frId: fr.id, index: idx })),
      dependsOn,
      artifacts: [],
      tests: [],
      verify: { commands: [] },
      status: "todo",
    });
  });

  // A design system adds one foundation task (design tokens, base components, the
  // accessibility baseline). Appended AFTER the FR tasks so FR-task ids and the
  // entity-edge index math are untouched; it depends only on the skeleton, so it
  // builds in parallel with the M1 features. Absent design → byte-identical plan.
  if (srd.design) {
    tasks.push({
      id: `T-${pad3(ordered.length + 1)}`,
      title: "Design foundation — design tokens, base components, accessibility baseline",
      milestone: ordered[0]?.milestone ?? "M1",
      frIds: [],
      acceptance: [],
      dependsOn: ["T-000"],
      artifacts: [],
      tests: [],
      verify: { commands: [] },
      status: "todo",
    });
  }

  return {
    schemaVersion: BUILD_PLAN_SCHEMA_VERSION,
    product: srd.product.name,
    generatedAt: srd.generatedAt,
    conventions: { frTagPattern: "FR-\\d{3}", testCommand: null, appDir: null },
    tasks,
  };
}

const STATUSES: TaskStatus[] = ["todo", "in-progress", "done"];

// The stable identity of a task across re-renders. FR ids are POSITIONAL
// (FR-002 can become FR-003 when a feature is added above it), so an FR task
// is keyed by the feature title embedded in its own title ("FR-002 — <title>")
// — the title survives reordering. Rewording a feature title resets that
// task's progress to todo, which is the honest reading of a changed feature.
// T-000 and any FR-less task fall back to their id.
function taskKey(t: BuildTask): string {
  return t.frIds.length
    ? `fr:${t.title
        .replace(/^FR-\d+\s*—\s*/, "")
        .trim()
        .toLowerCase()}`
    : `id:${t.id}`;
}

// Preserve the agent-owned fields of `prev` onto the freshly derived `next`.
// Engine-derived fields (title, milestone, acceptance, dependsOn) always come
// from `next` — re-render wins on structure, the agent wins on progress.
export function mergePlan(prev: BuildPlanDoc | null, next: BuildPlanDoc): BuildPlanDoc {
  if (!prev) return next;
  const prevByKey = new Map(prev.tasks.map((t) => [taskKey(t), t]));
  const tasks = next.tasks.map((t) => {
    const old = prevByKey.get(taskKey(t));
    if (!old) return t;
    return {
      ...t,
      artifacts: Array.isArray(old.artifacts) ? old.artifacts : t.artifacts,
      tests: Array.isArray(old.tests) ? old.tests : t.tests,
      verify: old.verify && Array.isArray(old.verify.commands) ? old.verify : t.verify,
      status: STATUSES.includes(old.status) ? old.status : t.status,
    };
  });
  return {
    ...next,
    conventions: {
      frTagPattern: next.conventions.frTagPattern,
      testCommand: prev.conventions?.testCommand ?? null,
      appDir: prev.conventions?.appDir ?? null,
    },
    tasks,
  };
}

export interface ReadyFrontier {
  product: string;
  done: number;
  total: number;
  tasks: { id: string; milestone: string; status: TaskStatus; dependsOn: string[]; ready: boolean }[];
  frontier: string[]; // ids buildable right now (not done, every dep done)
  blocked: { id: string; waitingOn: string[] }[]; // not-done tasks with unmet deps
}

// Which tasks are buildable RIGHT NOW? A task is ready when it is not done and
// every `dependsOn` is done. Within a milestone, derivePlan adds no edges
// between tasks, so a milestone's ready set is independent — safe to fan out in
// parallel (see references/build-playbook.md "Parallel build within a
// milestone"). Pure and deterministic — no I/O, no clock — so the bundle stays
// reproducible. The engine answers "what is graph-ready"; the agent decides
// which of those are file-safe to run together.
export function readyFrontier(plan: BuildPlanDoc): ReadyFrontier {
  const done = new Set(plan.tasks.filter((t) => t.status === "done").map((t) => t.id));
  const tasks = plan.tasks.map((t) => ({
    id: t.id,
    milestone: t.milestone,
    status: t.status,
    dependsOn: t.dependsOn,
    ready: t.status !== "done" && t.dependsOn.every((d) => done.has(d)),
  }));
  return {
    product: plan.product,
    done: done.size,
    total: plan.tasks.length,
    tasks,
    frontier: tasks.filter((t) => t.ready).map((t) => t.id),
    blocked: tasks.filter((t) => t.status !== "done" && !t.ready).map((t) => ({ id: t.id, waitingOn: t.dependsOn.filter((d) => !done.has(d)) })),
  };
}

export function loadPlan(runDir: string): BuildPlanDoc | null {
  const path = buildPlanPath(runDir);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as BuildPlanDoc;
    return data && typeof data === "object" && Array.isArray(data.tasks) ? data : null;
  } catch {
    return null;
  }
}

export function writePlan(runDir: string, plan: BuildPlanDoc): string {
  const path = buildPlanPath(runDir);
  writeFileSync(path, JSON.stringify(plan, null, 2) + "\n");
  return path;
}
