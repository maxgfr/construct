import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BRIEF_SCHEMA_VERSION } from "./types.js";
import type { Brief, ModuleDef } from "./types.js";

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

export function loadBrief(runDir: string, warn: (msg: string) => void = () => {}): Brief {
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
  return normalizeBrief(data, warn);
}

const PRIORITIES = ["must", "should", "could"] as const;

// Module ids are slugs so they can name a prd/<id>/ directory and (later) a
// src/modules/<id>/ folder verbatim.
function slugId(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Coerce a parsed object into a Brief, tolerating missing arrays/objects so a
// hand-edited brief never crashes the renderer. Tolerance must not mean silent
// loss: anything dropped or rewritten is reported through `warn`.
export function normalizeBrief(data: unknown, warn: (msg: string) => void = () => {}): Brief {
  const d = (data ?? {}) as Partial<Brief>;
  // Collapse internal whitespace/newlines on free text so a multi-line value
  // can't inject Markdown structure (fake headings/list items) at render time.
  const line = (v: unknown): string | undefined => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : undefined);
  const arr = (v: unknown, field: string): string[] => {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) {
      warn(`${field} is not an array — ignored.`);
      return [];
    }
    const kept = v
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (kept.length < v.length) warn(`${field}: dropped ${v.length - kept.length} non-string/empty entr${v.length - kept.length === 1 ? "y" : "ies"}.`);
    return kept;
  };
  // Modules first: feature `module` refs are validated against the declared ids.
  let modules: ModuleDef[] | undefined;
  if (d.modules !== undefined && d.modules !== null) {
    if (!Array.isArray(d.modules)) {
      warn("modules is not an array — ignored.");
    } else {
      const out: ModuleDef[] = [];
      const seen = new Set<string>();
      d.modules.forEach((m, i) => {
        const rawId = line((m as { id?: unknown } | null)?.id);
        const rawName = line((m as { name?: unknown } | null)?.name);
        const id = slugId(rawId || rawName || "");
        if (!id) {
          warn(`modules[${i}] has no usable id or name — dropped.`);
          return;
        }
        if (seen.has(id)) {
          warn(`modules[${i}]: duplicate module id "${id}" — dropped.`);
          return;
        }
        seen.add(id);
        const def: ModuleDef = { id, name: rawName || id };
        const description = line((m as { description?: unknown }).description);
        if (description) def.description = description;
        const deps = arr((m as { dependsOn?: unknown }).dependsOn, `modules[${i}].dependsOn`).map(slugId);
        if (deps.length) def.dependsOn = deps;
        out.push(def);
      });
      // dependsOn closure: refs must name another declared module.
      for (const m of out) {
        if (!m.dependsOn) continue;
        const kept = m.dependsOn.filter((dep) => {
          if (dep === m.id) {
            warn(`module "${m.id}": dependsOn cannot reference itself — dropped.`);
            return false;
          }
          if (!seen.has(dep)) {
            warn(`module "${m.id}": dependsOn "${dep}" names no declared module — dropped.`);
            return false;
          }
          return true;
        });
        if (kept.length) m.dependsOn = kept;
        else delete m.dependsOn;
      }
      if (out.length) modules = out;
    }
  }
  const moduleIds = new Set((modules ?? []).map((m) => m.id));

  const features: Brief["featureWishlist"] = [];
  if (d.featureWishlist !== undefined && !Array.isArray(d.featureWishlist)) {
    warn("featureWishlist is not an array — ignored.");
  } else if (Array.isArray(d.featureWishlist)) {
    d.featureWishlist.forEach((f, i) => {
      const title = line((f as { title?: unknown } | null)?.title);
      if (!title) {
        warn(`featureWishlist[${i}] has no usable title — dropped.`);
        return;
      }
      let priority = (f as { priority?: Brief["featureWishlist"][number]["priority"] }).priority;
      if (priority !== undefined && !(PRIORITIES as readonly string[]).includes(priority)) {
        warn(`featureWishlist[${i}].priority "${priority}" is not must|should|could — treated as should.`);
        priority = undefined;
      }
      let module: string | undefined;
      const rawModule = line((f as { module?: unknown }).module);
      if (rawModule) {
        const slug = slugId(rawModule);
        if (moduleIds.has(slug)) module = slug;
        else warn(`featureWishlist[${i}].module "${rawModule}" names no declared module — dropped.`);
      }
      features.push({ title, priority, notes: line((f as { notes?: string }).notes), ...(module ? { module } : {}) });
    });
  }
  // Optional design intent — tolerated like everything else: a non-object is
  // dropped with a warning; only non-empty fields are kept.
  let design: Brief["design"];
  if (d.design !== undefined && d.design !== null) {
    if (typeof d.design !== "object" || Array.isArray(d.design)) {
      warn("design is not an object — ignored.");
    } else {
      const dd = d.design as Record<string, unknown>;
      const out: NonNullable<Brief["design"]> = {};
      const platforms = arr(dd.platforms, "design.platforms");
      const referenceSystems = arr(dd.referenceSystems, "design.referenceSystems");
      const brand = line(dd.brandConstraints);
      const a11y = line(dd.accessibilityTarget);
      const tone = line(dd.tone);
      if (platforms.length) out.platforms = platforms;
      if (referenceSystems.length) out.referenceSystems = referenceSystems;
      if (brand) out.brandConstraints = brand;
      if (a11y) out.accessibilityTarget = a11y;
      if (tone) out.tone = tone;
      if (Object.keys(out).length) design = out;
    }
  }
  return {
    schemaVersion: typeof d.schemaVersion === "number" ? d.schemaVersion : BRIEF_SCHEMA_VERSION,
    idea: line(d.idea) ?? "",
    product: {
      name: line(d.product?.name),
      problem: line(d.product?.problem),
      users: arr(d.product?.users, "product.users"),
      valueProp: line(d.product?.valueProp),
    },
    goals: arr(d.goals, "goals"),
    nonGoals: arr(d.nonGoals, "nonGoals"),
    constraints: {
      budget: line(d.constraints?.budget),
      timeline: line(d.constraints?.timeline),
      team: line(d.constraints?.team),
      compliance: arr(d.constraints?.compliance, "constraints.compliance"),
    },
    candidateTech: arr(d.candidateTech, "candidateTech"),
    competitors: arr(d.competitors, "competitors"),
    ossSeeds: arr(d.ossSeeds, "ossSeeds"),
    ...(modules ? { modules } : {}),
    featureWishlist: features,
    nfrPriorities: arr(d.nfrPriorities, "nfrPriorities"),
    openQuestions: arr(d.openQuestions, "openQuestions"),
    ...(design ? { design } : {}),
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
  if (brief.modules?.length) {
    const unassigned = brief.featureWishlist.filter((f) => !f.module).length;
    if (unassigned) {
      warnings.push(`modules are declared but ${unassigned} feature(s) have no module — assign every feature (check fails an FR without one).`);
    }
    for (const m of brief.modules) {
      if (!brief.featureWishlist.some((f) => f.module === m.id)) {
        warnings.push(`module "${m.id}" has no features — its PRD will be empty (assign features or drop the module).`);
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}
