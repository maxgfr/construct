import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BRIEF_SCHEMA_VERSION } from "./types.js";
import type { Brief } from "./types.js";

// The brief is the captured product idea — the bridge between the AI-driven
// interview (SKILL.md playbook) and the deterministic renderer. The engine only
// owns the schema, persistence and validation; the agent fills the fields.

export function briefPath(runDir: string): string {
  return join(runDir, "brief.json");
}

// A fresh, mostly-empty brief seeded with the one-liner. The agent fleshes it
// out during the interview before calling `render`.
export function initBrief(idea: string, now: string): Brief {
  return {
    schemaVersion: BRIEF_SCHEMA_VERSION,
    idea: idea.trim(),
    product: {},
    goals: [],
    nonGoals: [],
    constraints: {},
    candidateTech: [],
    competitors: [],
    ossSeeds: [],
    featureWishlist: [],
    nfrPriorities: [],
    openQuestions: [],
    createdAt: now,
  };
}

export function saveBrief(runDir: string, brief: Brief): string {
  mkdirSync(runDir, { recursive: true });
  const path = briefPath(runDir);
  writeFileSync(path, JSON.stringify(brief, null, 2));
  return path;
}

export function loadBrief(runDir: string): Brief {
  const path = briefPath(runDir);
  if (!existsSync(path)) {
    throw new Error(`No brief.json in ${runDir} — run \`construct init --idea "..." --out ${runDir}\` first.`);
  }
  const raw = readFileSync(path, "utf8");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`brief.json is unreadable: ${(e as Error).message}`);
  }
  return normalizeBrief(data);
}

// Coerce a parsed object into a Brief, tolerating missing arrays/objects so a
// hand-edited brief never crashes the renderer.
export function normalizeBrief(data: unknown): Brief {
  const d = (data ?? {}) as Partial<Brief>;
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    schemaVersion: typeof d.schemaVersion === "number" ? d.schemaVersion : BRIEF_SCHEMA_VERSION,
    idea: typeof d.idea === "string" ? d.idea : "",
    product: {
      name: d.product?.name,
      problem: d.product?.problem,
      users: arr(d.product?.users),
      valueProp: d.product?.valueProp,
    },
    goals: arr(d.goals),
    nonGoals: arr(d.nonGoals),
    constraints: {
      budget: d.constraints?.budget,
      timeline: d.constraints?.timeline,
      team: d.constraints?.team,
      compliance: arr(d.constraints?.compliance),
    },
    candidateTech: arr(d.candidateTech),
    competitors: arr(d.competitors),
    ossSeeds: arr(d.ossSeeds),
    featureWishlist: Array.isArray(d.featureWishlist)
      ? d.featureWishlist
          .filter((f): f is { title: string } => !!f && typeof (f as { title?: unknown }).title === "string")
          .map((f) => ({
            title: f.title,
            priority: (f as { priority?: Brief["featureWishlist"][number]["priority"] }).priority,
            notes: (f as { notes?: string }).notes,
          }))
      : [],
    nfrPriorities: arr(d.nfrPriorities),
    openQuestions: arr(d.openQuestions),
    createdAt: typeof d.createdAt === "string" ? d.createdAt : "",
  };
}

export interface BriefValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

// A brief must carry enough signal to render a meaningful SRD. Errors block
// rendering; warnings are advice the playbook should act on (or the user can
// override by proceeding).
export function validateBrief(brief: Brief): BriefValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!brief.idea.trim()) errors.push("brief.idea is empty — describe the product in one line.");
  if (!brief.product.problem && brief.goals.length === 0) {
    errors.push("brief has no product.problem and no goals — the interview did not capture intent.");
  }
  if (brief.featureWishlist.length === 0) {
    warnings.push("no featureWishlist entries — the SRD will have no functional requirements to ground.");
  }
  if (brief.candidateTech.length === 0) {
    warnings.push("no candidateTech — the `tech` research angle has nothing to ground against.");
  }
  if (brief.competitors.length === 0 && brief.ossSeeds.length === 0) {
    warnings.push("no competitors or ossSeeds — the market/oss angles must discover them from the idea.");
  }
  if (brief.nfrPriorities.length === 0) {
    warnings.push("no nfrPriorities — non-functional requirements will use defaults for the level.");
  }
  return { ok: errors.length === 0, errors, warnings };
}
