import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BRAINSTORM_SCHEMA_VERSION } from "./types.js";
import { renderBrainstormMd } from "./templates.js";
import type { Brainstorm, BrainstormAngle, BrainstormIdea, BrainstormStatus, BrainstormTarget, Brief } from "./types.js";

// The brainstorm is the optional DIVERGENT companion to the brief: candidate
// ideas the user keeps/parks/rejects, then `--merge` folds the kept ones into
// the brief. The engine owns persistence + the deterministic merge; the agent
// runs the session (references/brainstorm-playbook.md).

const ANGLES: BrainstormAngle[] = ["reframe", "segment", "feature", "differentiator", "anti-goal", "wildcard"];
const STATUSES: BrainstormStatus[] = ["proposed", "kept", "parked", "rejected"];
const TARGETS: BrainstormTarget[] = ["featureWishlist", "competitors", "nonGoals", "goals", "candidateTech", "openQuestions"];
// String-array brief fields a kept idea can append its title to.
const STRING_TARGETS: Exclude<BrainstormTarget, "featureWishlist">[] = ["competitors", "nonGoals", "goals", "candidateTech", "openQuestions"];

export function brainstormPath(runDir: string): string {
  return join(runDir, "brainstorm.json");
}

export function initBrainstorm(idea: string, now: string): Brainstorm {
  return { schemaVersion: BRAINSTORM_SCHEMA_VERSION, idea: idea.trim(), createdAt: now, ideas: [] };
}

export function saveBrainstorm(runDir: string, b: Brainstorm): string {
  mkdirSync(runDir, { recursive: true });
  const path = brainstormPath(runDir);
  writeFileSync(path, JSON.stringify(b, null, 2));
  return path;
}

// Regenerate the human-facing board from brainstorm.json (the source of truth).
export function writeBrainstormMd(runDir: string, b: Brainstorm): string {
  mkdirSync(runDir, { recursive: true });
  const path = join(runDir, "BRAINSTORM.md");
  const md = renderBrainstormMd(b);
  writeFileSync(path, md.endsWith("\n") ? md : md + "\n");
  return path;
}

export function brainstormCounts(b: Brainstorm): Record<BrainstormStatus, number> {
  const counts: Record<BrainstormStatus, number> = { proposed: 0, kept: 0, parked: 0, rejected: 0 };
  for (const i of b.ideas) if (counts[i.status] !== undefined) counts[i.status]++;
  return counts;
}

const line = (v: unknown): string | undefined => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : undefined);

// Load + normalize a brainstorm.json defensively (mirrors normalizeBrief):
// invalid enums are coerced with a warning, title-less ideas are dropped,
// missing ids are assigned the next free B-### — a hand-edited file never
// crashes the merge.
export function loadBrainstorm(runDir: string, warn: (msg: string) => void = () => {}): Brainstorm | undefined {
  const path = brainstormPath(runDir);
  if (!existsSync(path)) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`brainstorm.json is unreadable: ${(e as Error).message}`);
  }
  const d = (data ?? {}) as Partial<Brainstorm>;
  const used = new Set<string>();
  let seq = 0;
  const nextId = (): string => {
    do {
      seq++;
    } while (used.has(`B-${String(seq).padStart(3, "0")}`));
    const id = `B-${String(seq).padStart(3, "0")}`;
    used.add(id);
    return id;
  };
  // First pass: reserve every already-valid id so a later auto-id can't collide.
  const rawIdeas = Array.isArray(d.ideas) ? d.ideas : [];
  if (!Array.isArray(d.ideas) && d.ideas !== undefined) warn("brainstorm.ideas is not an array — ignored.");
  for (const raw of rawIdeas) {
    const id = line((raw as { id?: unknown })?.id);
    if (id && /^B-\d{3,}$/.test(id)) used.add(id);
  }

  const ideas: BrainstormIdea[] = [];
  rawIdeas.forEach((raw, i) => {
    const r = (raw ?? {}) as unknown as Record<string, unknown>;
    const title = line(r.title);
    if (!title) {
      warn(`brainstorm.ideas[${i}] has no usable title — dropped.`);
      return;
    }
    let id = line(r.id);
    if (!id || !/^B-\d{3,}$/.test(id)) id = nextId();
    let angle = r.angle as BrainstormAngle;
    if (!ANGLES.includes(angle)) {
      if (r.angle !== undefined) warn(`brainstorm ${id}: angle "${String(r.angle)}" is not recognized — treated as wildcard.`);
      angle = "wildcard";
    }
    let status = r.status as BrainstormStatus;
    if (!STATUSES.includes(status)) {
      if (r.status !== undefined) warn(`brainstorm ${id}: status "${String(r.status)}" is not recognized — treated as proposed.`);
      status = "proposed";
    }
    let target = r.target as BrainstormTarget | undefined;
    if (target !== undefined && !TARGETS.includes(target)) {
      warn(`brainstorm ${id}: target "${String(r.target)}" is not recognized — removed.`);
      target = undefined;
    }
    const idea: BrainstormIdea = { id, angle, title, status };
    const notes = line(r.notes);
    if (notes) idea.notes = notes;
    if (target) idea.target = target;
    const priority = r.priority;
    if (priority === "must" || priority === "should" || priority === "could") idea.priority = priority;
    const mergedAt = line(r.mergedAt);
    if (mergedAt) idea.mergedAt = mergedAt;
    ideas.push(idea);
  });

  return {
    schemaVersion: typeof d.schemaVersion === "number" ? d.schemaVersion : BRAINSTORM_SCHEMA_VERSION,
    idea: line(d.idea) ?? "",
    createdAt: line(d.createdAt) ?? "",
    ...(line(d.updatedAt) ? { updatedAt: line(d.updatedAt) } : {}),
    ideas,
  };
}

export interface MergeResult {
  brief: Brief;
  brainstorm: Brainstorm;
  merged: number; // kept ideas folded into a brief field
  parkedFolded: number; // parked ideas folded into openQuestions
  skipped: number; // kept ideas that could not merge (no target / conflict)
  proposed: number; // ideas still awaiting adjudication
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// Deterministically fold a brainstorm's kept/parked ideas into a brief. Pure,
// idempotent (an idea with `mergedAt` is skipped forever), tolerant-with-warnings.
// Returns fresh brief + brainstorm objects; the caller persists them.
export function mergeBrainstorm(briefIn: Brief, brainstormIn: Brainstorm, now: string, warn: (msg: string) => void = () => {}): MergeResult {
  // Clone so the function stays pure (no mutation of the caller's objects).
  const brief: Brief = JSON.parse(JSON.stringify(briefIn));
  const brainstorm: Brainstorm = JSON.parse(JSON.stringify(brainstormIn));
  let merged = 0;
  let parkedFolded = 0;
  let skipped = 0;

  const appendUnique = (list: string[], value: string): boolean => {
    if (list.some((x) => norm(x) === norm(value))) return false;
    list.push(value);
    return true;
  };

  for (const idea of brainstorm.ideas) {
    if (idea.mergedAt) continue; // already folded — idempotence marker

    if (idea.status === "parked") {
      appendUnique(brief.openQuestions, `Parked idea ${idea.id}: ${idea.title}`);
      idea.mergedAt = now; // stamp regardless — the content is now present (or already was)
      parkedFolded++;
      continue;
    }

    if (idea.status !== "kept") continue; // proposed/rejected untouched

    if (!idea.target) {
      warn(`brainstorm ${idea.id} "${idea.title}" is kept but has no target — set one (featureWishlist, competitors, …) and re-merge.`);
      skipped++;
      continue; // NOT stamped → a later merge retries once a target is set
    }

    if (idea.target === "featureWishlist") {
      const exists = brief.featureWishlist.some((f) => norm(f.title) === norm(idea.title));
      if (exists) {
        warn(`brainstorm ${idea.id} "${idea.title}" is already in the wishlist — skipped.`);
      } else {
        brief.featureWishlist.push({ title: idea.title, priority: idea.priority ?? "could", ...(idea.notes ? { notes: idea.notes } : {}) });
      }
      idea.mergedAt = now;
      merged++;
      continue;
    }

    // String-array targets. A goals↔nonGoals conflict blocks the merge WITHOUT
    // stamping, so the user can resolve it and re-merge.
    if (idea.target === "goals" && brief.nonGoals.some((g) => norm(g) === norm(idea.title))) {
      warn(`brainstorm ${idea.id} "${idea.title}" conflicts with an existing nonGoal — NOT merged; resolve it in brief.json first.`);
      skipped++;
      continue;
    }
    if (idea.target === "nonGoals" && brief.goals.some((g) => norm(g) === norm(idea.title))) {
      warn(`brainstorm ${idea.id} "${idea.title}" conflicts with an existing goal — NOT merged; resolve it in brief.json first.`);
      skipped++;
      continue;
    }

    const value = idea.target === "openQuestions" && idea.notes ? `${idea.title} — ${idea.notes}` : idea.title;
    const list = brief[idea.target as (typeof STRING_TARGETS)[number]] as string[];
    if (!appendUnique(list, value)) warn(`brainstorm ${idea.id} "${idea.title}" is already in ${idea.target} — skipped.`);
    idea.mergedAt = now;
    merged++;
  }

  brainstorm.updatedAt = now;
  const proposed = brainstorm.ideas.filter((i) => i.status === "proposed").length;
  return { brief, brainstorm, merged, parkedFolded, skipped, proposed };
}
