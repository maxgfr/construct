#!/usr/bin/env node

// src/cli.ts
import { resolve as resolve5, join as join19 } from "path";
import { existsSync as existsSync13, readFileSync as readFileSync11 } from "fs";
import { pathToFileURL, fileURLToPath as fileURLToPath3 } from "url";
import { realpathSync as realpathSync2 } from "fs";

// src/types.ts
var VERSION = "2.1.0";
var ALL_SOURCE_KINDS = ["market", "oss", "docs", "so", "issue", "pr"];
var BRIEF_SCHEMA_VERSION = 1;
var BRAINSTORM_SCHEMA_VERSION = 1;
var SRD_SCHEMA_VERSION = 1;
var REQUIRED_NFR = {
  light: ["performance", "security", "reliability"],
  complex: ["performance", "security", "reliability", "usability", "observability", "cost"]
};
var DESIGN_TOKEN_CATEGORIES = ["color", "typography", "spacing", "radius", "elevation", "motion"];
var COMPONENT_STATES = ["default", "hover", "focus", "active", "disabled", "loading", "empty", "error"];
var DESIGN_TOKENS_SEEDED_BANNER = "Seeded defaults \u2014 replace these with the product's real brand tokens during authoring.";
var BUILD_PLAN_SCHEMA_VERSION = 1;

// src/util.ts
import { spawnSync } from "child_process";

// src/config.ts
var HTTP_GET_TIMEOUT_MS = 2e4;
var HTTP_JSON_TIMEOUT_MS = 3e4;
var SEARXNG_TIMEOUT_MS = 8e3;
var DDG_TIMEOUT_MS = 12e3;
var RETRY_BASE_DELAY_MS = 300;
var RETRY_JITTER_MS = 150;
var RETRY_AFTER_CAP_MS = 1e4;
var SH_DEFAULT_TIMEOUT_MS = 12e4;
var GIT_CLONE_TIMEOUT_MS = 3e5;
var GIT_FETCH_TIMEOUT_MS = 18e4;
var GIT_RESET_TIMEOUT_MS = 6e4;
var VERIFY_COMMAND_TIMEOUT_MS = 6e5;
var REACHABLE_TIMEOUT_MS = 2500;
var EMBED_TIMEOUT_MS = 6e4;
var COMPOSE_DOWN_TIMEOUT_MS = 12e4;
var COMPOSE_PS_TIMEOUT_MS = 3e4;
var COMPOSE_UP_TIMEOUT_MS = 3e5;
var OLLAMA_PULL_TIMEOUT_MS = 6e5;

// src/util.ts
function sh(cmd, args2, opts = {}) {
  const res = spawnSync(cmd, args2, {
    cwd: opts.cwd,
    input: opts.input,
    encoding: "utf8",
    timeout: opts.timeoutMs ?? SH_DEFAULT_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
    env: opts.env ?? process.env
  });
  const missing = !!res.error && res.error.code === "ENOENT";
  return {
    ok: !res.error && res.status === 0,
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? (res.error ? String(res.error.message) : ""),
    missing
  };
}
var whichCache = /* @__PURE__ */ new Map();
function have(cmd) {
  const cached = whichCache.get(cmd);
  if (cached !== void 0) return cached;
  const probe = sh(process.platform === "win32" ? "where" : "which", [cmd]);
  const found = probe.ok && probe.stdout.trim().length > 0;
  whichCache.set(cmd, found);
  return found;
}
function slugify(input) {
  return input.toLowerCase().replace(/^https?:\/\//, "").replace(/^git@/, "").replace(/\.git$/, "").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}
var STOPWORDS = /* @__PURE__ */ new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "do",
  "does",
  "did",
  "how",
  "what",
  "why",
  "when",
  "where",
  "which",
  "who",
  "whom",
  "this",
  "that",
  "these",
  "those",
  "of",
  "in",
  "on",
  "to",
  "for",
  "with",
  "and",
  "or",
  "but",
  "if",
  "then",
  "else",
  "than",
  "as",
  "at",
  "by",
  "from",
  "into",
  "about",
  "it",
  "its",
  "i",
  "you",
  "we",
  "they",
  "he",
  "she",
  "there",
  "here",
  "can",
  "could",
  "should",
  "would",
  "will",
  "shall",
  "may",
  "might",
  "must",
  "have",
  "has",
  "had",
  "not",
  "no",
  "yes",
  "so",
  "such",
  "only",
  "any",
  "some",
  "all",
  "get",
  "set",
  "use",
  "used",
  "using",
  "work",
  "works",
  "working",
  "handle",
  "handled",
  "happen",
  "happens",
  "default",
  "value",
  "values",
  "please",
  "explain",
  "tell",
  "me",
  "my",
  "our"
]);
function keywords(question) {
  const seen = /* @__PURE__ */ new Set();
  const out2 = [];
  for (const raw of question.split(/[^A-Za-z0-9_]+/)) {
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if (raw.length < 2) continue;
    if (STOPWORDS.has(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out2.push(raw);
  }
  return out2;
}
function rankedKeywords(question) {
  const base = keywords(question);
  const score = (raw) => {
    let s = 0;
    if (/\d/.test(raw)) s += 3;
    if (/[A-Z]/.test(raw) && !/^[A-Z0-9]+$/.test(raw)) s += 2;
    if (/_/.test(raw)) s += 2;
    if (raw.length >= 8) s += 1.5;
    else if (raw.length >= 5) s += 0.5;
    return s;
  };
  return base.map((k, i2) => ({ k, s: score(k), i: i2 })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.k);
}

// src/brief.ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
function briefPath(runDir) {
  return join(runDir, "brief.json");
}
function initBrief(idea, now) {
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
    createdAt: now
  };
}
function saveBrief(runDir, brief) {
  mkdirSync(runDir, { recursive: true });
  const path = briefPath(runDir);
  writeFileSync(path, JSON.stringify(brief, null, 2));
  return path;
}
function loadBrief(runDir, warn = () => {
}) {
  const path = briefPath(runDir);
  if (!existsSync(path)) {
    throw new Error(`No brief.json in ${runDir} \u2014 run \`construct init --idea "..." --out ${runDir}\` first.`);
  }
  const raw = readFileSync(path, "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`brief.json is unreadable: ${e.message}`);
  }
  return normalizeBrief(data, warn);
}
var PRIORITIES = ["must", "should", "could"];
function slugId(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}
var KNOWN_CONSTRAINT_KEYS = ["budget", "timeline", "team", "compliance"];
function normalizeConstraints(raw, line2, arr, warn) {
  const c2 = raw ?? {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const k of Object.keys(c2)) {
      if (!KNOWN_CONSTRAINT_KEYS.includes(k)) {
        warn(
          `constraints.${k} is not a recognized constraint (known: ${KNOWN_CONSTRAINT_KEYS.join(", ")}) \u2014 ignored; fold it into the nearest field or openQuestions.`
        );
      }
    }
  }
  return {
    budget: line2(c2.budget),
    timeline: line2(c2.timeline),
    team: line2(c2.team),
    compliance: arr(c2.compliance, "constraints.compliance")
  };
}
function normalizeBrief(data, warn = () => {
}) {
  const d = data ?? {};
  const line2 = (v) => typeof v === "string" ? v.replace(/\s+/g, " ").trim() : void 0;
  const arr = (v, field) => {
    if (v === void 0 || v === null) return [];
    if (!Array.isArray(v)) {
      if (typeof v === "string") {
        const s = v.replace(/\s+/g, " ").trim();
        warn(`${field}: expected an array \u2014 coerced the bare string into a one-element array.`);
        return s ? [s] : [];
      }
      warn(`${field} is not an array \u2014 ignored.`);
      return [];
    }
    const kept = v.filter((x) => typeof x === "string").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (kept.length < v.length) warn(`${field}: dropped ${v.length - kept.length} non-string/empty entr${v.length - kept.length === 1 ? "y" : "ies"}.`);
    return kept;
  };
  let modules;
  if (d.modules !== void 0 && d.modules !== null) {
    if (!Array.isArray(d.modules)) {
      warn("modules is not an array \u2014 ignored.");
    } else {
      const out2 = [];
      const seen = /* @__PURE__ */ new Set();
      d.modules.forEach((m, i2) => {
        const rawId = line2(m?.id);
        const rawName = line2(m?.name);
        const id = slugId(rawId || rawName || "");
        if (!id) {
          warn(`modules[${i2}] has no usable id or name \u2014 dropped.`);
          return;
        }
        if (seen.has(id)) {
          warn(`modules[${i2}]: duplicate module id "${id}" \u2014 dropped.`);
          return;
        }
        seen.add(id);
        const def = { id, name: rawName || id };
        const description = line2(m.description);
        if (description) def.description = description;
        const deps = arr(m.dependsOn, `modules[${i2}].dependsOn`).map(slugId);
        if (deps.length) def.dependsOn = deps;
        out2.push(def);
      });
      for (const m of out2) {
        if (!m.dependsOn) continue;
        const kept = m.dependsOn.filter((dep) => {
          if (dep === m.id) {
            warn(`module "${m.id}": dependsOn cannot reference itself \u2014 dropped.`);
            return false;
          }
          if (!seen.has(dep)) {
            warn(`module "${m.id}": dependsOn "${dep}" names no declared module \u2014 dropped.`);
            return false;
          }
          return true;
        });
        if (kept.length) m.dependsOn = kept;
        else delete m.dependsOn;
      }
      if (out2.length) modules = out2;
    }
  }
  const moduleIds = new Set((modules ?? []).map((m) => m.id));
  const features = [];
  if (d.featureWishlist !== void 0 && !Array.isArray(d.featureWishlist)) {
    warn("featureWishlist is not an array \u2014 ignored.");
  } else if (Array.isArray(d.featureWishlist)) {
    d.featureWishlist.forEach((f, i2) => {
      const title = line2(f?.title);
      if (!title) {
        warn(`featureWishlist[${i2}] has no usable title \u2014 dropped.`);
        return;
      }
      let priority = f.priority;
      if (priority !== void 0 && !PRIORITIES.includes(priority)) {
        warn(`featureWishlist[${i2}].priority "${priority}" is not must|should|could \u2014 treated as should.`);
        priority = void 0;
      }
      let module2;
      const rawModule = line2(f.module);
      if (rawModule) {
        const slug = slugId(rawModule);
        if (moduleIds.has(slug)) module2 = slug;
        else warn(`featureWishlist[${i2}].module "${rawModule}" names no declared module \u2014 dropped.`);
      }
      features.push({ title, priority, notes: line2(f.notes), ...module2 ? { module: module2 } : {} });
    });
  }
  let design;
  if (d.design !== void 0 && d.design !== null) {
    if (typeof d.design !== "object" || Array.isArray(d.design)) {
      warn("design is not an object \u2014 ignored.");
    } else {
      const dd = d.design;
      const out2 = {};
      const platforms = arr(dd.platforms, "design.platforms");
      const referenceSystems = arr(dd.referenceSystems, "design.referenceSystems");
      const brand = line2(dd.brandConstraints);
      const a11y = line2(dd.accessibilityTarget);
      const tone = line2(dd.tone);
      if (platforms.length) out2.platforms = platforms;
      if (referenceSystems.length) out2.referenceSystems = referenceSystems;
      if (brand) out2.brandConstraints = brand;
      if (a11y) out2.accessibilityTarget = a11y;
      if (tone) out2.tone = tone;
      if (Object.keys(out2).length) design = out2;
    }
  }
  return {
    schemaVersion: typeof d.schemaVersion === "number" ? d.schemaVersion : BRIEF_SCHEMA_VERSION,
    idea: line2(d.idea) ?? "",
    product: {
      name: line2(d.product?.name),
      problem: line2(d.product?.problem),
      users: arr(d.product?.users, "product.users"),
      valueProp: line2(d.product?.valueProp)
    },
    goals: arr(d.goals, "goals"),
    nonGoals: arr(d.nonGoals, "nonGoals"),
    constraints: normalizeConstraints(d.constraints, line2, arr, warn),
    candidateTech: arr(d.candidateTech, "candidateTech"),
    competitors: arr(d.competitors, "competitors"),
    ossSeeds: arr(d.ossSeeds, "ossSeeds"),
    ...modules ? { modules } : {},
    featureWishlist: features,
    nfrPriorities: arr(d.nfrPriorities, "nfrPriorities"),
    openQuestions: arr(d.openQuestions, "openQuestions"),
    ...design ? { design } : {},
    createdAt: typeof d.createdAt === "string" ? d.createdAt : ""
  };
}
function validateBrief(brief) {
  const errors = [];
  const warnings = [];
  if (!brief.idea.trim()) errors.push("brief.idea is empty \u2014 describe the product in one line.");
  if (!brief.product.problem && brief.goals.length === 0) {
    errors.push("brief has no product.problem and no goals \u2014 the interview did not capture intent.");
  }
  if (brief.featureWishlist.length === 0) {
    warnings.push("no featureWishlist entries \u2014 the SRD will have no functional requirements to ground.");
  }
  if (brief.candidateTech.length === 0) {
    warnings.push("no candidateTech \u2014 the `tech` research angle has nothing to ground against.");
  }
  if (brief.competitors.length === 0 && brief.ossSeeds.length === 0) {
    warnings.push("no competitors or ossSeeds \u2014 the market/oss angles must discover them from the idea.");
  }
  if (brief.nfrPriorities.length === 0) {
    warnings.push("no nfrPriorities \u2014 non-functional requirements will use defaults for the level.");
  }
  if (brief.modules?.length) {
    const unassigned = brief.featureWishlist.filter((f) => !f.module).length;
    if (unassigned) {
      warnings.push(`modules are declared but ${unassigned} feature(s) have no module \u2014 assign every feature (check fails an FR without one).`);
    }
    for (const m of brief.modules) {
      if (!brief.featureWishlist.some((f) => f.module === m.id)) {
        warnings.push(`module "${m.id}" has no features \u2014 its PRD will be empty (assign features or drop the module).`);
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

// src/brainstorm.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2 } from "fs";
import { join as join2 } from "path";

// src/templates.ts
var BRAINSTORM_ANGLE_ORDER = [
  { angle: "reframe", label: "Problem reframes" },
  { angle: "segment", label: "User segments" },
  { angle: "feature", label: "Feature ideas" },
  { angle: "differentiator", label: "Differentiators" },
  { angle: "anti-goal", label: "Anti-goals & risks" },
  { angle: "wildcard", label: "Wildcards" }
];
function renderBrainstormMd(b) {
  const out2 = [];
  out2.push(`# Brainstorm \u2014 ${b.idea || "(idea)"}`);
  out2.push("");
  out2.push(
    `Divergent ideas for this product. Mark each idea's \`status\` in \`brainstorm.json\` (**proposed** \u2192 **kept** / **parked** / **rejected**); give every **kept** idea a \`target\` (featureWishlist \xB7 competitors \xB7 nonGoals \xB7 goals \xB7 candidateTech \xB7 openQuestions), then run \`construct brainstorm --out <run> --merge\` to fold them into brief.json. **Parked** ideas become \u{1F9E0} open questions that BLOCK the structural gate until resolved.`
  );
  out2.push("");
  for (const { angle, label } of BRAINSTORM_ANGLE_ORDER) {
    const ideas = b.ideas.filter((i2) => i2.angle === angle);
    if (!ideas.length) continue;
    out2.push(`## ${label}`);
    out2.push("");
    for (const i2 of ideas) {
      const tgt = i2.target ? ` \u2192 ${i2.target}${i2.priority ? ` (${i2.priority})` : ""}` : "";
      const notes = i2.notes ? ` \u2014 ${i2.notes}` : "";
      const mergedMark = i2.mergedAt ? " \u2713merged" : "";
      out2.push(`- **[${i2.status}]** ${i2.id} \u2014 ${i2.title}${tgt}${notes}${mergedMark}`);
    }
    out2.push("");
  }
  if (!b.ideas.length) out2.push("_No ideas yet \u2014 generate some with the AI (references/brainstorm-playbook.md)._");
  return out2.join("\n");
}
function cite(ids) {
  if (!ids || ids.length === 0) return "";
  return " " + ids.map((id) => `[${id}]`).join("");
}
function cell(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}
function slugTitle(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "decision";
}
function bullets(items, empty) {
  if (!items.length) return `_${empty}_`;
  return items.map((i2) => `- ${i2}`).join("\n");
}
function renderVision(srd) {
  const p = srd.product;
  return [
    `# Vision`,
    ``,
    `**Product:** ${p.name}`,
    ``,
    `## Problem`,
    p.problem,
    ``,
    `## Target users`,
    bullets(p.users, "No users captured."),
    ``,
    `## Value proposition`,
    p.valueProp,
    ``,
    `## Success metrics`,
    bullets(p.metrics, "Define a measurable launch success metric."),
    ``
  ].join("\n");
}
function renderScope(srd) {
  const lines = [
    `# Scope`,
    ``,
    `## In scope`,
    bullets(srd.scope.inScope, "No in-scope items captured."),
    ``,
    `## Out of scope`,
    bullets(srd.scope.outOfScope, "Nothing explicitly excluded yet."),
    ``,
    `## Assumptions`,
    bullets(srd.scope.assumptions, "No assumptions recorded."),
    ``
  ];
  if (srd.openQuestions.length) {
    lines.push(`## Open decisions`, ``);
    for (const q of srd.openQuestions) lines.push(`> \u{1F9E0} **Decide:** ${q}`, ``);
  }
  return lines.join("\n");
}
function renderFRBlock(fr) {
  const out2 = [`## ${fr.id} \u2014 ${fr.title} _(${fr.priority})_${cite(fr.rationaleEvidence)}`, ``];
  out2.push(fr.description);
  out2.push(``);
  out2.push(`**Acceptance criteria:**`);
  for (const a of fr.acceptance) {
    out2.push(`- **Given** ${a.given} **When** ${a.when} **Then** ${a.then}`);
  }
  out2.push(``);
  const trace = [
    `NFRs: ${fr.nfrs.length ? fr.nfrs.join(", ") : "\u2014"}`,
    `entities: ${fr.entities.length ? fr.entities.join(", ") : "\u2014"}`,
    `interfaces: ${fr.interfaces.length ? fr.interfaces.join(", ") : "\u2014"}`
  ].join(" \xB7 ");
  out2.push(`_Traceability \u2014 ${trace}_`);
  out2.push(``);
  return out2;
}
function renderFunctional(srd) {
  if (srd.modules?.length) return renderFunctionalIndex(srd);
  return renderFunctionalFull(srd);
}
function renderFunctionalFull(srd) {
  const out2 = [`# Functional requirements`, ``];
  if (!srd.functional.length) out2.push(`_No functional requirements defined._`, ``);
  for (const fr of srd.functional) out2.push(...renderFRBlock(fr));
  return out2.join("\n");
}
function renderFunctionalIndex(srd) {
  const out2 = [`# Functional requirements`, ``];
  out2.push(`_This SRD is partitioned into module PRDs \u2014 the full requirement blocks (description,`);
  out2.push(`acceptance criteria, traceability) live in each module's PRD under [../prd/](../prd/README.md)._`, ``);
  out2.push(`| Requirement | Title | Priority | Module | PRD |`);
  out2.push(`|---|---|---|---|---|`);
  for (const fr of srd.functional) {
    const link = fr.module ? `[../prd/${fr.module}/PRD.md](../prd/${fr.module}/PRD.md)` : "\u2014";
    out2.push(`| ${fr.id} | ${cell(fr.title)} | ${fr.priority} | ${fr.module ?? "\u2014"} | ${link} |`);
  }
  out2.push(``);
  return out2.join("\n");
}
function renderModulePRD(srd, m) {
  const frs = srd.functional.filter((f) => f.module === m.id);
  const others = (srd.modules ?? []).filter((o) => o.id !== m.id);
  const frIdSet = new Set(frs.map((f) => f.id));
  const out2 = [`# PRD \u2014 ${m.name}`, ``];
  out2.push(`_Module \`${m.id}\` \xB7 ${srd.product.name} \xB7 ${frs.length} requirement(s)_`, ``);
  if (m.description) out2.push(m.description, ``);
  out2.push(
    `**Global context:** [Vision](../../00-overview/VISION.md) \xB7 [Scope](../../00-overview/SCOPE.md) \xB7 [Non-functional requirements](../../requirements/NON-FUNCTIONAL.md) \xB7 [Data model](../../architecture/DATA-MODEL.md) \xB7 [Interfaces](../../architecture/INTERFACES.md) \xB7 [Traceability](../../TRACEABILITY.md)`,
    ``
  );
  out2.push(`## Scope`, ``);
  out2.push(`**In scope:** ${frs.length ? frs.map((f) => f.id).join(", ") : "\u2014"}.`, ``);
  if (others.length) {
    out2.push(`**Out of scope** (owned by other modules): ${others.map((o) => `[${o.name}](../${o.id}/PRD.md)`).join(", ")}.`, ``);
  }
  out2.push(`## Requirements`, ``);
  if (!frs.length) out2.push(`_No requirements assigned to this module._`, ``);
  for (const fr of frs) out2.push(...renderFRBlock(fr));
  const nfrIds = new Set(frs.flatMap((f) => f.nfrs));
  const nfrs = srd.nonFunctional.filter((n) => nfrIds.has(n.id));
  out2.push(`## Non-functional requirements`, ``);
  if (nfrs.length) {
    out2.push(`_Applying to this module's requirements \u2014 full statements in [NON-FUNCTIONAL.md](../../requirements/NON-FUNCTIONAL.md)._`, ``);
    out2.push(`| NFR | Category | Metric |`, `|---|---|---|`);
    for (const n of nfrs) out2.push(`| ${n.id} | ${cell(n.category)} | ${cell(n.metric ?? "\u2014")} |`);
  } else {
    out2.push(`_None linked._`);
  }
  out2.push(``);
  const entities = srd.architecture.dataModel.filter((e) => e.referencedByFRs.some((id) => frIdSet.has(id)));
  out2.push(`## Data model (module slice)`, ``);
  if (entities.length) {
    out2.push(`| Entity | Referenced by |`, `|---|---|`);
    for (const e of entities) out2.push(`| ${cell(e.name)} | ${e.referencedByFRs.filter((id) => frIdSet.has(id)).join(", ")} |`);
  } else {
    out2.push(`_No entities touch this module yet._`);
  }
  out2.push(``);
  const ifaces = srd.architecture.interfaces.filter((i2) => i2.relatedFRs.some((id) => frIdSet.has(id)));
  out2.push(`## Interfaces (module slice)`, ``);
  if (ifaces.length) {
    out2.push(`| Interface | Kind | Related |`, `|---|---|---|`);
    for (const i2 of ifaces) out2.push(`| ${cell(i2.name)} | ${i2.kind} | ${i2.relatedFRs.filter((id) => frIdSet.has(id)).join(", ")} |`);
  } else {
    out2.push(`_No interfaces touch this module yet._`);
  }
  out2.push(``);
  out2.push(`## Dependencies`, ``);
  const declared = m.dependsOn.map((dep) => {
    const d = others.find((o) => o.id === dep);
    return d ? `[${d.name}](../${d.id}/PRD.md)` : dep;
  });
  const shared = [];
  for (const o of others) {
    const oSet = new Set(o.frIds);
    const names = entities.filter((e) => e.referencedByFRs.some((id) => oSet.has(id))).map((e) => e.name);
    if (names.length) shared.push(`shares ${names.join(", ")} with [${o.name}](../${o.id}/PRD.md)`);
  }
  if (!declared.length && !shared.length) out2.push(`_None._`);
  if (declared.length) out2.push(`- **Declared:** depends on ${declared.join(", ")}.`);
  for (const s of shared) out2.push(`- **Derived (shared data):** ${s}.`);
  out2.push(``);
  return out2.join("\n");
}
function renderModulePrdIndex(srd) {
  const out2 = [`# Module PRDs`, ``];
  out2.push(`One PRD per product module, rendered from SRD.json. Cross-module docs (vision, scope,`);
  out2.push(`NFRs, architecture, ADRs, traceability) live at the SRD root; the cross-module requirement`);
  out2.push(`index is [../requirements/FUNCTIONAL.md](../requirements/FUNCTIONAL.md).`, ``);
  out2.push(`| Module | PRD | Requirements | Depends on |`);
  out2.push(`|---|---|---|---|`);
  for (const m of srd.modules ?? []) {
    out2.push(`| ${cell(m.name)} | [${m.id}/PRD.md](${m.id}/PRD.md) | ${m.frIds.join(", ") || "\u2014"} | ${m.dependsOn.join(", ") || "\u2014"} |`);
  }
  out2.push(``);
  return out2.join("\n");
}
function renderFeaturePRD(fr, srd) {
  const out2 = [`# PRD ${fr.id} \u2014 ${fr.title}${cite(fr.rationaleEvidence)}`, ``];
  out2.push(`_Priority: ${fr.priority}_ \xB7 _Product: ${srd.product.name}_`, ``);
  out2.push(`## Context`, ``, srd.product.problem, ``);
  out2.push(`## Feature`, ``, fr.description, ``);
  out2.push(`## Acceptance criteria`, ``);
  for (const a of fr.acceptance) {
    out2.push(`- **Given** ${a.given} **When** ${a.when} **Then** ${a.then}`);
  }
  out2.push(``, `## Non-functional requirements`, ``);
  if (!fr.nfrs.length) out2.push(`_None linked._`);
  for (const id of fr.nfrs) {
    const nfr = srd.nonFunctional.find((n) => n.id === id);
    out2.push(nfr ? `- **${nfr.id}** (${nfr.category}): ${nfr.statement}${nfr.metric ? ` \u2014 metric: ${nfr.metric}` : ""}` : `- **${id}**`);
  }
  out2.push(``, `## Data & interfaces`, ``);
  out2.push(`- Entities: ${fr.entities.length ? fr.entities.join(", ") : "\u2014"}`);
  out2.push(`- Interfaces: ${fr.interfaces.length ? fr.interfaces.join(", ") : "\u2014"}`);
  out2.push(``, `## Grounding`, ``);
  out2.push(
    fr.rationaleEvidence.length ? `Evidence:${cite(fr.rationaleEvidence)} \u2014 see ../../evidence/EVIDENCE.md.` : `_Ungrounded \u2014 see the grounding report (construct check)._`
  );
  out2.push(``);
  return out2.join("\n");
}
function renderPRDIndex(srd) {
  const out2 = [`# PRDs \u2014 one per functional requirement`, ``];
  out2.push(`Rendered from SRD.json by \`construct render --prd\`. The canonical, always-current`);
  out2.push(`requirement list is [../FUNCTIONAL.md](../FUNCTIONAL.md); re-render after editing.`, ``);
  out2.push(`| PRD | Priority | Title |`);
  out2.push(`|---|---|---|`);
  for (const fr of srd.functional) {
    const file = `PRD-${fr.id}-${slugTitle(fr.title)}.md`;
    out2.push(`| [${file}](${file}) | ${cell(fr.priority)} | ${cell(fr.title)} |`);
  }
  out2.push(``);
  return out2.join("\n");
}
function renderNonFunctional(srd) {
  const out2 = [`# Non-functional requirements`, ``];
  if (!srd.nonFunctional.length) out2.push(`_No non-functional requirements defined._`, ``);
  for (const n of srd.nonFunctional) {
    out2.push(`## ${n.id} \u2014 ${n.category}${cite(n.rationaleEvidence)}`);
    out2.push(``);
    out2.push(n.statement);
    if (n.metric) out2.push(``, `- **Metric:** ${n.metric}`);
    out2.push(``);
  }
  return out2.join("\n");
}
function renderSystemContext(srd) {
  return [`# System context`, ``, srd.architecture.context, ``].join("\n");
}
function renderDataModel(srd) {
  const out2 = [`# Data model`, ``];
  const entities = srd.architecture.dataModel;
  if (!entities.length) {
    out2.push(`_No entities defined yet. Enrich during authoring: list entities, their attributes, and which functional requirements reference each._`, ``);
    return out2.join("\n");
  }
  out2.push(`_Seeded by inference from the brief \u2014 verify each entity and extend attributes during authoring._`, ``);
  for (const e of entities) {
    out2.push(`## ${e.name}`);
    out2.push(``);
    if (e.attributes.length) {
      out2.push(`| Attribute | Type |`, `|---|---|`);
      for (const a of e.attributes) out2.push(`| ${cell(a.name)} | ${cell(a.type)} |`);
    }
    out2.push(``, `_Referenced by: ${e.referencedByFRs.length ? e.referencedByFRs.join(", ") : "\u2014"}_`, ``);
  }
  return out2.join("\n");
}
function renderInterfaces(srd) {
  const out2 = [`# Interfaces`, ``];
  const ifaces = srd.architecture.interfaces;
  if (!ifaces.length) {
    out2.push(`_No interfaces defined yet. Enrich during authoring: list the API/event/UI/CLI surfaces and the functional requirements each serves._`, ``);
    return out2.join("\n");
  }
  out2.push(`_Seeded by inference from the brief \u2014 verify each surface and define its contract during authoring._`, ``);
  for (const i2 of ifaces) {
    out2.push(`## ${i2.name} _(${i2.kind})_`, ``, i2.summary, ``, `_Related: ${i2.relatedFRs.length ? i2.relatedFRs.join(", ") : "\u2014"}_`, ``);
  }
  return out2.join("\n");
}
function renderADR(adr) {
  const out2 = [
    `# ${adr.id}. ${adr.title}`,
    ``,
    `- **Status:** ${adr.status}`,
    ``,
    `## Context`,
    adr.context,
    ``,
    `## Decision`,
    `${adr.decision}${cite(adr.evidence)}`,
    ``,
    `## Consequences`,
    adr.consequences,
    ``
  ];
  if (adr.alternatives) out2.push(`## Alternatives considered`, adr.alternatives, ``);
  return out2.join("\n");
}
function renderLandscape(srd) {
  const out2 = [`# Competitive landscape`, ``, `## Competitors`, ``];
  if (srd.competitive.competitors.length) {
    out2.push(`| Product | Note | Evidence |`, `|---|---|---|`);
    for (const c2 of srd.competitive.competitors) {
      const ev = c2.evidence.length ? c2.evidence.map((id) => `[${id}]`).join("") : "_ungrounded_";
      out2.push(`| ${cell(c2.name)} | ${cell(c2.note)} | ${ev} |`);
    }
  } else {
    out2.push(`_No competitors captured. Use the market research angle to discover them._`);
  }
  out2.push(``, `## Comparable open-source projects`, ``);
  if (srd.competitive.oss.length) {
    out2.push(`| Project | Note | Evidence |`, `|---|---|---|`);
    for (const o of srd.competitive.oss) {
      const name2 = o.url ? `[${cell(o.name)}](${o.url})` : cell(o.name);
      const ev = o.evidence.length ? o.evidence.map((id) => `[${id}]`).join("") : "_ungrounded_";
      out2.push(`| ${name2} | ${cell(o.note)} | ${ev} |`);
    }
  } else {
    out2.push(`_No OSS prior art captured. Use the oss research angle to mine comparable projects._`);
  }
  out2.push(``);
  return out2.join("\n");
}
function renderBuildPlan(srd) {
  const out2 = [`# Build plan`, ``];
  for (const m of srd.buildPlan) {
    out2.push(`## ${m.title}`, ``, m.outcome, ``);
    out2.push(`- **Requirements:** ${m.frIds.length ? m.frIds.join(", ") : "\u2014"}`);
    if (m.risks.length) {
      out2.push(`- **Risks:**`);
      for (const r of m.risks) out2.push(`  - ${r}`);
    }
    out2.push(``);
  }
  return out2.join("\n");
}
function renderTraceability(srd) {
  const design = !!srd.design;
  const modules = !!srd.modules?.length;
  const cols = ["Requirement", ...modules ? ["Module"] : [], "NFRs", "ADRs", "Entities", "Interfaces", ...design ? ["Components", "Screens"] : []];
  const out2 = [`# Traceability matrix`, ``, `| ${cols.join(" | ")} |`, `|${cols.map(() => "---").join("|")}|`];
  for (const r of srd.traceability) {
    const cells = [
      r.fr,
      ...modules ? [r.module ?? "\u2014"] : [],
      r.nfrs.join(", ") || "\u2014",
      r.adrs.join(", ") || "\u2014",
      r.entities.join(", ") || "\u2014",
      r.interfaces.join(", ") || "\u2014"
    ];
    if (design) {
      cells.push((r.components ?? []).map(cell).join(", ") || "\u2014");
      cells.push((r.screens ?? []).map(cell).join(", ") || "\u2014");
    }
    out2.push(`| ${cells.join(" | ")} |`);
  }
  out2.push(``);
  return out2.join("\n");
}
function renderDesignPrinciples(ds) {
  return [
    `# Design principles`,
    ``,
    bullets(ds.principles, "No design principles captured."),
    ``,
    `## Content & voice`,
    ``,
    bullets(ds.contentVoice, "No content guidelines captured."),
    ``
  ].join("\n");
}
function renderDesignTokens(ds) {
  const out2 = ds.tokensAuthored ? [`# Design tokens`, ``] : [`# Design tokens`, ``, `_${DESIGN_TOKENS_SEEDED_BANNER}_`, ``];
  const cats = [...new Set(ds.tokens.map((t) => t.category))];
  for (const cat of cats) {
    const toks = ds.tokens.filter((t) => t.category === cat);
    out2.push(`## ${cell(cat)}`, ``, `| Token | Value | Notes |`, `|---|---|---|`);
    for (const t of toks) out2.push(`| ${cell(t.name)} | ${cell(t.value)} | ${cell(t.note ?? "")} |`);
    out2.push(``);
  }
  out2.push("> The machine-readable token set is in `design/design-tokens.json`.", ``);
  return out2.join("\n");
}
function renderDesignTokensJson(ds) {
  const obj = {};
  for (const t of ds.tokens) {
    (obj[t.category] ??= {})[t.name] = t.value;
  }
  return JSON.stringify(obj, null, 2);
}
function renderComponents(ds) {
  const out2 = [`# Components`, ``];
  if (!ds.components.length) {
    out2.push(`_No components defined yet. Enrich during authoring: name each component, its states and the requirements it realises._`, ``);
    return out2.join("\n");
  }
  out2.push(`_Seeded from the functional requirements \u2014 verify each component and its states during authoring._`, ``);
  for (const c2 of ds.components) {
    out2.push(`## ${c2.name}${cite(c2.evidence)}`, ``, c2.purpose, ``);
    out2.push(`- **States:** ${c2.states.join(", ") || "\u2014"}`);
    out2.push(`- **Realises:** ${c2.relatedFRs.length ? c2.relatedFRs.join(", ") : "\u2014"}`, ``);
  }
  return out2.join("\n");
}
function renderScreens(ds) {
  const out2 = [`# Screens & flows`, ``];
  if (ds.navigation && ds.navigation.trim()) {
    out2.push(`## Shell & navigation`, ``, ds.navigation.trim(), ``);
  }
  out2.push(`## Screens`, ``);
  if (ds.screens.length) {
    out2.push(`| Screen | Purpose | Requirements |`, `|---|---|---|`);
    for (const s of ds.screens) out2.push(`| ${cell(s.name)} | ${cell(s.purpose)} | ${s.relatedFRs.join(", ") || "\u2014"} |`);
  } else {
    out2.push(`_No screens defined._`);
  }
  out2.push(``, `## User flows`, ``);
  if (ds.flows.length) {
    for (const f of ds.flows) {
      out2.push(`### ${f.name}${f.frIds.length ? ` _(${f.frIds.join(", ")})_` : ""}`, ``);
      f.steps.forEach((step, i2) => out2.push(`${i2 + 1}. ${step}`));
      out2.push(``);
    }
  } else {
    out2.push(`_No user flows defined._`);
  }
  return out2.join("\n");
}
function renderAccessibility(ds) {
  const a = ds.accessibility;
  const out2 = [`# Accessibility`, ``, `**Target standard:** ${a.standard}`, ``];
  if (!a.requirements.length) {
    out2.push(`_No accessibility requirements defined._`, ``);
    return out2.join("\n");
  }
  for (const r of a.requirements) {
    out2.push(`## ${r.id} \u2014 ${r.statement}`, ``, `**Acceptance criteria:**`);
    for (const c2 of r.acceptance) out2.push(`- **Given** ${c2.given} **When** ${c2.when} **Then** ${c2.then}`);
    out2.push(``);
  }
  return out2.join("\n");
}
function renderMergeBundle(srd) {
  const parts2 = [
    `# Software Requirements Document \u2014 ${srd.product.name}`,
    ``,
    `_Level: ${srd.level} \xB7 generated: ${srd.generatedAt}_`,
    ``,
    renderVision(srd),
    renderScope(srd),
    // Always the full FR blocks: the bundle is the one-file reading copy, so it
    // must stay complete even when FUNCTIONAL.md is an index (modules mode).
    renderFunctionalFull(srd),
    renderNonFunctional(srd),
    renderSystemContext(srd),
    renderDataModel(srd),
    renderInterfaces(srd),
    `# Architecture decisions`,
    ``,
    ...srd.architecture.adrs.map(renderADR),
    ...srd.design ? [
      `# Design system`,
      ``,
      renderDesignPrinciples(srd.design),
      renderDesignTokens(srd.design),
      renderComponents(srd.design),
      renderScreens(srd.design),
      renderAccessibility(srd.design)
    ] : [],
    renderLandscape(srd),
    renderBuildPlan(srd),
    renderTraceability(srd)
  ];
  return parts2.join("\n");
}

// src/brainstorm.ts
var ANGLES = ["reframe", "segment", "feature", "differentiator", "anti-goal", "wildcard"];
var STATUSES = ["proposed", "kept", "parked", "rejected"];
var TARGETS = ["featureWishlist", "competitors", "nonGoals", "goals", "candidateTech", "openQuestions"];
function brainstormPath(runDir) {
  return join2(runDir, "brainstorm.json");
}
function initBrainstorm(idea, now) {
  return { schemaVersion: BRAINSTORM_SCHEMA_VERSION, idea: idea.trim(), createdAt: now, ideas: [] };
}
function saveBrainstorm(runDir, b) {
  mkdirSync2(runDir, { recursive: true });
  const path = brainstormPath(runDir);
  writeFileSync2(path, JSON.stringify(b, null, 2));
  return path;
}
function writeBrainstormMd(runDir, b) {
  mkdirSync2(runDir, { recursive: true });
  const path = join2(runDir, "BRAINSTORM.md");
  const md = renderBrainstormMd(b);
  writeFileSync2(path, md.endsWith("\n") ? md : md + "\n");
  return path;
}
function brainstormCounts(b) {
  const counts = { proposed: 0, kept: 0, parked: 0, rejected: 0 };
  for (const i2 of b.ideas) if (counts[i2.status] !== void 0) counts[i2.status]++;
  return counts;
}
var line = (v) => typeof v === "string" ? v.replace(/\s+/g, " ").trim() : void 0;
function loadBrainstorm(runDir, warn = () => {
}) {
  const path = brainstormPath(runDir);
  if (!existsSync2(path)) return void 0;
  let data;
  try {
    data = JSON.parse(readFileSync2(path, "utf8"));
  } catch (e) {
    throw new Error(`brainstorm.json is unreadable: ${e.message}`);
  }
  const d = data ?? {};
  const used = /* @__PURE__ */ new Set();
  let seq = 0;
  const nextId = () => {
    do {
      seq++;
    } while (used.has(`B-${String(seq).padStart(3, "0")}`));
    const id = `B-${String(seq).padStart(3, "0")}`;
    used.add(id);
    return id;
  };
  const rawIdeas = Array.isArray(d.ideas) ? d.ideas : [];
  if (!Array.isArray(d.ideas) && d.ideas !== void 0) warn("brainstorm.ideas is not an array \u2014 ignored.");
  for (const raw of rawIdeas) {
    const id = line(raw?.id);
    if (id && /^B-\d{3,}$/.test(id)) used.add(id);
  }
  const ideas = [];
  rawIdeas.forEach((raw, i2) => {
    const r = raw ?? {};
    const title = line(r.title);
    if (!title) {
      warn(`brainstorm.ideas[${i2}] has no usable title \u2014 dropped.`);
      return;
    }
    let id = line(r.id);
    if (!id || !/^B-\d{3,}$/.test(id)) id = nextId();
    let angle = r.angle;
    if (!ANGLES.includes(angle)) {
      if (r.angle !== void 0) warn(`brainstorm ${id}: angle "${String(r.angle)}" is not recognized \u2014 treated as wildcard.`);
      angle = "wildcard";
    }
    let status = r.status;
    if (!STATUSES.includes(status)) {
      if (r.status !== void 0) warn(`brainstorm ${id}: status "${String(r.status)}" is not recognized \u2014 treated as proposed.`);
      status = "proposed";
    }
    let target = r.target;
    if (target !== void 0 && !TARGETS.includes(target)) {
      warn(`brainstorm ${id}: target "${String(r.target)}" is not recognized \u2014 removed.`);
      target = void 0;
    }
    const idea = { id, angle, title, status };
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
    ...line(d.updatedAt) ? { updatedAt: line(d.updatedAt) } : {},
    ideas
  };
}
var norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
function mergeBrainstorm(briefIn, brainstormIn, now, warn = () => {
}) {
  const brief = JSON.parse(JSON.stringify(briefIn));
  const brainstorm = JSON.parse(JSON.stringify(brainstormIn));
  let merged = 0;
  let parkedFolded = 0;
  let skipped = 0;
  const appendUnique = (list, value) => {
    if (list.some((x) => norm(x) === norm(value))) return false;
    list.push(value);
    return true;
  };
  for (const idea of brainstorm.ideas) {
    if (idea.mergedAt) continue;
    if (idea.status === "parked") {
      appendUnique(brief.openQuestions, `Parked idea ${idea.id}: ${idea.title}`);
      idea.mergedAt = now;
      parkedFolded++;
      continue;
    }
    if (idea.status !== "kept") continue;
    if (!idea.target) {
      warn(`brainstorm ${idea.id} "${idea.title}" is kept but has no target \u2014 set one (featureWishlist, competitors, \u2026) and re-merge.`);
      skipped++;
      continue;
    }
    if (idea.target === "featureWishlist") {
      const exists = brief.featureWishlist.some((f) => norm(f.title) === norm(idea.title));
      if (exists) {
        warn(`brainstorm ${idea.id} "${idea.title}" is already in the wishlist \u2014 skipped.`);
      } else {
        brief.featureWishlist.push({ title: idea.title, priority: idea.priority ?? "could", ...idea.notes ? { notes: idea.notes } : {} });
      }
      idea.mergedAt = now;
      merged++;
      continue;
    }
    if (idea.target === "goals" && brief.nonGoals.some((g) => norm(g) === norm(idea.title))) {
      warn(`brainstorm ${idea.id} "${idea.title}" conflicts with an existing nonGoal \u2014 NOT merged; resolve it in brief.json first.`);
      skipped++;
      continue;
    }
    if (idea.target === "nonGoals" && brief.goals.some((g) => norm(g) === norm(idea.title))) {
      warn(`brainstorm ${idea.id} "${idea.title}" conflicts with an existing goal \u2014 NOT merged; resolve it in brief.json first.`);
      skipped++;
      continue;
    }
    const value = idea.target === "openQuestions" && idea.notes ? `${idea.title} \u2014 ${idea.notes}` : idea.title;
    const list = brief[idea.target];
    if (!appendUnique(list, value)) warn(`brainstorm ${idea.id} "${idea.title}" is already in ${idea.target} \u2014 skipped.`);
    idea.mergedAt = now;
    merged++;
  }
  brainstorm.updatedAt = now;
  const proposed = brainstorm.ideas.filter((i2) => i2.status === "proposed").length;
  return { brief, brainstorm, merged, parkedFolded, skipped, proposed };
}

// src/research/registry.ts
import { join as join9 } from "path";

// src/research/fetch.ts
var UA = "construct/0.x (+https://github.com/maxgfr/construct)";
var BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
function transient(status) {
  return status === 0 || status === 429 || status >= 500;
}
async function httpGet(url, opts = {}) {
  const retries = opts.retries ?? 1;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let last = { ok: false, status: 0, body: "", contentType: "", error: "unreached" };
  for (let attempt = 0; attempt <= retries; attempt++) {
    last = await httpGetOnce(url, opts);
    if (last.ok || !transient(last.status)) return last;
    if (attempt === retries) break;
    const retryAfterS = Number(last.retryAfter);
    const delay = last.status === 429 && Number.isFinite(retryAfterS) && retryAfterS > 0 ? Math.min(retryAfterS * 1e3, RETRY_AFTER_CAP_MS) : RETRY_BASE_DELAY_MS * 2 ** attempt + Math.random() * RETRY_JITTER_MS;
    await sleep(delay);
  }
  return last;
}
async function httpGetOnce(url, opts) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? HTTP_GET_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: opts.accept ?? "*/*", ...opts.headers ?? {} }
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const max = opts.maxBytes ?? 4 * 1024 * 1024;
    return {
      ok: res.ok,
      status: res.status,
      body: buf.subarray(0, max).toString("utf8"),
      contentType: res.headers.get("content-type") ?? "",
      retryAfter: res.headers.get("retry-after") ?? void 0
    };
  } catch (e) {
    return { ok: false, status: 0, body: "", contentType: "", error: e.message };
  } finally {
    clearTimeout(t);
  }
}
async function httpJson(method, url, body2, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? HTTP_JSON_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: { "content-type": "application/json", accept: "application/json", "user-agent": UA },
      body: body2 === void 0 ? void 0 : JSON.stringify(body2)
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : void 0;
    } catch {
      data = text;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: void 0, error: e.message };
  } finally {
    clearTimeout(t);
  }
}
var NAMED = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  copy: "\xA9"
};
function htmlToText(html) {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<(script|style|noscript|head|nav|footer|svg)[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<\/(p|div|section|article|li|tr|td|th|ul|ol|h[1-6]|pre|blockquote)>/gi, "\n");
  s = s.replace(/<(p|div|section|article|li|tr|td|th|ul|ol|h[1-6]|pre|blockquote|table)\b[^>]*>/gi, "\n");
  s = s.replace(/<(br|hr)\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|mdash|ndash|hellip|copy);/gi, (m, g) => {
    if (g[0] === "#") {
      const n = g[1] === "x" || g[1] === "X" ? parseInt(g.slice(2), 16) : Number(g.slice(1));
      try {
        return Number.isFinite(n) ? String.fromCodePoint(n) : " ";
      } catch {
        return " ";
      }
    }
    return NAMED[g.toLowerCase()] ?? m;
  });
  s = s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return s.split("\n").map((l) => l.trim()).filter((l) => l.length > 0).join("\n");
}
var CONSENT_PATTERNS = [
  /\bcookies?\b/i,
  /\bconsent\b/i,
  /\bgdpr\b/i,
  /\bccpa\b/i,
  /accept all\b/i,
  /reject all\b/i,
  /manage (?:preferences|choices|cookies|settings)/i,
  /privacy (?:policy|preferences|choices)/i,
  /tracking technolog/i,
  /advertising partners/i,
  /legitimate interest/i
];
function stripConsentBoilerplate(text) {
  let dropped = 0;
  const kept = text.split("\n").filter((line2) => {
    const hits = CONSENT_PATTERNS.reduce((n, re) => n + (re.test(line2) ? 1 : 0), 0);
    const isBanner2 = hits >= 2 || hits === 1 && line2.trim().length < 120;
    if (isBanner2) dropped++;
    return !isBanner2;
  });
  return { text: kept.join("\n"), dropped };
}
function metaDescriptionOf(html) {
  const m = /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i.exec(html) || /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']description["']/i.exec(html) || /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["']/i.exec(html);
  const d = m?.[1]?.replace(/\s+/g, " ").trim();
  return d || void 0;
}
async function fetchAndExtract(url) {
  let res = await httpGet(url, { accept: "text/html,text/plain,*/*" });
  if (!res.ok && (res.status === 403 || res.status === 429)) {
    res = await httpGet(url, {
      accept: "text/html,application/xhtml+xml,*/*",
      headers: { "user-agent": BROWSER_UA, "accept-language": "en-US,en;q=0.9" }
    });
  }
  if (!res.ok) {
    return { text: "", note: `Could not fetch ${url} (status ${res.status}${res.error ? ", " + res.error : ""}).` };
  }
  const isHtml = /html/i.test(res.contentType) || /^\s*</.test(res.body);
  const metaDescription = isHtml ? metaDescriptionOf(res.body) : void 0;
  const rawText = isHtml ? htmlToText(res.body) : res.body;
  const text = isHtml ? stripConsentBoilerplate(rawText).text : rawText;
  return { text, ...metaDescription ? { metaDescription } : {} };
}
function excerptsFromText(text, url, title, source, question, perSource) {
  const lines = text.split("\n");
  const questions = (Array.isArray(question) ? question : [question]).filter((q) => q.trim());
  const kwSets = questions.map((q) => keywords(q).map((k) => k.toLowerCase()));
  const hits = [];
  for (let i2 = 0; i2 < lines.length; i2++) {
    const low = lines[i2].toLowerCase();
    let cov = 0;
    for (const kws of kwSets) {
      let c2 = 0;
      for (const kw of kws) if (low.includes(kw)) c2++;
      if (kws.length && c2 > cov) cov = c2;
    }
    if (cov > 0) hits.push({ idx: i2, cov });
  }
  hits.sort((a, b) => b.cov - a.cov || a.idx - b.idx);
  const items = [];
  const ranges = [];
  const take = hits.length ? hits : [{ idx: 0, cov: 0 }];
  const perDoc = Math.min(2, Math.max(1, perSource));
  for (const h of take) {
    if (items.length >= perDoc) break;
    const start2 = Math.max(0, h.idx - 3);
    const end = Math.min(lines.length, h.idx + 12);
    if (ranges.some((r) => start2 < r.end && end > r.start)) continue;
    ranges.push({ start: start2, end });
    const snippet = lines.slice(start2, end).join("\n").slice(0, 1500);
    if (!snippet.trim()) continue;
    items.push({
      source,
      // Disambiguate the second+ excerpt of one page by its line range, so two
      // excerpts of the same URL don't render identical titles.
      title: items.length === 0 ? title : `${title} (lines ${start2 + 1}\u2013${end})`,
      ref: url,
      location: `${url}#~${start2 + 1}`,
      score: Number((h.cov + 1).toFixed(3)),
      snippet,
      url,
      // cov=0 means no line matched the question — this is the top-of-page
      // fallback, likely boilerplate. Flag it so review/analyze down-weight it.
      ...h.cov === 0 ? { meta: { lowSignal: true } } : {}
    });
  }
  return items;
}

// src/research/web.ts
var SEARXNG_BASE = process.env.CONSTRUCT_SEARXNG || "http://localhost:8888";
async function viaSearxng(query2, n) {
  const url = `${SEARXNG_BASE.replace(/\/$/, "")}/search?q=${encodeURIComponent(query2)}&format=json`;
  const r = await httpGet(url, { accept: "application/json", timeoutMs: SEARXNG_TIMEOUT_MS, retries: 0 });
  if (!r.ok) return null;
  try {
    const data = JSON.parse(r.body);
    const urls = (data.results ?? []).map((x) => x.url).filter(Boolean);
    return urls.slice(0, n);
  } catch {
    return null;
  }
}
async function viaDuckDuckGo(query2, n) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query2)}`;
  const r = await httpGet(url, { accept: "text/html", timeoutMs: DDG_TIMEOUT_MS });
  if (!r.ok || !r.body) return null;
  const urls = [];
  const tagRe = /<a\b[^>]*\bresult__a\b[^>]*>/g;
  let m;
  while ((m = tagRe.exec(r.body)) && urls.length < n) {
    const href0 = /\bhref="([^"]+)"/.exec(m[0]);
    if (!href0) continue;
    let href = href0[1];
    const uddg = /[?&]uddg=([^&]+)/.exec(href);
    if (uddg) {
      try {
        href = decodeURIComponent(uddg[1]);
      } catch {
      }
    }
    if (/^https?:\/\//.test(href) && !/duckduckgo\.com/.test(href)) urls.push(href);
  }
  return urls.length ? urls : null;
}
async function discover(query2, engine, n) {
  const notes = [];
  if (engine === "searxng" || engine === "auto") {
    const s = await viaSearxng(query2, n);
    if (s?.length) return { urls: s, via: "searxng", notes };
    if (engine === "searxng") {
      notes.push(s === null ? `SearXNG unreachable at ${SEARXNG_BASE}. Run \`construct semantic up\`.` : "SearXNG returned no results.");
    }
  }
  if (engine === "ddg" || engine === "auto") {
    const d = await viaDuckDuckGo(query2, n);
    if (d?.length) return { urls: d, via: "duckduckgo", notes };
    if (engine === "ddg") notes.push("DuckDuckGo returned no results.");
  }
  if (engine === "claude" || engine === "auto") {
    notes.push(
      "No keyless engine returned results. Use your built-in WebSearch to find URLs, then ground them with `construct research --out <run> --url <url,...>` (the `web` drill only prints \u2014 `research --url` is what persists them to the dossier)."
    );
  }
  return { urls: [], via: "none", notes };
}
async function webFetchUrls(urls, question, perSource, source = "market", fetchAll = false) {
  const items = [];
  const notes = [];
  const toFetch = fetchAll ? urls : urls.slice(0, Math.max(1, Math.ceil(perSource / 2)));
  for (const url of toFetch) {
    const { text, note, metaDescription } = await fetchAndExtract(url);
    if (note) notes.push(note);
    if (!text) continue;
    const ex = excerptsFromText(text, url, `${labelFor(source)} \u2014 ${url}`, source, question, perSource);
    if (ex.length) {
      for (const item of ex) {
        if (item.meta?.lowSignal && metaDescription) item.snippet = metaDescription;
      }
      items.push(...ex);
    } else {
      items.push({
        source,
        title: `${labelFor(source)} \u2014 ${url}`,
        ref: url,
        location: url,
        score: 0,
        snippet: metaDescription ?? text.slice(0, 800),
        url,
        meta: { lowSignal: true }
      });
    }
  }
  return { items, notes };
}
function labelFor(source) {
  return source === "docs" ? "Docs" : source === "oss" ? "OSS" : "Web";
}

// src/research/market.ts
async function marketAngle(ctx) {
  const b = ctx.brief;
  const query2 = ctx.query || [b.idea, b.competitors.join(" "), "competitors alternatives market"].filter(Boolean).join(" ").trim();
  const items = [];
  const notes = [];
  const pinned = ctx.marketUrls ?? [];
  const questions = [query2, ...b.featureWishlist.map((f) => `${f.title} ${f.notes ?? ""}`.trim())].filter(Boolean);
  if (pinned.length) {
    const f = await webFetchUrls(pinned, questions.length ? questions : pinned.join(" "), ctx.perSource, "market", true);
    items.push(...f.items.slice(0, ctx.perSource));
    notes.push(`Pinned ${pinned.length} market URL(s) via --url.`, ...f.notes);
  }
  if (!query2) {
    if (items.length) return [{ source: "market", items, notes }];
    return [{ source: "market", items: [], notes: ["No idea/competitors to search the market for."] }];
  }
  const budget = ctx.perSource - items.length;
  if (budget > 0) {
    const { urls, via, notes: discoveryNotes } = await discover(query2, ctx.webEngine, budget);
    if (urls.length === 0) {
      notes.push(`Market discovery via ${via}.`, ...discoveryNotes);
    } else {
      const fetched = await webFetchUrls(urls, questions, budget, "market");
      items.push(...fetched.items);
      notes.push(`Market discovery via ${via} for "${query2}".`, ...discoveryNotes, ...fetched.notes);
    }
  }
  return [{ source: "market", items, notes }];
}

// src/clone.ts
import { existsSync as existsSync3, statSync, mkdirSync as mkdirSync3, readdirSync, rmSync } from "fs";
import { resolve, join as join3, basename } from "path";
import { tmpdir } from "os";
function cacheRoot() {
  return join3(tmpdir(), "construct");
}
function resolveRepo(raw) {
  const trimmed = raw.trim();
  if (trimmed) {
    const asPath = resolve(trimmed);
    if (existsSync3(asPath) && statSync(asPath).isDirectory()) {
      return {
        raw: trimmed,
        host: "local",
        isLocal: true,
        slug: "local-" + slugify(basename(asPath) + "-" + asPath)
      };
    }
  }
  let host;
  let path;
  const scp = /^git@([^:]+):(.+)$/.exec(trimmed);
  const url = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i.exec(trimmed);
  const hostPath = /^([a-z0-9.-]+\.[a-z]{2,})\/(.+)$/i.exec(trimmed);
  if (scp) {
    host = scp[1];
    path = scp[2];
  } else if (url) {
    host = url[1];
    path = url[2];
  } else if (hostPath) {
    host = hostPath[1];
    path = hostPath[2];
  } else if (/^[\w.-]+\/[\w.-]+$/.test(trimmed)) {
    host = "github.com";
    path = trimmed;
  } else {
    return { raw: trimmed, host: "generic", isLocal: false, slug: slugify(trimmed) || "seed" };
  }
  host = host.toLowerCase();
  path = path.replace(/\.git$/, "").replace(/\/+$/, "");
  const segments = path.split("/").filter(Boolean);
  const repo = segments.length ? segments[segments.length - 1] : void 0;
  const owner = segments.length > 1 ? segments.slice(0, -1).join("/") : void 0;
  const cloneUrl = /^https?:\/\//i.test(trimmed) || scp ? trimmed.replace(/\/+$/, "") : `https://${host}/${path}.git`;
  const webUrl = `https://${host}/${path}`;
  return {
    raw: trimmed,
    host,
    owner,
    repo,
    cloneUrl: cloneUrl.endsWith(".git") ? cloneUrl : `${cloneUrl}.git`,
    webUrl,
    isLocal: false,
    slug: slugify(`${host}/${path}`)
  };
}
function ensureClone(ref, opts = {}) {
  if (ref.isLocal) return resolve(ref.raw);
  const dir = join3(cacheRoot(), ref.slug);
  const alreadyCloned = existsSync3(join3(dir, ".git"));
  if (alreadyCloned && !opts.refresh) return dir;
  if (alreadyCloned && opts.refresh) {
    sh("git", ["-C", dir, "fetch", "--depth", "1", "origin"], { timeoutMs: GIT_FETCH_TIMEOUT_MS });
    sh("git", ["-C", dir, "reset", "--hard", "FETCH_HEAD"], { timeoutMs: GIT_RESET_TIMEOUT_MS });
    return dir;
  }
  mkdirSync3(cacheRoot(), { recursive: true });
  const args2 = ["clone", "--depth", "1", "--filter=blob:none"];
  if (opts.branch) args2.push("--branch", opts.branch);
  args2.push(ref.cloneUrl, dir);
  const res = sh("git", args2, { timeoutMs: GIT_CLONE_TIMEOUT_MS });
  if (!res.ok) {
    if (res.missing) {
      throw new Error(`git is not installed or not on PATH \u2014 cannot clone ${ref.cloneUrl}`);
    }
    if (existsSync3(dir)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch (e) {
        throw new Error(`could not remove the partial clone at ${dir} before retrying: ${e.message} \u2014 delete it manually and re-run`);
      }
    }
    const fallback = sh("git", ["clone", "--depth", "1", ...opts.branch ? ["--branch", opts.branch] : [], ref.cloneUrl, dir], {
      timeoutMs: GIT_CLONE_TIMEOUT_MS
    });
    if (!fallback.ok) {
      throw new Error(
        [
          `git clone failed for ${ref.cloneUrl}`,
          `  attempt 1 (--filter=blob:none): ${res.stderr.trim() || `exit ${res.status}`}`,
          `  attempt 2 (no filter):          ${fallback.stderr.trim() || `exit ${fallback.status}`}`
        ].join("\n")
      );
    }
  }
  if (!existsSync3(dir) || readdirSync(dir).length === 0) {
    throw new Error(`clone produced an empty tree at ${dir}`);
  }
  return dir;
}

// src/vendor/codeindex-engine.mjs
import { spawnSync as spawnSync2 } from "child_process";
import { readdirSync as readdirSync2, statSync as statSync2, lstatSync, readFileSync as readFileSync3, realpathSync } from "fs";
import { join as join4, sep, extname } from "path";
import { createHash } from "crypto";
import { readFileSync as readFileSync22, existsSync as existsSync4 } from "fs";
import { dirname, join as join22 } from "path";
import { fileURLToPath } from "url";
import { basename as basename2 } from "path";
import { posix } from "path";
import { join as join32 } from "path";
import { posix as posix2 } from "path";
import { join as join42 } from "path";
import { existsSync as existsSync22, readdirSync as readdirSync22 } from "fs";
import { join as join5 } from "path";
import { createInterface } from "readline";
import { basename as basename22 } from "path";
import { existsSync as existsSync32, mkdirSync as mkdirSync4, readFileSync as readFileSync32, writeFileSync as writeFileSync3 } from "fs";
import { join as join6, resolve as resolve2 } from "path";
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var ENGINE_VERSION;
var SCHEMA_VERSION;
var EXTRACTOR_VERSION;
var init_types = __esm({
  "src/types.ts"() {
    "use strict";
    ENGINE_VERSION = "2.0.1";
    SCHEMA_VERSION = 4;
    EXTRACTOR_VERSION = 5;
  }
});
function sh2(cmd, args2, opts = {}) {
  const res = spawnSync2(cmd, args2, {
    cwd: opts.cwd,
    input: opts.input,
    encoding: "utf8",
    timeout: opts.timeoutMs ?? 12e4,
    maxBuffer: 64 * 1024 * 1024,
    env: opts.env ?? process.env
  });
  const missing = !!res.error && res.error.code === "ENOENT";
  return {
    ok: !res.error && res.status === 0,
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? (res.error ? String(res.error.message) : ""),
    missing
  };
}
function have2(cmd) {
  const cached = whichCache2.get(cmd);
  if (cached !== void 0) return cached;
  const probe = sh2(process.platform === "win32" ? "where" : "which", [cmd]);
  const found = probe.ok && probe.stdout.trim().length > 0;
  whichCache2.set(cmd, found);
  return found;
}
function slugify2(input) {
  return input.toLowerCase().replace(/^https?:\/\//, "").replace(/^git@/, "").replace(/\.git$/, "").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}
function clip(s, max) {
  if (s.length <= max) return s;
  return s.slice(0, max) + `
\u2026 [truncated ${s.length - max} chars]`;
}
function clipInline(s, max) {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  let cut = flat.slice(0, max).replace(/\s+\S*$/, "");
  if (!cut) cut = flat.slice(0, max);
  if ((cut.match(/`/g)?.length ?? 0) % 2 === 1) cut = cut.replace(/`[^`]*$/, "");
  if (cut.lastIndexOf("[") > cut.lastIndexOf("]")) cut = cut.slice(0, cut.lastIndexOf("["));
  return cut.replace(/\s+$/, "") + "\u2026";
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function foldText(s) {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}
function keywords2(question) {
  const seen = /* @__PURE__ */ new Set();
  const out2 = [];
  for (const raw of foldText(question).split(/[^A-Za-z0-9_]+/)) {
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if (raw.length < 2) continue;
    if (STOPWORDS2.has(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out2.push(raw);
  }
  return out2;
}
function rankedKeywords2(question) {
  const base = keywords2(question);
  const score = (raw) => {
    let s = 0;
    if (/\d/.test(raw)) s += 3;
    if (/[A-Z]/.test(raw) && !/^[A-Z0-9]+$/.test(raw)) s += 2;
    if (/_/.test(raw)) s += 2;
    if (raw.length >= 8) s += 1.5;
    else if (raw.length >= 5) s += 0.5;
    return s;
  };
  return base.map((k, i2) => ({ k, s: score(k), i: i2 })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.k);
}
function rrf(lists, keyOf2, k = 60) {
  const score = /* @__PURE__ */ new Map();
  for (const list of lists) {
    list.forEach((item, idx) => {
      const key = keyOf2(item);
      score.set(key, (score.get(key) ?? 0) + 1 / (k + idx + 1));
    });
  }
  return score;
}
var whichCache2;
var STOPWORDS2;
var init_util = __esm({
  "src/util.ts"() {
    "use strict";
    whichCache2 = /* @__PURE__ */ new Map();
    STOPWORDS2 = /* @__PURE__ */ new Set([
      "the",
      "a",
      "an",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "do",
      "does",
      "did",
      "how",
      "what",
      "why",
      "when",
      "where",
      "which",
      "who",
      "whom",
      "this",
      "that",
      "these",
      "those",
      "of",
      "in",
      "on",
      "to",
      "for",
      "with",
      "and",
      "or",
      "but",
      "if",
      "then",
      "else",
      "than",
      "as",
      "at",
      "by",
      "from",
      "into",
      "about",
      "it",
      "its",
      "i",
      "you",
      "we",
      "they",
      "he",
      "she",
      "there",
      "here",
      "can",
      "could",
      "should",
      "would",
      "will",
      "shall",
      "may",
      "might",
      "must",
      "have",
      "has",
      "had",
      "not",
      "no",
      "yes",
      "so",
      "such",
      "only",
      "any",
      "some",
      "all",
      "get",
      "set",
      "use",
      "used",
      "using",
      "work",
      "works",
      "working",
      "handle",
      "handled",
      "happen",
      "happens",
      "default",
      "value",
      "values",
      "please",
      "explain",
      "tell",
      "me",
      "my",
      "our"
    ]);
  }
});
function patternToRegExpSource(pattern) {
  let re = "";
  for (let i2 = 0; i2 < pattern.length; i2++) {
    const c2 = pattern[i2];
    if (c2 === "\\" && i2 + 1 < pattern.length) {
      re += escapeRegExp(pattern[++i2]);
    } else if (c2 === "*") {
      if (pattern[i2 + 1] === "*") {
        const atStart = i2 === 0 || pattern[i2 - 1] === "/";
        let j = i2;
        while (pattern[j + 1] === "*") j++;
        const next = pattern[j + 1];
        if (atStart && next === "/") {
          i2 = j + 1;
          re += "(?:[^/]+/)*";
        } else if (atStart && next === void 0) {
          i2 = j;
          re += ".*";
        } else {
          i2 = j;
          re += "[^/]*";
        }
      } else {
        re += "[^/]*";
      }
    } else if (c2 === "?") {
      re += "[^/]";
    } else if (c2 === "[") {
      let j = i2 + 1;
      let body2 = "";
      if (pattern[j] === "!") {
        body2 += "^";
        j++;
      }
      if (pattern[j] === "]") {
        body2 += "\\]";
        j++;
      }
      while (j < pattern.length && pattern[j] !== "]") {
        const ch = pattern[j];
        body2 += ch === "\\" || ch === "^" ? "\\" + ch : ch;
        j++;
      }
      if (j < pattern.length && body2 !== "" && body2 !== "^") {
        re += `[${body2}]`;
        i2 = j;
      } else {
        re += "\\[";
      }
    } else {
      re += escapeRegExp(c2);
    }
  }
  return re;
}
function parseGitignore(content, baseRel) {
  const rules = [];
  const prefix = baseRel ? escapeRegExp(baseRel) + "/" : "";
  for (const rawLine of content.split(/\r?\n/)) {
    let line2 = rawLine.replace(/(?<!\\) +$/, "");
    if (!line2 || line2.startsWith("#")) continue;
    let negated = false;
    if (line2.startsWith("!")) {
      negated = true;
      line2 = line2.slice(1);
    }
    let dirOnly = false;
    if (line2.endsWith("/")) {
      dirOnly = true;
      line2 = line2.slice(0, -1);
    }
    if (!line2) continue;
    const anchored = line2.includes("/");
    if (line2.startsWith("/")) line2 = line2.slice(1);
    const body2 = patternToRegExpSource(line2);
    const source = anchored ? `^${prefix}${body2}$` : `^${prefix}(?:[^/]+/)*${body2}$`;
    try {
      rules.push({ re: new RegExp(source), negated, dirOnly });
    } catch {
    }
  }
  return rules;
}
function isIgnored(rules, rel, isDir) {
  let ignored = false;
  for (const rule of rules) {
    if (rule.dirOnly && !isDir) continue;
    if (rule.re.test(rel)) ignored = !rule.negated;
  }
  return ignored;
}
var init_ignore = __esm({
  "src/ignore.ts"() {
    "use strict";
    init_util();
  }
});
function walk(root, opts = {}) {
  const maxFileBytes = opts.maxFileBytes ?? 1024 * 1024;
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;
  const useGitignore = opts.gitignore !== false;
  const out2 = [];
  let capped = false;
  let rootReal;
  try {
    rootReal = realpathSync(root);
  } catch {
    return { files: out2, capped };
  }
  const contained = (real) => real === rootReal || real.startsWith(rootReal + sep);
  const stack = [
    { dir: root, rel: "", rules: [] }
  ];
  const seenDirs = /* @__PURE__ */ new Set();
  walking: while (stack.length) {
    const frame = stack.pop();
    let real;
    try {
      real = realpathSync(frame.dir);
    } catch {
      continue;
    }
    if (seenDirs.has(real)) continue;
    seenDirs.add(real);
    if (!contained(real)) continue;
    let entries;
    try {
      entries = readdirSync2(frame.dir).sort();
    } catch {
      continue;
    }
    let rules = frame.rules;
    if (useGitignore && entries.includes(".gitignore")) {
      const parsed = parseGitignore(readText(join4(frame.dir, ".gitignore")), frame.rel);
      if (parsed.length) rules = [...rules, ...parsed];
    }
    for (const name2 of entries) {
      const abs = join4(frame.dir, name2);
      const rel = frame.rel ? `${frame.rel}/${name2}` : name2;
      let st;
      let isLink;
      try {
        st = statSync2(abs);
        isLink = lstatSync(abs).isSymbolicLink();
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (IGNORE_DIRS.has(name2)) continue;
        if (isLink) continue;
        if (useGitignore && rules.length && isIgnored(rules, rel, true)) continue;
        stack.push({ dir: abs, rel, rules });
        continue;
      }
      if (!st.isFile()) continue;
      if (st.size > maxFileBytes) continue;
      if (LOCKFILES.has(name2.toLowerCase())) continue;
      const ext = extname(name2).toLowerCase();
      if (BINARY_EXT.has(ext)) continue;
      if (name2.endsWith(".min.js") || name2.endsWith(".min.css")) continue;
      if (useGitignore && rules.length && isIgnored(rules, rel, false)) continue;
      if (isLink) {
        try {
          if (!contained(realpathSync(abs))) continue;
        } catch {
          continue;
        }
      }
      if (out2.length >= maxFiles) {
        capped = true;
        break walking;
      }
      out2.push({ rel: rel.split(sep).join("/"), abs, size: st.size, ext, mtimeMs: st.mtimeMs });
    }
  }
  return { files: out2, capped };
}
function readText(abs) {
  try {
    const buf = readFileSync3(abs);
    if (buf.length >= 2 && buf[0] === 255 && buf[1] === 254) {
      return buf.subarray(2, 2 + (buf.length - 2 & ~1)).toString("utf16le");
    }
    if (buf.length >= 2 && buf[0] === 254 && buf[1] === 255) {
      const swapped = Buffer.from(buf.subarray(2, 2 + (buf.length - 2 & ~1)));
      swapped.swap16();
      return swapped.toString("utf16le");
    }
    if (buf.length >= 3 && buf[0] === 239 && buf[1] === 187 && buf[2] === 191) return buf.subarray(3).toString("utf8");
    if (buf.includes(0)) return "";
    const text = buf.toString("utf8");
    return text.includes("\uFFFD") ? buf.toString("latin1") : text;
  } catch {
    return "";
  }
}
var IGNORE_DIRS;
var LOCKFILES;
var BINARY_EXT;
var DEFAULT_MAX_FILES;
var init_walk = __esm({
  "src/walk.ts"() {
    "use strict";
    init_ignore();
    IGNORE_DIRS = /* @__PURE__ */ new Set([
      ".git",
      "node_modules",
      ".pnpm",
      "bower_components",
      "vendor",
      "dist",
      "build",
      "out",
      "target",
      ".next",
      ".nuxt",
      ".svelte-kit",
      ".turbo",
      "coverage",
      "__pycache__",
      ".venv",
      "venv",
      ".tox",
      ".mypy_cache",
      ".pytest_cache",
      ".gradle",
      ".idea",
      ".vscode",
      ".cache",
      "tmp",
      ".ultraindex",
      "Pods",
      "DerivedData",
      ".terraform",
      "elm-stuff",
      ".dart_tool"
    ]);
    LOCKFILES = /* @__PURE__ */ new Set([
      "package-lock.json",
      "npm-shrinkwrap.json",
      "yarn.lock",
      "pnpm-lock.yaml",
      "bun.lockb",
      "composer.lock",
      "cargo.lock",
      "poetry.lock",
      "pipfile.lock",
      "gemfile.lock",
      "go.sum",
      "flake.lock",
      "packages.lock.json",
      "podfile.lock",
      "mix.lock"
    ]);
    BINARY_EXT = /* @__PURE__ */ new Set([
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".webp",
      ".bmp",
      ".ico",
      ".icns",
      ".svg",
      ".pdf",
      ".zip",
      ".gz",
      ".tar",
      ".tgz",
      ".bz2",
      ".xz",
      ".7z",
      ".rar",
      ".jar",
      ".war",
      ".class",
      ".so",
      ".dylib",
      ".dll",
      ".exe",
      ".bin",
      ".o",
      ".a",
      ".wasm",
      ".woff",
      ".woff2",
      ".ttf",
      ".otf",
      ".eot",
      ".mp3",
      ".mp4",
      ".mov",
      ".avi",
      ".webm",
      ".wav",
      ".flac",
      ".ogg",
      ".lock",
      ".min.js",
      ".map"
    ]);
    DEFAULT_MAX_FILES = 2e4;
  }
});
function headCommit(dir) {
  const res = sh2("git", ["-C", dir, "rev-parse", "--short", "HEAD"]);
  return res.ok ? res.stdout.trim() : void 0;
}
function isGitWorktree(dir) {
  return sh2("git", ["-C", dir, "rev-parse", "--is-inside-work-tree"]).ok;
}
function resolveBaseRef(dir, base) {
  const verify = (ref) => sh2("git", [...gitArgs(dir), "rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).ok;
  const mergeBase = (ref) => {
    const mb = sh2("git", [...gitArgs(dir), "merge-base", ref, "HEAD"]);
    return mb.ok ? mb.stdout.trim() : void 0;
  };
  if (base) {
    if (!verify(base)) return { error: `base ref "${base}" not found (tried git rev-parse --verify)` };
    const mb = mergeBase(base);
    if (!mb) return { error: `no merge-base between "${base}" and HEAD` };
    return { ref: base, mergeBase: mb };
  }
  const originHead = sh2("git", [...gitArgs(dir), "symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]);
  const candidates = [
    ...originHead.ok ? [originHead.stdout.trim().replace("refs/remotes/", "")] : [],
    "origin/main",
    "origin/master",
    "main",
    "master"
  ];
  for (const c2 of candidates) {
    if (!verify(c2)) continue;
    const mb = mergeBase(c2);
    if (mb) return { ref: c2, mergeBase: mb };
  }
  const head = sh2("git", [...gitArgs(dir), "rev-parse", "HEAD"]);
  if (!head.ok) return { error: "cannot resolve HEAD \u2014 empty repository?" };
  return {
    ref: "HEAD",
    mergeBase: head.stdout.trim(),
    note: "base: HEAD (no default branch found \u2014 reviewing uncommitted work)"
  };
}
function diffFiles(dir, spec) {
  const out2 = [];
  const ns = sh2("git", [...gitArgs(dir), "diff", "-z", "-M", "--name-status", ...rangeArgs(spec)]);
  if (ns.ok) {
    const toks = ns.stdout.split("\0");
    let i2 = 0;
    while (i2 < toks.length) {
      const st = toks[i2++];
      if (!st) break;
      const code = st[0];
      if (code === "R" || code === "C") {
        const oldPath = toks[i2++];
        const path = toks[i2++];
        if (path) out2.push({ path, status: "renamed", oldPath });
      } else {
        const path = toks[i2++];
        if (!path) break;
        const status = code === "A" ? "added" : code === "D" ? "deleted" : "modified";
        out2.push({ path, status });
      }
    }
  }
  const byPath = new Map(out2.map((f) => [f.path, f]));
  const num = sh2("git", [...gitArgs(dir), "diff", "-z", "-M", "--numstat", ...rangeArgs(spec)]);
  if (num.ok) {
    const toks = num.stdout.split("\0");
    let i2 = 0;
    while (i2 < toks.length) {
      const head = toks[i2++];
      if (!head) break;
      const m = head.match(/^(-|\d+)\t(-|\d+)\t([\s\S]*)$/);
      if (!m) continue;
      let path = m[3];
      if (path === "") {
        i2++;
        path = toks[i2++] ?? "";
      }
      const rec = byPath.get(path);
      if (!rec) continue;
      if (m[1] === "-") rec.binary = true;
      else {
        rec.linesAdded = Number(m[1]);
        rec.linesDeleted = Number(m[2]);
      }
    }
  }
  return out2;
}
function diffHunks(dir, spec) {
  const map = /* @__PURE__ */ new Map();
  const res = sh2("git", [...gitArgs(dir), "diff", "-M", "--unified=0", ...rangeArgs(spec)]);
  if (!res.ok) return map;
  let current;
  for (const line2 of res.stdout.split("\n")) {
    if (line2.startsWith("+++ ")) {
      const p = line2.slice(4).trim();
      if (p === "/dev/null") {
        current = void 0;
        continue;
      }
      const path = p.startsWith("b/") ? p.slice(2) : p;
      current = map.get(path) ?? [];
      map.set(path, current);
    } else if (current && line2.startsWith("@@")) {
      const m = line2.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
      if (!m) continue;
      const start2 = Number(m[1]);
      const count = m[2] === void 0 ? 1 : Number(m[2]);
      if (count === 0) current.push({ start: Math.max(start2, 1), end: Math.max(start2, 1), approx: true });
      else current.push({ start: start2, end: start2 + count - 1 });
    }
  }
  return map;
}
function untrackedFiles(dir) {
  const res = sh2("git", [...gitArgs(dir), "ls-files", "--others", "--exclude-standard", "-z"]);
  if (!res.ok) return [];
  return res.stdout.split("\0").filter((p) => p.length > 0);
}
function gitChurn(dir, opts = {}) {
  const churn = /* @__PURE__ */ new Map();
  const range = opts.since ? [`${opts.since}..HEAD`] : [];
  const res = sh2("git", [...gitArgs(dir), "log", ...range, "--pretty=format:", "--name-only", "-z"]);
  if (!res.ok) return { churn, ok: false };
  for (const tok of res.stdout.split("\0")) {
    const f = tok.replace(/^\n+/, "").trim();
    if (f) churn.set(f, (churn.get(f) ?? 0) + 1);
  }
  return { churn, ok: true };
}
function changedSince(dir, ref) {
  const out2 = /* @__PURE__ */ new Set();
  const diff = sh2("git", [...gitArgs(dir), "diff", "-z", "--name-only", ref, "--"]);
  if (diff.ok) {
    for (const p of diff.stdout.split("\0")) if (p) out2.add(p);
  }
  for (const p of untrackedFiles(dir)) out2.add(p);
  return out2;
}
var gitArgs;
var rangeArgs;
var init_git = __esm({
  "src/git.ts"() {
    "use strict";
    init_util();
    gitArgs = (dir) => ["-C", dir, "-c", "core.quotePath=false"];
    rangeArgs = (spec) => spec.staged ? ["--cached"] : [spec.mergeBase];
  }
});
function sha1(s) {
  return createHash("sha1").update(s).digest("hex");
}
function shortHash(s, n = 8) {
  return sha1(s).slice(0, n);
}
var init_hash = __esm({
  "src/hash.ts"() {
    "use strict";
  }
});
function scan(rel, content, lang, rules) {
  const out2 = [];
  const lines = content.split(/\r?\n/);
  for (let i2 = 0; i2 < lines.length; i2++) {
    const line2 = lines[i2];
    if (!line2.trim()) continue;
    for (const rule of rules) {
      const m = rule.re.exec(line2);
      if (!m) continue;
      const name2 = m.groups?.name ?? m[1];
      if (!name2) continue;
      const exported = typeof rule.exported === "function" ? rule.exported(m, line2) : rule.exported ?? false;
      out2.push({
        name: name2,
        kind: rule.kind,
        file: rel,
        line: i2 + 1,
        signature: line2.trim().slice(0, 200),
        exported,
        lang
      });
      break;
    }
  }
  return out2;
}
function extToLang(ext) {
  return EXT_LANG[ext] ?? "other";
}
var EXT_LANG;
var init_common = __esm({
  "src/lang/common.ts"() {
    "use strict";
    EXT_LANG = {
      ".ts": "typescript",
      ".tsx": "typescript",
      ".mts": "typescript",
      ".cts": "typescript",
      ".js": "javascript",
      ".jsx": "javascript",
      ".mjs": "javascript",
      ".cjs": "javascript",
      ".py": "python",
      ".pyi": "python",
      ".go": "go",
      ".rb": "ruby",
      ".rake": "ruby",
      ".java": "java",
      ".rs": "rust",
      ".c": "c",
      ".h": "c",
      ".cc": "cpp",
      ".cpp": "cpp",
      ".cxx": "cpp",
      ".hpp": "cpp",
      ".cs": "csharp",
      ".php": "php",
      ".swift": "swift",
      ".kt": "kotlin",
      ".kts": "kotlin",
      ".scala": "scala",
      ".sc": "scala",
      ".clj": "clojure",
      ".ex": "elixir",
      ".exs": "elixir",
      ".erl": "erlang",
      ".hs": "haskell",
      ".dart": "dart",
      ".lua": "lua",
      ".sh": "shell",
      ".bash": "shell",
      ".zsh": "shell",
      ".ksh": "shell",
      ".fish": "shell",
      ".hh": "cpp",
      ".m": "objective-c",
      ".mm": "objective-c",
      ".sql": "sql",
      ".graphql": "graphql",
      ".gql": "graphql",
      ".proto": "protobuf",
      ".md": "markdown",
      ".mdx": "markdown",
      ".rst": "restructuredtext",
      ".txt": "text",
      ".json": "json",
      ".yaml": "yaml",
      ".yml": "yaml",
      ".toml": "toml",
      ".ini": "ini",
      ".html": "html",
      ".css": "css",
      ".scss": "scss",
      ".vue": "vue",
      ".svelte": "svelte"
    };
  }
});
var RULES;
var jsTs;
var init_js_ts = __esm({
  "src/lang/js-ts.ts"() {
    "use strict";
    init_common();
    RULES = [
      { re: /^\s*export\s+(?:async\s+)?function\s+(?<name>[\w$]+)/, kind: "function", exported: true },
      { re: /^\s*export\s+default\s+(?:async\s+)?function\s+(?<name>[\w$]+)/, kind: "function", exported: true },
      { re: /^\s*export\s+default\s+(?:abstract\s+)?class\s+(?<name>[\w$]+)/, kind: "class", exported: true },
      { re: /^\s*(?:async\s+)?function\s+(?<name>[\w$]+)/, kind: "function", exported: false },
      { re: /^\s*export\s+(?:abstract\s+)?class\s+(?<name>[\w$]+)/, kind: "class", exported: true },
      { re: /^\s*(?:abstract\s+)?class\s+(?<name>[\w$]+)/, kind: "class", exported: false },
      { re: /^\s*export\s+interface\s+(?<name>[\w$]+)/, kind: "interface", exported: true },
      { re: /^\s*interface\s+(?<name>[\w$]+)/, kind: "interface", exported: false },
      { re: /^\s*export\s+type\s+(?<name>[\w$]+)/, kind: "type", exported: true },
      { re: /^\s*type\s+(?<name>[\w$]+)\s*[=<]/, kind: "type", exported: false },
      { re: /^\s*export\s+enum\s+(?<name>[\w$]+)/, kind: "enum", exported: true },
      { re: /^\s*export\s+const\s+enum\s+(?<name>[\w$]+)/, kind: "enum", exported: true },
      // exported const/let bound to an arrow fn or value
      { re: /^\s*export\s+(?:const|let|var)\s+(?<name>[\w$]+)\s*[:=]/, kind: "const", exported: true },
      // top-level const arrow function (not exported)
      { re: /^\s*(?:const|let)\s+(?<name>[\w$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]+)?=>/, kind: "const", exported: false },
      // `export default Foo;` — a class/const declared above and exported by reference.
      { re: /^\s*export\s+default\s+(?<name>[A-Za-z_$][\w$]*)\s*;?\s*$/, kind: "default", exported: true }
    ];
    jsTs = {
      lang: "javascript/typescript",
      exts: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"],
      extract(rel, content) {
        const lang = rel.match(/\.(ts|tsx|mts|cts)$/) ? "typescript" : "javascript";
        return scan(rel, content, lang, RULES);
      }
    };
  }
});
var pub;
var RULES2;
var python;
var init_python = __esm({
  "src/lang/python.ts"() {
    "use strict";
    init_common();
    pub = (name2) => !name2.startsWith("_") || name2.startsWith("__");
    RULES2 = [
      { re: /^(?:async\s+)?def\s+(?<name>[\w]+)\s*\(/, kind: "function", exported: (m) => pub(m.groups.name) },
      { re: /^\s+(?:async\s+)?def\s+(?<name>[\w]+)\s*\(/, kind: "method", exported: (m) => pub(m.groups.name) },
      { re: /^class\s+(?<name>[\w]+)/, kind: "class", exported: (m) => pub(m.groups.name) },
      { re: /^\s+class\s+(?<name>[\w]+)/, kind: "class", exported: (m) => pub(m.groups.name) }
    ];
    python = {
      lang: "python",
      exts: [".py", ".pyi"],
      extract(rel, content) {
        return scan(rel, content, "python", RULES2);
      }
    };
  }
});
var upper;
var RULES3;
var go;
var init_go = __esm({
  "src/lang/go.ts"() {
    "use strict";
    init_common();
    upper = (name2) => /^[A-Z]/.test(name2);
    RULES3 = [
      { re: /^func\s+\([^)]*\)\s+(?<name>[\w]+)\s*\(/, kind: "method", exported: (m) => upper(m.groups.name) },
      { re: /^func\s+(?<name>[\w]+)\s*\(/, kind: "function", exported: (m) => upper(m.groups.name) },
      { re: /^type\s+(?<name>[\w]+)\s+struct\b/, kind: "struct", exported: (m) => upper(m.groups.name) },
      { re: /^type\s+(?<name>[\w]+)\s+interface\b/, kind: "interface", exported: (m) => upper(m.groups.name) },
      { re: /^type\s+(?<name>[\w]+)\s+/, kind: "type", exported: (m) => upper(m.groups.name) }
    ];
    go = {
      lang: "go",
      exts: [".go"],
      extract(rel, content) {
        return scan(rel, content, "go", RULES3);
      }
    };
  }
});
var RULES4;
var ruby;
var init_ruby = __esm({
  "src/lang/ruby.ts"() {
    "use strict";
    init_common();
    RULES4 = [
      { re: /^\s*def\s+(?:self\.)?(?<name>[\w?!=]+)/, kind: "method", exported: true },
      { re: /^\s*class\s+(?<name>[\w:]+)/, kind: "class", exported: true },
      { re: /^\s*module\s+(?<name>[\w:]+)/, kind: "module", exported: true }
    ];
    ruby = {
      lang: "ruby",
      exts: [".rb", ".rake"],
      extract(rel, content) {
        return scan(rel, content, "ruby", RULES4);
      }
    };
  }
});
var RULES5;
var java;
var init_java = __esm({
  "src/lang/java.ts"() {
    "use strict";
    init_common();
    RULES5 = [
      { re: /^\s*(?:public|protected|private)?\s*(?:abstract\s+|final\s+)?class\s+(?<name>[\w]+)/, kind: "class", exported: (_m, l) => /\bpublic\b/.test(l) },
      { re: /^\s*(?:public|protected|private)?\s*interface\s+(?<name>[\w]+)/, kind: "interface", exported: (_m, l) => /\bpublic\b/.test(l) },
      { re: /^\s*(?:public|protected|private)?\s*enum\s+(?<name>[\w]+)/, kind: "enum", exported: (_m, l) => /\bpublic\b/.test(l) },
      { re: /^\s*(?:public|protected|private)\s+(?:static\s+|final\s+|abstract\s+|synchronized\s+)*[\w<>\[\],.?\s]+\s+(?<name>[\w]+)\s*\(/, kind: "method", exported: (_m, l) => /\bpublic\b/.test(l) }
    ];
    java = {
      lang: "java",
      exts: [".java"],
      extract(rel, content) {
        return scan(rel, content, "java", RULES5);
      }
    };
  }
});
var isPub;
var RULES6;
var rust;
var init_rust = __esm({
  "src/lang/rust.ts"() {
    "use strict";
    init_common();
    isPub = (_m, l) => /^\s*pub\b/.test(l);
    RULES6 = [
      { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+(?<name>[\w]+)/, kind: "function", exported: isPub },
      { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?struct\s+(?<name>[\w]+)/, kind: "struct", exported: isPub },
      { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?enum\s+(?<name>[\w]+)/, kind: "enum", exported: isPub },
      { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?trait\s+(?<name>[\w]+)/, kind: "trait", exported: isPub },
      { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?type\s+(?<name>[\w]+)/, kind: "type", exported: isPub }
    ];
    rust = {
      lang: "rust",
      exts: [".rs"],
      extract(rel, content) {
        return scan(rel, content, "rust", RULES6);
      }
    };
  }
});
var pub2;
var RULES7;
var csharp;
var init_csharp = __esm({
  "src/lang/csharp.ts"() {
    "use strict";
    init_common();
    pub2 = (_m, l) => /\b(public|internal)\b/.test(l);
    RULES7 = [
      { re: /^\s*(?:public|internal|protected|private)?\s*(?:static\s+|sealed\s+|abstract\s+|partial\s+)*(?:class|record)\s+(?<name>\w+)/, kind: "class", exported: pub2 },
      { re: /^\s*(?:public|internal|protected|private)?\s*(?:partial\s+)?interface\s+(?<name>\w+)/, kind: "interface", exported: pub2 },
      { re: /^\s*(?:public|internal|protected|private)?\s*(?:readonly\s+)?(?:ref\s+)?struct\s+(?<name>\w+)/, kind: "struct", exported: pub2 },
      { re: /^\s*(?:public|internal|protected|private)?\s*enum\s+(?<name>\w+)/, kind: "enum", exported: pub2 },
      // method: a visibility modifier, a return type, then `name(`
      { re: /^\s*(?:public|internal|protected|private)\s+(?:static\s+|virtual\s+|override\s+|async\s+|sealed\s+|abstract\s+|new\s+)*[\w<>\[\],.?]+\s+(?<name>\w+)\s*(?:<[^>]*>)?\s*\(/, kind: "method", exported: pub2 }
    ];
    csharp = {
      lang: "csharp",
      exts: [".cs"],
      extract(rel, content) {
        return scan(rel, content, "csharp", RULES7);
      }
    };
  }
});
var RULES8;
var php;
var init_php = __esm({
  "src/lang/php.ts"() {
    "use strict";
    init_common();
    RULES8 = [
      { re: /^\s*(?:abstract\s+|final\s+)*class\s+(?<name>\w+)/, kind: "class", exported: true },
      { re: /^\s*interface\s+(?<name>\w+)/, kind: "interface", exported: true },
      { re: /^\s*trait\s+(?<name>\w+)/, kind: "trait", exported: true },
      { re: /^\s*enum\s+(?<name>\w+)/, kind: "enum", exported: true },
      {
        re: /^\s*(?:public\s+|protected\s+|private\s+|static\s+|abstract\s+|final\s+)*function\s+(?<name>\w+)\s*\(/,
        kind: "function",
        exported: (_m, l) => !/\b(private|protected)\b/.test(l)
      }
    ];
    php = {
      lang: "php",
      exts: [".php"],
      extract(rel, content) {
        return scan(rel, content, "php", RULES8);
      }
    };
  }
});
var vis;
var MODS;
var RULES9;
var swift;
var init_swift = __esm({
  "src/lang/swift.ts"() {
    "use strict";
    init_common();
    vis = (_m, l) => !/\b(private|fileprivate)\b/.test(l);
    MODS = "(?:public\\s+|open\\s+|internal\\s+|private\\s+|fileprivate\\s+)?(?:final\\s+)?";
    RULES9 = [
      { re: new RegExp(`^\\s*${MODS}class\\s+(?<name>\\w+)`), kind: "class", exported: vis },
      { re: new RegExp(`^\\s*${MODS}struct\\s+(?<name>\\w+)`), kind: "struct", exported: vis },
      { re: new RegExp(`^\\s*${MODS}enum\\s+(?<name>\\w+)`), kind: "enum", exported: vis },
      { re: new RegExp(`^\\s*${MODS}protocol\\s+(?<name>\\w+)`), kind: "protocol", exported: vis },
      { re: /^\s*(?:public\s+|open\s+|internal\s+|private\s+|fileprivate\s+)?(?:static\s+|class\s+|final\s+|override\s+|mutating\s+|@\w+\s+)*func\s+(?<name>\w+)/, kind: "function", exported: vis }
    ];
    swift = {
      lang: "swift",
      exts: [".swift"],
      extract(rel, content) {
        return scan(rel, content, "swift", RULES9);
      }
    };
  }
});
var vis2;
var RULES10;
var kotlin;
var init_kotlin = __esm({
  "src/lang/kotlin.ts"() {
    "use strict";
    init_common();
    vis2 = (_m, l) => !/\b(private|internal)\b/.test(l);
    RULES10 = [
      { re: /^\s*(?:public\s+|internal\s+|private\s+|abstract\s+|sealed\s+|open\s+|final\s+|data\s+)*class\s+(?<name>\w+)/, kind: "class", exported: vis2 },
      { re: /^\s*(?:public\s+|internal\s+|private\s+|fun\s+)?interface\s+(?<name>\w+)/, kind: "interface", exported: vis2 },
      { re: /^\s*(?:public\s+|internal\s+|private\s+|companion\s+)?object\s+(?<name>\w+)/, kind: "object", exported: vis2 },
      { re: /^\s*(?:public\s+|internal\s+|private\s+|protected\s+|override\s+|open\s+|abstract\s+|suspend\s+|inline\s+|operator\s+)*fun\s+(?:<[^>]*>\s+)?(?<name>\w+)\s*\(/, kind: "function", exported: vis2 }
    ];
    kotlin = {
      lang: "kotlin",
      exts: [".kt", ".kts"],
      extract(rel, content) {
        return scan(rel, content, "kotlin", RULES10);
      }
    };
  }
});
var NOT_KEYWORD;
var RULES11;
var c;
var init_c = __esm({
  "src/lang/c.ts"() {
    "use strict";
    init_common();
    NOT_KEYWORD = "(?!\\s*(?:if|for|while|switch|return|else|do|sizeof|typedef)\\b)";
    RULES11 = [
      // C++ types
      { re: /^\s*(?:class|struct)\s+(?<name>[A-Za-z_]\w+)\s*(?:[:{]|$)/, kind: "class", exported: true },
      { re: /^\s*namespace\s+(?<name>[A-Za-z_]\w+)/, kind: "namespace", exported: true },
      // typedef struct/enum/union NAME {
      { re: /^\s*(?:typedef\s+)?(?:struct|enum|union)\s+(?<name>[A-Za-z_]\w+)\s*\{/, kind: "struct", exported: true },
      // function definition: <type ...> name(<args>) [const] {?  at column 0-ish
      { re: new RegExp(`^${NOT_KEYWORD}[A-Za-z_][\\w\\s\\*&<>:,]*?\\b(?<name>[A-Za-z_]\\w+)\\s*\\([^;{]*\\)\\s*(?:const)?\\s*\\{?\\s*$`), kind: "function", exported: true }
    ];
    c = {
      lang: "c/cpp",
      exts: [".c", ".h", ".cc", ".cpp", ".cxx", ".hpp", ".hh"],
      extract(rel, content) {
        return scan(rel, content, rel.match(/\.(c|h)$/) ? "c" : "cpp", RULES11);
      }
    };
  }
});
var RULES12;
var lua;
var init_lua = __esm({
  "src/lang/lua.ts"() {
    "use strict";
    init_common();
    RULES12 = [
      { re: /^\s*local\s+function\s+(?<name>[\w.:]+)\s*\(/, kind: "function", exported: false },
      { re: /^\s*function\s+(?<name>[\w.:]+)\s*\(/, kind: "function", exported: true },
      { re: /^\s*(?:local\s+)?(?<name>[\w.]+)\s*=\s*function\s*\(/, kind: "function", exported: true }
    ];
    lua = {
      lang: "lua",
      exts: [".lua"],
      extract(rel, content) {
        return scan(rel, content, "lua", RULES12);
      }
    };
  }
});
var RULES13;
var shell;
var init_shell = __esm({
  "src/lang/shell.ts"() {
    "use strict";
    init_common();
    RULES13 = [
      { re: /^\s*function\s+(?<name>[\w:-]+)\s*(?:\(\))?\s*\{?/, kind: "function", exported: true },
      { re: /^\s*(?<name>[A-Za-z_][\w:-]*)\s*\(\)\s*\{?/, kind: "function", exported: true }
    ];
    shell = {
      lang: "shell",
      exts: [".sh", ".bash", ".zsh", ".ksh"],
      extract(rel, content) {
        return scan(rel, content, "shell", RULES13);
      }
    };
  }
});
var RULES14;
var elixir;
var init_elixir = __esm({
  "src/lang/elixir.ts"() {
    "use strict";
    init_common();
    RULES14 = [
      { re: /^\s*defmodule\s+(?<name>[\w.]+)/, kind: "module", exported: true },
      { re: /^\s*defp\s+(?<name>[\w?!]+)/, kind: "function", exported: false },
      { re: /^\s*def\s+(?<name>[\w?!]+)/, kind: "function", exported: true },
      { re: /^\s*defmacrop?\s+(?<name>[\w?!]+)/, kind: "macro", exported: true }
    ];
    elixir = {
      lang: "elixir",
      exts: [".ex", ".exs"],
      extract(rel, content) {
        return scan(rel, content, "elixir", RULES14);
      }
    };
  }
});
var RULES15;
var scala;
var init_scala = __esm({
  "src/lang/scala.ts"() {
    "use strict";
    init_common();
    RULES15 = [
      { re: /^\s*(?:final\s+|sealed\s+|abstract\s+|implicit\s+)*(?:case\s+)?class\s+(?<name>\w+)/, kind: "class", exported: true },
      { re: /^\s*(?:sealed\s+)?trait\s+(?<name>\w+)/, kind: "trait", exported: true },
      { re: /^\s*(?:case\s+)?object\s+(?<name>\w+)/, kind: "object", exported: true },
      { re: /^\s*(?:override\s+|final\s+|private\s+|protected\s+|implicit\s+)*def\s+(?<name>\w+)/, kind: "def", exported: (_m, l) => !/\b(private|protected)\b/.test(l) }
    ];
    scala = {
      lang: "scala",
      exts: [".scala", ".sc"],
      extract(rel, content) {
        return scan(rel, content, "scala", RULES15);
      }
    };
  }
});
function extractSymbols(rel, ext, content) {
  const extractor = BY_EXT.get(ext);
  if (!extractor) return [];
  try {
    return extractor.extract(rel, content);
  } catch {
    return [];
  }
}
function languageOf(ext) {
  return BY_EXT.get(ext)?.lang ?? extToLang(ext);
}
var EXTRACTORS;
var BY_EXT;
var init_registry = __esm({
  "src/lang/registry.ts"() {
    "use strict";
    init_common();
    init_js_ts();
    init_python();
    init_go();
    init_ruby();
    init_java();
    init_rust();
    init_csharp();
    init_php();
    init_swift();
    init_kotlin();
    init_c();
    init_lua();
    init_shell();
    init_elixir();
    init_scala();
    EXTRACTORS = [
      jsTs,
      python,
      go,
      ruby,
      java,
      rust,
      csharp,
      php,
      swift,
      kotlin,
      c,
      lua,
      shell,
      elixir,
      scala
    ];
    BY_EXT = /* @__PURE__ */ new Map();
    for (const e of EXTRACTORS) for (const ext of e.exts) BY_EXT.set(ext, e);
  }
});
function isDoc(rel, ext) {
  const base = rel.split("/").pop().toLowerCase();
  return DOC_EXT.has(ext) || DOC_BASENAME.test(base) || DOC_DIR.test(rel);
}
function isConfig(rel, ext) {
  const base = rel.split("/").pop().toLowerCase();
  return CONFIG_BASENAME.has(base) || CONFIG_EXT.has(ext);
}
function isCode(ext) {
  return !NON_CODE_LANGS.has(languageOf(ext));
}
function classify(rel, ext) {
  if (isCode(ext)) return "code";
  if (isDoc(rel, ext)) return "doc";
  if (isConfig(rel, ext)) return "config";
  return "other";
}
var DOC_BASENAME;
var DOC_EXT;
var DOC_DIR;
var CONFIG_BASENAME;
var CONFIG_EXT;
var MARKDOWN_EXT;
var NON_CODE_LANGS;
var init_classify = __esm({
  "src/classify.ts"() {
    "use strict";
    init_registry();
    DOC_BASENAME = /^(readme|changelog|contributing|history|news|authors|notice|security|code_of_conduct|faq|getting[-_]?started|usage|guide|tutorial)\b/i;
    DOC_EXT = /* @__PURE__ */ new Set([".md", ".mdx", ".rst", ".adoc", ".txt"]);
    DOC_DIR = /^(docs?|documentation|wiki|guides?|website|site|book)\//i;
    CONFIG_BASENAME = /* @__PURE__ */ new Set([
      "package.json",
      "pnpm-workspace.yaml",
      "tsconfig.json",
      "jsconfig.json",
      "pyproject.toml",
      "setup.py",
      "setup.cfg",
      "requirements.txt",
      "pipfile",
      "go.mod",
      "cargo.toml",
      "gemfile",
      "pom.xml",
      "build.gradle",
      "build.gradle.kts",
      "composer.json",
      "mix.exs",
      "pubspec.yaml",
      "build.sbt",
      "dockerfile",
      "docker-compose.yml",
      "docker-compose.yaml",
      "makefile",
      ".env.example",
      "manifest.json"
    ]);
    CONFIG_EXT = /* @__PURE__ */ new Set([".json", ".yaml", ".yml", ".toml", ".ini", ".cfg"]);
    MARKDOWN_EXT = /* @__PURE__ */ new Set([".md", ".mdx"]);
    NON_CODE_LANGS = /* @__PURE__ */ new Set([
      "markdown",
      "restructuredtext",
      "text",
      "json",
      "yaml",
      "toml",
      "ini",
      "other",
      "html",
      "css",
      "scss"
    ]);
  }
});
function globToRegExp(glob) {
  let re = "";
  for (let i2 = 0; i2 < glob.length; i2++) {
    const c2 = glob[i2];
    if (c2 === "*") {
      if (glob[i2 + 1] === "*") {
        i2++;
        if (glob[i2 + 1] === "/") {
          i2++;
          re += "(?:.*/)?";
        } else {
          re += ".*";
        }
      } else {
        re += "[^/]*";
      }
    } else if (c2 === "?") {
      re += "[^/]";
    } else {
      re += escapeRegExp(c2);
    }
  }
  return new RegExp(`^${re}$`);
}
function compileGlobs(globs) {
  if (!globs || globs.length === 0) return null;
  const res = globs.map(globToRegExp);
  return (rel) => res.some((r) => r.test(rel));
}
var init_glob = __esm({
  "src/glob.ts"() {
    "use strict";
    init_util();
  }
});
function byStr(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function byKey(keyOf2) {
  return (a, b) => byStr(keyOf2(a), keyOf2(b));
}
var init_sort = __esm({
  "src/sort.ts"() {
    "use strict";
  }
});
function stripFences(content) {
  const lines = content.split(/\r?\n/);
  const out2 = [];
  let fence = null;
  for (const line2 of lines) {
    const m = /^\s*(```+|~~~+)/.exec(line2);
    if (fence) {
      if (m && line2.trim().startsWith(fence[0][0].repeat(3).slice(0, 3))) fence = null;
      out2.push("");
      continue;
    }
    if (m) {
      fence = m[1];
      out2.push("");
      continue;
    }
    out2.push(line2);
  }
  return out2.join("\n");
}
function isExternalTarget(spec) {
  if (!spec) return true;
  if (spec.startsWith("#")) return true;
  if (spec.startsWith("//")) return true;
  return /^[a-z][a-z0-9+.-]*:/i.test(spec);
}
function cleanProse(line2) {
  return line2.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/`([^`]*)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[#>*_~-]+/g, " ").replace(/\s+/g, " ").trim();
}
function hasProse(s) {
  return /[A-Za-zÀ-ɏ]{3,}/.test(s);
}
function isBoilerplate(s) {
  return /^(all notable changes to this project|in the interest of fostering|this project adheres to|we as members and leaders|table of contents)\b/i.test(s);
}
function extractMarkdown(content) {
  let body2 = content;
  let frontTitle;
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(body2);
  if (fm) {
    const t = /(^|\n)title:\s*["']?(.+?)["']?\s*(\n|$)/i.exec(fm[1]);
    if (t) frontTitle = t[2].trim();
    body2 = body2.slice(fm[0].length);
  }
  const scan2 = stripFences(body2);
  const lines = scan2.split(/\r?\n/);
  const headings = [];
  let title = frontTitle;
  let summary;
  let summaryClosed = false;
  for (const line2 of lines) {
    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line2);
    if (h) {
      const text = cleanProse(h[2]);
      headings.push(text);
      if (!title && h[1].length === 1) title = text;
      if (!summary && h[1].length >= 2) summaryClosed = true;
      continue;
    }
    if (!summary && !summaryClosed) {
      const t = line2.trim();
      if (t && !/^([-*+]|\d+\.)\s/.test(t) && !t.startsWith("|") && !t.startsWith("<")) {
        const cleaned = cleanProse(t);
        if (cleaned.length >= 8 && hasProse(cleaned) && !cleaned.endsWith(":") && !isBoilerplate(cleaned)) {
          summary = cleaned.slice(0, 200);
        }
      }
    }
  }
  const refs = [];
  const seen = /* @__PURE__ */ new Set();
  const addRef = (raw) => {
    let spec = raw.trim();
    spec = spec.replace(/\s+["'(].*$/, "").trim();
    spec = spec.replace(/^<|>$/g, "");
    if (isExternalTarget(spec)) return;
    if (seen.has(spec)) return;
    seen.add(spec);
    refs.push({ kind: "doc-link", spec });
  };
  const inline = /!?\[[^\]]*\]\(([^)]+)\)/g;
  let m;
  while (m = inline.exec(scan2)) addRef(m[1]);
  const refdef = /^\s*\[[^\]]+\]:\s+(\S+)/gm;
  while (m = refdef.exec(scan2)) addRef(m[1]);
  return { title, summary, headings, refs };
}
var init_markdown = __esm({
  "src/extract/markdown.ts"() {
    "use strict";
  }
});
function assertInternal(x) {
  if (x !== INTERNAL) throw new Error("Illegal constructor");
}
function isPoint(point) {
  return !!point && typeof point.row === "number" && typeof point.column === "number";
}
function setModule(module2) {
  C = module2;
}
function getText(tree, startIndex, endIndex, startPosition) {
  const length = endIndex - startIndex;
  let result = tree.textCallback(startIndex, startPosition);
  if (result) {
    startIndex += result.length;
    while (startIndex < endIndex) {
      const string = tree.textCallback(startIndex, startPosition);
      if (string && string.length > 0) {
        startIndex += string.length;
        result += string;
      } else {
        break;
      }
    }
    if (startIndex > endIndex) {
      result = result.slice(0, length);
    }
  }
  return result ?? "";
}
function unmarshalCaptures(query2, tree, address, patternIndex, result) {
  for (let i2 = 0, n = result.length; i2 < n; i2++) {
    const captureIndex = C.getValue(address, "i32");
    address += SIZE_OF_INT;
    const node = unmarshalNode(tree, address);
    address += SIZE_OF_NODE;
    result[i2] = { patternIndex, name: query2.captureNames[captureIndex], node };
  }
  return address;
}
function marshalNode(node, index = 0) {
  let address = TRANSFER_BUFFER + index * SIZE_OF_NODE;
  C.setValue(address, node.id, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, node.startIndex, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, node.startPosition.row, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, node.startPosition.column, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, node[0], "i32");
}
function unmarshalNode(tree, address = TRANSFER_BUFFER) {
  const id = C.getValue(address, "i32");
  address += SIZE_OF_INT;
  if (id === 0) return null;
  const index = C.getValue(address, "i32");
  address += SIZE_OF_INT;
  const row = C.getValue(address, "i32");
  address += SIZE_OF_INT;
  const column = C.getValue(address, "i32");
  address += SIZE_OF_INT;
  const other = C.getValue(address, "i32");
  const result = new Node(INTERNAL, {
    id,
    tree,
    startIndex: index,
    startPosition: { row, column },
    other
  });
  return result;
}
function marshalTreeCursor(cursor, address = TRANSFER_BUFFER) {
  C.setValue(address + 0 * SIZE_OF_INT, cursor[0], "i32");
  C.setValue(address + 1 * SIZE_OF_INT, cursor[1], "i32");
  C.setValue(address + 2 * SIZE_OF_INT, cursor[2], "i32");
  C.setValue(address + 3 * SIZE_OF_INT, cursor[3], "i32");
}
function unmarshalTreeCursor(cursor) {
  cursor[0] = C.getValue(TRANSFER_BUFFER + 0 * SIZE_OF_INT, "i32");
  cursor[1] = C.getValue(TRANSFER_BUFFER + 1 * SIZE_OF_INT, "i32");
  cursor[2] = C.getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
  cursor[3] = C.getValue(TRANSFER_BUFFER + 3 * SIZE_OF_INT, "i32");
}
function marshalPoint(address, point) {
  C.setValue(address, point.row, "i32");
  C.setValue(address + SIZE_OF_INT, point.column, "i32");
}
function unmarshalPoint(address) {
  const result = {
    row: C.getValue(address, "i32") >>> 0,
    column: C.getValue(address + SIZE_OF_INT, "i32") >>> 0
  };
  return result;
}
function marshalRange(address, range) {
  marshalPoint(address, range.startPosition);
  address += SIZE_OF_POINT;
  marshalPoint(address, range.endPosition);
  address += SIZE_OF_POINT;
  C.setValue(address, range.startIndex, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, range.endIndex, "i32");
  address += SIZE_OF_INT;
}
function unmarshalRange(address) {
  const result = {};
  result.startPosition = unmarshalPoint(address);
  address += SIZE_OF_POINT;
  result.endPosition = unmarshalPoint(address);
  address += SIZE_OF_POINT;
  result.startIndex = C.getValue(address, "i32") >>> 0;
  address += SIZE_OF_INT;
  result.endIndex = C.getValue(address, "i32") >>> 0;
  return result;
}
function marshalEdit(edit, address = TRANSFER_BUFFER) {
  marshalPoint(address, edit.startPosition);
  address += SIZE_OF_POINT;
  marshalPoint(address, edit.oldEndPosition);
  address += SIZE_OF_POINT;
  marshalPoint(address, edit.newEndPosition);
  address += SIZE_OF_POINT;
  C.setValue(address, edit.startIndex, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, edit.oldEndIndex, "i32");
  address += SIZE_OF_INT;
  C.setValue(address, edit.newEndIndex, "i32");
  address += SIZE_OF_INT;
}
function unmarshalLanguageMetadata(address) {
  const major_version = C.getValue(address, "i32");
  const minor_version = C.getValue(address += SIZE_OF_INT, "i32");
  const patch_version = C.getValue(address += SIZE_OF_INT, "i32");
  return { major_version, minor_version, patch_version };
}
async function Module2(moduleArg = {}) {
  var moduleRtn;
  var Module = moduleArg;
  var ENVIRONMENT_IS_WEB = typeof window == "object";
  var ENVIRONMENT_IS_WORKER = typeof WorkerGlobalScope != "undefined";
  var ENVIRONMENT_IS_NODE = typeof process == "object" && process.versions?.node && process.type != "renderer";
  if (ENVIRONMENT_IS_NODE) {
    const { createRequire } = await import("module");
    var require = createRequire(import.meta.url);
  }
  Module.currentQueryProgressCallback = null;
  Module.currentProgressCallback = null;
  Module.currentLogCallback = null;
  Module.currentParseCallback = null;
  var arguments_ = [];
  var thisProgram = "./this.program";
  var quit_ = /* @__PURE__ */ __name((status, toThrow) => {
    throw toThrow;
  }, "quit_");
  var _scriptName = import.meta.url;
  var scriptDirectory = "";
  function locateFile(path) {
    if (Module["locateFile"]) {
      return Module["locateFile"](path, scriptDirectory);
    }
    return scriptDirectory + path;
  }
  __name(locateFile, "locateFile");
  var readAsync, readBinary;
  if (ENVIRONMENT_IS_NODE) {
    var fs = require("fs");
    if (_scriptName.startsWith("file:")) {
      scriptDirectory = require("path").dirname(require("url").fileURLToPath(_scriptName)) + "/";
    }
    readBinary = /* @__PURE__ */ __name((filename) => {
      filename = isFileURI(filename) ? new URL(filename) : filename;
      var ret = fs.readFileSync(filename);
      return ret;
    }, "readBinary");
    readAsync = /* @__PURE__ */ __name(async (filename, binary2 = true) => {
      filename = isFileURI(filename) ? new URL(filename) : filename;
      var ret = fs.readFileSync(filename, binary2 ? void 0 : "utf8");
      return ret;
    }, "readAsync");
    if (process.argv.length > 1) {
      thisProgram = process.argv[1].replace(/\\/g, "/");
    }
    arguments_ = process.argv.slice(2);
    quit_ = /* @__PURE__ */ __name((status, toThrow) => {
      process.exitCode = status;
      throw toThrow;
    }, "quit_");
  } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
    try {
      scriptDirectory = new URL(".", _scriptName).href;
    } catch {
    }
    {
      if (ENVIRONMENT_IS_WORKER) {
        readBinary = /* @__PURE__ */ __name((url) => {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", url, false);
          xhr.responseType = "arraybuffer";
          xhr.send(null);
          return new Uint8Array(
            /** @type{!ArrayBuffer} */
            xhr.response
          );
        }, "readBinary");
      }
      readAsync = /* @__PURE__ */ __name(async (url) => {
        if (isFileURI(url)) {
          return new Promise((resolve22, reject) => {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, true);
            xhr.responseType = "arraybuffer";
            xhr.onload = () => {
              if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
                resolve22(xhr.response);
                return;
              }
              reject(xhr.status);
            };
            xhr.onerror = reject;
            xhr.send(null);
          });
        }
        var response = await fetch(url, {
          credentials: "same-origin"
        });
        if (response.ok) {
          return response.arrayBuffer();
        }
        throw new Error(response.status + " : " + response.url);
      }, "readAsync");
    }
  } else {
  }
  var out = console.log.bind(console);
  var err = console.error.bind(console);
  var dynamicLibraries = [];
  var wasmBinary;
  var ABORT = false;
  var EXITSTATUS;
  var isFileURI = /* @__PURE__ */ __name((filename) => filename.startsWith("file://"), "isFileURI");
  var readyPromiseResolve, readyPromiseReject;
  var wasmMemory;
  var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
  var HEAP64, HEAPU64;
  var HEAP_DATA_VIEW;
  var runtimeInitialized = false;
  function updateMemoryViews() {
    var b = wasmMemory.buffer;
    Module["HEAP8"] = HEAP8 = new Int8Array(b);
    Module["HEAP16"] = HEAP16 = new Int16Array(b);
    Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
    Module["HEAPU16"] = HEAPU16 = new Uint16Array(b);
    Module["HEAP32"] = HEAP32 = new Int32Array(b);
    Module["HEAPU32"] = HEAPU32 = new Uint32Array(b);
    Module["HEAPF32"] = HEAPF32 = new Float32Array(b);
    Module["HEAPF64"] = HEAPF64 = new Float64Array(b);
    Module["HEAP64"] = HEAP64 = new BigInt64Array(b);
    Module["HEAPU64"] = HEAPU64 = new BigUint64Array(b);
    Module["HEAP_DATA_VIEW"] = HEAP_DATA_VIEW = new DataView(b);
    LE_HEAP_UPDATE();
  }
  __name(updateMemoryViews, "updateMemoryViews");
  function initMemory() {
    if (Module["wasmMemory"]) {
      wasmMemory = Module["wasmMemory"];
    } else {
      var INITIAL_MEMORY = Module["INITIAL_MEMORY"] || 33554432;
      wasmMemory = new WebAssembly.Memory({
        "initial": INITIAL_MEMORY / 65536,
        // In theory we should not need to emit the maximum if we want "unlimited"
        // or 4GB of memory, but VMs error on that atm, see
        // https://github.com/emscripten-core/emscripten/issues/14130
        // And in the pthreads case we definitely need to emit a maximum. So
        // always emit one.
        "maximum": 32768
      });
    }
    updateMemoryViews();
  }
  __name(initMemory, "initMemory");
  var __RELOC_FUNCS__ = [];
  function preRun() {
    if (Module["preRun"]) {
      if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
      while (Module["preRun"].length) {
        addOnPreRun(Module["preRun"].shift());
      }
    }
    callRuntimeCallbacks(onPreRuns);
  }
  __name(preRun, "preRun");
  function initRuntime() {
    runtimeInitialized = true;
    callRuntimeCallbacks(__RELOC_FUNCS__);
    wasmExports["__wasm_call_ctors"]();
    callRuntimeCallbacks(onPostCtors);
  }
  __name(initRuntime, "initRuntime");
  function preMain() {
  }
  __name(preMain, "preMain");
  function postRun() {
    if (Module["postRun"]) {
      if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
      while (Module["postRun"].length) {
        addOnPostRun(Module["postRun"].shift());
      }
    }
    callRuntimeCallbacks(onPostRuns);
  }
  __name(postRun, "postRun");
  function abort(what) {
    Module["onAbort"]?.(what);
    what = "Aborted(" + what + ")";
    err(what);
    ABORT = true;
    what += ". Build with -sASSERTIONS for more info.";
    var e = new WebAssembly.RuntimeError(what);
    readyPromiseReject?.(e);
    throw e;
  }
  __name(abort, "abort");
  var wasmBinaryFile;
  function findWasmBinary() {
    if (Module["locateFile"]) {
      return locateFile("web-tree-sitter.wasm");
    }
    return new URL("web-tree-sitter.wasm", import.meta.url).href;
  }
  __name(findWasmBinary, "findWasmBinary");
  function getBinarySync(file) {
    if (file == wasmBinaryFile && wasmBinary) {
      return new Uint8Array(wasmBinary);
    }
    if (readBinary) {
      return readBinary(file);
    }
    throw "both async and sync fetching of the wasm failed";
  }
  __name(getBinarySync, "getBinarySync");
  async function getWasmBinary(binaryFile) {
    if (!wasmBinary) {
      try {
        var response = await readAsync(binaryFile);
        return new Uint8Array(response);
      } catch {
      }
    }
    return getBinarySync(binaryFile);
  }
  __name(getWasmBinary, "getWasmBinary");
  async function instantiateArrayBuffer(binaryFile, imports) {
    try {
      var binary2 = await getWasmBinary(binaryFile);
      var instance2 = await WebAssembly.instantiate(binary2, imports);
      return instance2;
    } catch (reason) {
      err(`failed to asynchronously prepare wasm: ${reason}`);
      abort(reason);
    }
  }
  __name(instantiateArrayBuffer, "instantiateArrayBuffer");
  async function instantiateAsync(binary2, binaryFile, imports) {
    if (!binary2 && !isFileURI(binaryFile) && !ENVIRONMENT_IS_NODE) {
      try {
        var response = fetch(binaryFile, {
          credentials: "same-origin"
        });
        var instantiationResult = await WebAssembly.instantiateStreaming(response, imports);
        return instantiationResult;
      } catch (reason) {
        err(`wasm streaming compile failed: ${reason}`);
        err("falling back to ArrayBuffer instantiation");
      }
    }
    return instantiateArrayBuffer(binaryFile, imports);
  }
  __name(instantiateAsync, "instantiateAsync");
  function getWasmImports() {
    return {
      "env": wasmImports,
      "wasi_snapshot_preview1": wasmImports,
      "GOT.mem": new Proxy(wasmImports, GOTHandler),
      "GOT.func": new Proxy(wasmImports, GOTHandler)
    };
  }
  __name(getWasmImports, "getWasmImports");
  async function createWasm() {
    function receiveInstance(instance2, module2) {
      wasmExports = instance2.exports;
      wasmExports = relocateExports(wasmExports, 1024);
      var metadata2 = getDylinkMetadata(module2);
      if (metadata2.neededDynlibs) {
        dynamicLibraries = metadata2.neededDynlibs.concat(dynamicLibraries);
      }
      mergeLibSymbols(wasmExports, "main");
      LDSO.init();
      loadDylibs();
      __RELOC_FUNCS__.push(wasmExports["__wasm_apply_data_relocs"]);
      assignWasmExports(wasmExports);
      return wasmExports;
    }
    __name(receiveInstance, "receiveInstance");
    function receiveInstantiationResult(result2) {
      return receiveInstance(result2["instance"], result2["module"]);
    }
    __name(receiveInstantiationResult, "receiveInstantiationResult");
    var info2 = getWasmImports();
    if (Module["instantiateWasm"]) {
      return new Promise((resolve22, reject) => {
        Module["instantiateWasm"](info2, (mod, inst) => {
          resolve22(receiveInstance(mod, inst));
        });
      });
    }
    wasmBinaryFile ??= findWasmBinary();
    var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info2);
    var exports = receiveInstantiationResult(result);
    return exports;
  }
  __name(createWasm, "createWasm");
  class ExitStatus {
    static {
      __name(this, "ExitStatus");
    }
    name = "ExitStatus";
    constructor(status) {
      this.message = `Program terminated with exit(${status})`;
      this.status = status;
    }
  }
  var GOT = {};
  var currentModuleWeakSymbols = /* @__PURE__ */ new Set([]);
  var GOTHandler = {
    get(obj, symName) {
      var rtn = GOT[symName];
      if (!rtn) {
        rtn = GOT[symName] = new WebAssembly.Global({
          "value": "i32",
          "mutable": true
        });
      }
      if (!currentModuleWeakSymbols.has(symName)) {
        rtn.required = true;
      }
      return rtn;
    }
  };
  var LE_ATOMICS_NATIVE_BYTE_ORDER = [];
  var LE_HEAP_LOAD_F32 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getFloat32(byteOffset, true), "LE_HEAP_LOAD_F32");
  var LE_HEAP_LOAD_F64 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getFloat64(byteOffset, true), "LE_HEAP_LOAD_F64");
  var LE_HEAP_LOAD_I16 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getInt16(byteOffset, true), "LE_HEAP_LOAD_I16");
  var LE_HEAP_LOAD_I32 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getInt32(byteOffset, true), "LE_HEAP_LOAD_I32");
  var LE_HEAP_LOAD_I64 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getBigInt64(byteOffset, true), "LE_HEAP_LOAD_I64");
  var LE_HEAP_LOAD_U32 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getUint32(byteOffset, true), "LE_HEAP_LOAD_U32");
  var LE_HEAP_STORE_F32 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setFloat32(byteOffset, value, true), "LE_HEAP_STORE_F32");
  var LE_HEAP_STORE_F64 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setFloat64(byteOffset, value, true), "LE_HEAP_STORE_F64");
  var LE_HEAP_STORE_I16 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setInt16(byteOffset, value, true), "LE_HEAP_STORE_I16");
  var LE_HEAP_STORE_I32 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setInt32(byteOffset, value, true), "LE_HEAP_STORE_I32");
  var LE_HEAP_STORE_I64 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setBigInt64(byteOffset, value, true), "LE_HEAP_STORE_I64");
  var LE_HEAP_STORE_U32 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setUint32(byteOffset, value, true), "LE_HEAP_STORE_U32");
  var callRuntimeCallbacks = /* @__PURE__ */ __name((callbacks) => {
    while (callbacks.length > 0) {
      callbacks.shift()(Module);
    }
  }, "callRuntimeCallbacks");
  var onPostRuns = [];
  var addOnPostRun = /* @__PURE__ */ __name((cb) => onPostRuns.push(cb), "addOnPostRun");
  var onPreRuns = [];
  var addOnPreRun = /* @__PURE__ */ __name((cb) => onPreRuns.push(cb), "addOnPreRun");
  var UTF8Decoder = typeof TextDecoder != "undefined" ? new TextDecoder() : void 0;
  var findStringEnd = /* @__PURE__ */ __name((heapOrArray, idx, maxBytesToRead, ignoreNul) => {
    var maxIdx = idx + maxBytesToRead;
    if (ignoreNul) return maxIdx;
    while (heapOrArray[idx] && !(idx >= maxIdx)) ++idx;
    return idx;
  }, "findStringEnd");
  var UTF8ArrayToString = /* @__PURE__ */ __name((heapOrArray, idx = 0, maxBytesToRead, ignoreNul) => {
    var endPtr = findStringEnd(heapOrArray, idx, maxBytesToRead, ignoreNul);
    if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
      return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
    }
    var str2 = "";
    while (idx < endPtr) {
      var u0 = heapOrArray[idx++];
      if (!(u0 & 128)) {
        str2 += String.fromCharCode(u0);
        continue;
      }
      var u1 = heapOrArray[idx++] & 63;
      if ((u0 & 224) == 192) {
        str2 += String.fromCharCode((u0 & 31) << 6 | u1);
        continue;
      }
      var u2 = heapOrArray[idx++] & 63;
      if ((u0 & 240) == 224) {
        u0 = (u0 & 15) << 12 | u1 << 6 | u2;
      } else {
        u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heapOrArray[idx++] & 63;
      }
      if (u0 < 65536) {
        str2 += String.fromCharCode(u0);
      } else {
        var ch = u0 - 65536;
        str2 += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
      }
    }
    return str2;
  }, "UTF8ArrayToString");
  var getDylinkMetadata = /* @__PURE__ */ __name((binary2) => {
    var offset = 0;
    var end = 0;
    function getU8() {
      return binary2[offset++];
    }
    __name(getU8, "getU8");
    function getLEB() {
      var ret = 0;
      var mul = 1;
      while (1) {
        var byte = binary2[offset++];
        ret += (byte & 127) * mul;
        mul *= 128;
        if (!(byte & 128)) break;
      }
      return ret;
    }
    __name(getLEB, "getLEB");
    function getString() {
      var len = getLEB();
      offset += len;
      return UTF8ArrayToString(binary2, offset - len, len);
    }
    __name(getString, "getString");
    function getStringList() {
      var count2 = getLEB();
      var rtn = [];
      while (count2--) rtn.push(getString());
      return rtn;
    }
    __name(getStringList, "getStringList");
    function failIf(condition, message) {
      if (condition) throw new Error(message);
    }
    __name(failIf, "failIf");
    if (binary2 instanceof WebAssembly.Module) {
      var dylinkSection = WebAssembly.Module.customSections(binary2, "dylink.0");
      failIf(dylinkSection.length === 0, "need dylink section");
      binary2 = new Uint8Array(dylinkSection[0]);
      end = binary2.length;
    } else {
      var int32View = new Uint32Array(new Uint8Array(binary2.subarray(0, 24)).buffer);
      var magicNumberFound = int32View[0] == 1836278016 || int32View[0] == 6386541;
      failIf(!magicNumberFound, "need to see wasm magic number");
      failIf(binary2[8] !== 0, "need the dylink section to be first");
      offset = 9;
      var section_size = getLEB();
      end = offset + section_size;
      var name2 = getString();
      failIf(name2 !== "dylink.0");
    }
    var customSection = {
      neededDynlibs: [],
      tlsExports: /* @__PURE__ */ new Set(),
      weakImports: /* @__PURE__ */ new Set(),
      runtimePaths: []
    };
    var WASM_DYLINK_MEM_INFO = 1;
    var WASM_DYLINK_NEEDED = 2;
    var WASM_DYLINK_EXPORT_INFO = 3;
    var WASM_DYLINK_IMPORT_INFO = 4;
    var WASM_DYLINK_RUNTIME_PATH = 5;
    var WASM_SYMBOL_TLS = 256;
    var WASM_SYMBOL_BINDING_MASK = 3;
    var WASM_SYMBOL_BINDING_WEAK = 1;
    while (offset < end) {
      var subsectionType = getU8();
      var subsectionSize = getLEB();
      if (subsectionType === WASM_DYLINK_MEM_INFO) {
        customSection.memorySize = getLEB();
        customSection.memoryAlign = getLEB();
        customSection.tableSize = getLEB();
        customSection.tableAlign = getLEB();
      } else if (subsectionType === WASM_DYLINK_NEEDED) {
        customSection.neededDynlibs = getStringList();
      } else if (subsectionType === WASM_DYLINK_EXPORT_INFO) {
        var count = getLEB();
        while (count--) {
          var symname = getString();
          var flags2 = getLEB();
          if (flags2 & WASM_SYMBOL_TLS) {
            customSection.tlsExports.add(symname);
          }
        }
      } else if (subsectionType === WASM_DYLINK_IMPORT_INFO) {
        var count = getLEB();
        while (count--) {
          var modname = getString();
          var symname = getString();
          var flags2 = getLEB();
          if ((flags2 & WASM_SYMBOL_BINDING_MASK) == WASM_SYMBOL_BINDING_WEAK) {
            customSection.weakImports.add(symname);
          }
        }
      } else if (subsectionType === WASM_DYLINK_RUNTIME_PATH) {
        customSection.runtimePaths = getStringList();
      } else {
        offset += subsectionSize;
      }
    }
    return customSection;
  }, "getDylinkMetadata");
  function getValue(ptr, type = "i8") {
    if (type.endsWith("*")) type = "*";
    switch (type) {
      case "i1":
        return HEAP8[ptr];
      case "i8":
        return HEAP8[ptr];
      case "i16":
        return LE_HEAP_LOAD_I16((ptr >> 1) * 2);
      case "i32":
        return LE_HEAP_LOAD_I32((ptr >> 2) * 4);
      case "i64":
        return LE_HEAP_LOAD_I64((ptr >> 3) * 8);
      case "float":
        return LE_HEAP_LOAD_F32((ptr >> 2) * 4);
      case "double":
        return LE_HEAP_LOAD_F64((ptr >> 3) * 8);
      case "*":
        return LE_HEAP_LOAD_U32((ptr >> 2) * 4);
      default:
        abort(`invalid type for getValue: ${type}`);
    }
  }
  __name(getValue, "getValue");
  var newDSO = /* @__PURE__ */ __name((name2, handle2, syms) => {
    var dso = {
      refcount: Infinity,
      name: name2,
      exports: syms,
      global: true
    };
    LDSO.loadedLibsByName[name2] = dso;
    if (handle2 != void 0) {
      LDSO.loadedLibsByHandle[handle2] = dso;
    }
    return dso;
  }, "newDSO");
  var LDSO = {
    loadedLibsByName: {},
    loadedLibsByHandle: {},
    init() {
      newDSO("__main__", 0, wasmImports);
    }
  };
  var ___heap_base = 78240;
  var alignMemory = /* @__PURE__ */ __name((size, alignment) => Math.ceil(size / alignment) * alignment, "alignMemory");
  var getMemory = /* @__PURE__ */ __name((size) => {
    if (runtimeInitialized) {
      return _calloc(size, 1);
    }
    var ret = ___heap_base;
    var end = ret + alignMemory(size, 16);
    ___heap_base = end;
    GOT["__heap_base"].value = end;
    return ret;
  }, "getMemory");
  var isInternalSym = /* @__PURE__ */ __name((symName) => ["__cpp_exception", "__c_longjmp", "__wasm_apply_data_relocs", "__dso_handle", "__tls_size", "__tls_align", "__set_stack_limits", "_emscripten_tls_init", "__wasm_init_tls", "__wasm_call_ctors", "__start_em_asm", "__stop_em_asm", "__start_em_js", "__stop_em_js"].includes(symName) || symName.startsWith("__em_js__"), "isInternalSym");
  var uleb128EncodeWithLen = /* @__PURE__ */ __name((arr) => {
    const n = arr.length;
    return [n % 128 | 128, n >> 7, ...arr];
  }, "uleb128EncodeWithLen");
  var wasmTypeCodes = {
    "i": 127,
    // i32
    "p": 127,
    // i32
    "j": 126,
    // i64
    "f": 125,
    // f32
    "d": 124,
    // f64
    "e": 111
  };
  var generateTypePack = /* @__PURE__ */ __name((types) => uleb128EncodeWithLen(Array.from(types, (type) => {
    var code = wasmTypeCodes[type];
    return code;
  })), "generateTypePack");
  var convertJsFunctionToWasm = /* @__PURE__ */ __name((func2, sig) => {
    var bytes = Uint8Array.of(
      0,
      97,
      115,
      109,
      // magic ("\0asm")
      1,
      0,
      0,
      0,
      // version: 1
      1,
      ...uleb128EncodeWithLen([
        1,
        // count: 1
        96,
        // param types
        ...generateTypePack(sig.slice(1)),
        // return types (for now only supporting [] if `void` and single [T] otherwise)
        ...generateTypePack(sig[0] === "v" ? "" : sig[0])
      ]),
      // The rest of the module is static
      2,
      7,
      // import section
      // (import "e" "f" (func 0 (type 0)))
      1,
      1,
      101,
      1,
      102,
      0,
      0,
      7,
      5,
      // export section
      // (export "f" (func 0 (type 0)))
      1,
      1,
      102,
      0,
      0
    );
    var module2 = new WebAssembly.Module(bytes);
    var instance2 = new WebAssembly.Instance(module2, {
      "e": {
        "f": func2
      }
    });
    var wrappedFunc = instance2.exports["f"];
    return wrappedFunc;
  }, "convertJsFunctionToWasm");
  var wasmTableMirror = [];
  var wasmTable = new WebAssembly.Table({
    "initial": 31,
    "element": "anyfunc"
  });
  var getWasmTableEntry = /* @__PURE__ */ __name((funcPtr) => {
    var func2 = wasmTableMirror[funcPtr];
    if (!func2) {
      wasmTableMirror[funcPtr] = func2 = wasmTable.get(funcPtr);
    }
    return func2;
  }, "getWasmTableEntry");
  var updateTableMap = /* @__PURE__ */ __name((offset, count) => {
    if (functionsInTableMap) {
      for (var i2 = offset; i2 < offset + count; i2++) {
        var item = getWasmTableEntry(i2);
        if (item) {
          functionsInTableMap.set(item, i2);
        }
      }
    }
  }, "updateTableMap");
  var functionsInTableMap;
  var getFunctionAddress = /* @__PURE__ */ __name((func2) => {
    if (!functionsInTableMap) {
      functionsInTableMap = /* @__PURE__ */ new WeakMap();
      updateTableMap(0, wasmTable.length);
    }
    return functionsInTableMap.get(func2) || 0;
  }, "getFunctionAddress");
  var freeTableIndexes = [];
  var getEmptyTableSlot = /* @__PURE__ */ __name(() => {
    if (freeTableIndexes.length) {
      return freeTableIndexes.pop();
    }
    return wasmTable["grow"](1);
  }, "getEmptyTableSlot");
  var setWasmTableEntry = /* @__PURE__ */ __name((idx, func2) => {
    wasmTable.set(idx, func2);
    wasmTableMirror[idx] = wasmTable.get(idx);
  }, "setWasmTableEntry");
  var addFunction = /* @__PURE__ */ __name((func2, sig) => {
    var rtn = getFunctionAddress(func2);
    if (rtn) {
      return rtn;
    }
    var ret = getEmptyTableSlot();
    try {
      setWasmTableEntry(ret, func2);
    } catch (err22) {
      if (!(err22 instanceof TypeError)) {
        throw err22;
      }
      var wrapped = convertJsFunctionToWasm(func2, sig);
      setWasmTableEntry(ret, wrapped);
    }
    functionsInTableMap.set(func2, ret);
    return ret;
  }, "addFunction");
  var updateGOT = /* @__PURE__ */ __name((exports, replace) => {
    for (var symName in exports) {
      if (isInternalSym(symName)) {
        continue;
      }
      var value = exports[symName];
      GOT[symName] ||= new WebAssembly.Global({
        "value": "i32",
        "mutable": true
      });
      if (replace || GOT[symName].value == 0) {
        if (typeof value == "function") {
          GOT[symName].value = addFunction(value);
        } else if (typeof value == "number") {
          GOT[symName].value = value;
        } else {
          err(`unhandled export type for '${symName}': ${typeof value}`);
        }
      }
    }
  }, "updateGOT");
  var relocateExports = /* @__PURE__ */ __name((exports, memoryBase2, replace) => {
    var relocated = {};
    for (var e in exports) {
      var value = exports[e];
      if (typeof value == "object") {
        value = value.value;
      }
      if (typeof value == "number") {
        value += memoryBase2;
      }
      relocated[e] = value;
    }
    updateGOT(relocated, replace);
    return relocated;
  }, "relocateExports");
  var isSymbolDefined = /* @__PURE__ */ __name((symName) => {
    var existing = wasmImports[symName];
    if (!existing || existing.stub) {
      return false;
    }
    return true;
  }, "isSymbolDefined");
  var dynCall = /* @__PURE__ */ __name((sig, ptr, args2 = [], promising = false) => {
    var func2 = getWasmTableEntry(ptr);
    var rtn = func2(...args2);
    function convert(rtn2) {
      return rtn2;
    }
    __name(convert, "convert");
    return convert(rtn);
  }, "dynCall");
  var stackSave = /* @__PURE__ */ __name(() => _emscripten_stack_get_current(), "stackSave");
  var stackRestore = /* @__PURE__ */ __name((val) => __emscripten_stack_restore(val), "stackRestore");
  var createInvokeFunction = /* @__PURE__ */ __name((sig) => (ptr, ...args2) => {
    var sp = stackSave();
    try {
      return dynCall(sig, ptr, args2);
    } catch (e) {
      stackRestore(sp);
      if (e !== e + 0) throw e;
      _setThrew(1, 0);
      if (sig[0] == "j") return 0n;
    }
  }, "createInvokeFunction");
  var resolveGlobalSymbol = /* @__PURE__ */ __name((symName, direct = false) => {
    var sym;
    if (isSymbolDefined(symName)) {
      sym = wasmImports[symName];
    } else if (symName.startsWith("invoke_")) {
      sym = wasmImports[symName] = createInvokeFunction(symName.split("_")[1]);
    }
    return {
      sym,
      name: symName
    };
  }, "resolveGlobalSymbol");
  var onPostCtors = [];
  var addOnPostCtor = /* @__PURE__ */ __name((cb) => onPostCtors.push(cb), "addOnPostCtor");
  var UTF8ToString = /* @__PURE__ */ __name((ptr, maxBytesToRead, ignoreNul) => ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead, ignoreNul) : "", "UTF8ToString");
  var loadWebAssemblyModule = /* @__PURE__ */ __name((binary, flags, libName, localScope, handle) => {
    var metadata = getDylinkMetadata(binary);
    function loadModule() {
      var memAlign = Math.pow(2, metadata.memoryAlign);
      var memoryBase = metadata.memorySize ? alignMemory(getMemory(metadata.memorySize + memAlign), memAlign) : 0;
      var tableBase = metadata.tableSize ? wasmTable.length : 0;
      if (handle) {
        HEAP8[handle + 8] = 1;
        LE_HEAP_STORE_U32((handle + 12 >> 2) * 4, memoryBase);
        LE_HEAP_STORE_I32((handle + 16 >> 2) * 4, metadata.memorySize);
        LE_HEAP_STORE_U32((handle + 20 >> 2) * 4, tableBase);
        LE_HEAP_STORE_I32((handle + 24 >> 2) * 4, metadata.tableSize);
      }
      if (metadata.tableSize) {
        wasmTable.grow(metadata.tableSize);
      }
      var moduleExports;
      function resolveSymbol(sym) {
        var resolved = resolveGlobalSymbol(sym).sym;
        if (!resolved && localScope) {
          resolved = localScope[sym];
        }
        if (!resolved) {
          resolved = moduleExports[sym];
        }
        return resolved;
      }
      __name(resolveSymbol, "resolveSymbol");
      var proxyHandler = {
        get(stubs, prop) {
          switch (prop) {
            case "__memory_base":
              return memoryBase;
            case "__table_base":
              return tableBase;
          }
          if (prop in wasmImports && !wasmImports[prop].stub) {
            var res = wasmImports[prop];
            return res;
          }
          if (!(prop in stubs)) {
            var resolved;
            stubs[prop] = (...args2) => {
              resolved ||= resolveSymbol(prop);
              return resolved(...args2);
            };
          }
          return stubs[prop];
        }
      };
      var proxy = new Proxy({}, proxyHandler);
      currentModuleWeakSymbols = metadata.weakImports;
      var info = {
        "GOT.mem": new Proxy({}, GOTHandler),
        "GOT.func": new Proxy({}, GOTHandler),
        "env": proxy,
        "wasi_snapshot_preview1": proxy
      };
      function postInstantiation(module, instance) {
        updateTableMap(tableBase, metadata.tableSize);
        moduleExports = relocateExports(instance.exports, memoryBase);
        if (!flags.allowUndefined) {
          reportUndefinedSymbols();
        }
        function addEmAsm(addr, body) {
          var args = [];
          var arity = 0;
          for (; arity < 16; arity++) {
            if (body.indexOf("$" + arity) != -1) {
              args.push("$" + arity);
            } else {
              break;
            }
          }
          args = args.join(",");
          var func = `(${args}) => { ${body} };`;
          ASM_CONSTS[start] = eval(func);
        }
        __name(addEmAsm, "addEmAsm");
        if ("__start_em_asm" in moduleExports) {
          var start = moduleExports["__start_em_asm"];
          var stop = moduleExports["__stop_em_asm"];
          while (start < stop) {
            var jsString = UTF8ToString(start);
            addEmAsm(start, jsString);
            start = HEAPU8.indexOf(0, start) + 1;
          }
        }
        function addEmJs(name, cSig, body) {
          var jsArgs = [];
          cSig = cSig.slice(1, -1);
          if (cSig != "void") {
            cSig = cSig.split(",");
            for (var i in cSig) {
              var jsArg = cSig[i].split(" ").pop();
              jsArgs.push(jsArg.replace("*", ""));
            }
          }
          var func = `(${jsArgs}) => ${body};`;
          moduleExports[name] = eval(func);
        }
        __name(addEmJs, "addEmJs");
        for (var name in moduleExports) {
          if (name.startsWith("__em_js__")) {
            var start = moduleExports[name];
            var jsString = UTF8ToString(start);
            var parts = jsString.split("<::>");
            addEmJs(name.replace("__em_js__", ""), parts[0], parts[1]);
            delete moduleExports[name];
          }
        }
        var applyRelocs = moduleExports["__wasm_apply_data_relocs"];
        if (applyRelocs) {
          if (runtimeInitialized) {
            applyRelocs();
          } else {
            __RELOC_FUNCS__.push(applyRelocs);
          }
        }
        var init = moduleExports["__wasm_call_ctors"];
        if (init) {
          if (runtimeInitialized) {
            init();
          } else {
            addOnPostCtor(init);
          }
        }
        return moduleExports;
      }
      __name(postInstantiation, "postInstantiation");
      if (flags.loadAsync) {
        return (async () => {
          var instance2;
          if (binary instanceof WebAssembly.Module) {
            instance2 = new WebAssembly.Instance(binary, info);
          } else {
            ({ module: binary, instance: instance2 } = await WebAssembly.instantiate(binary, info));
          }
          return postInstantiation(binary, instance2);
        })();
      }
      var module = binary instanceof WebAssembly.Module ? binary : new WebAssembly.Module(binary);
      var instance = new WebAssembly.Instance(module, info);
      return postInstantiation(module, instance);
    }
    __name(loadModule, "loadModule");
    flags = {
      ...flags,
      rpath: {
        parentLibPath: libName,
        paths: metadata.runtimePaths
      }
    };
    if (flags.loadAsync) {
      return metadata.neededDynlibs.reduce((chain, dynNeeded) => chain.then(() => loadDynamicLibrary(dynNeeded, flags, localScope)), Promise.resolve()).then(loadModule);
    }
    metadata.neededDynlibs.forEach((needed) => loadDynamicLibrary(needed, flags, localScope));
    return loadModule();
  }, "loadWebAssemblyModule");
  var mergeLibSymbols = /* @__PURE__ */ __name((exports, libName2) => {
    for (var [sym, exp] of Object.entries(exports)) {
      const setImport = /* @__PURE__ */ __name((target) => {
        if (!isSymbolDefined(target)) {
          wasmImports[target] = exp;
        }
      }, "setImport");
      setImport(sym);
      const main_alias = "__main_argc_argv";
      if (sym == "main") {
        setImport(main_alias);
      }
      if (sym == main_alias) {
        setImport("main");
      }
    }
  }, "mergeLibSymbols");
  var asyncLoad = /* @__PURE__ */ __name(async (url) => {
    var arrayBuffer = await readAsync(url);
    return new Uint8Array(arrayBuffer);
  }, "asyncLoad");
  function loadDynamicLibrary(libName2, flags2 = {
    global: true,
    nodelete: true
  }, localScope2, handle2) {
    var dso = LDSO.loadedLibsByName[libName2];
    if (dso) {
      if (!flags2.global) {
        if (localScope2) {
          Object.assign(localScope2, dso.exports);
        }
      } else if (!dso.global) {
        dso.global = true;
        mergeLibSymbols(dso.exports, libName2);
      }
      if (flags2.nodelete && dso.refcount !== Infinity) {
        dso.refcount = Infinity;
      }
      dso.refcount++;
      if (handle2) {
        LDSO.loadedLibsByHandle[handle2] = dso;
      }
      return flags2.loadAsync ? Promise.resolve(true) : true;
    }
    dso = newDSO(libName2, handle2, "loading");
    dso.refcount = flags2.nodelete ? Infinity : 1;
    dso.global = flags2.global;
    function loadLibData() {
      if (handle2) {
        var data = LE_HEAP_LOAD_U32((handle2 + 28 >> 2) * 4);
        var dataSize = LE_HEAP_LOAD_U32((handle2 + 32 >> 2) * 4);
        if (data && dataSize) {
          var libData = HEAP8.slice(data, data + dataSize);
          return flags2.loadAsync ? Promise.resolve(libData) : libData;
        }
      }
      var libFile = locateFile(libName2);
      if (flags2.loadAsync) {
        return asyncLoad(libFile);
      }
      if (!readBinary) {
        throw new Error(`${libFile}: file not found, and synchronous loading of external files is not available`);
      }
      return readBinary(libFile);
    }
    __name(loadLibData, "loadLibData");
    function getExports() {
      if (flags2.loadAsync) {
        return loadLibData().then((libData) => loadWebAssemblyModule(libData, flags2, libName2, localScope2, handle2));
      }
      return loadWebAssemblyModule(loadLibData(), flags2, libName2, localScope2, handle2);
    }
    __name(getExports, "getExports");
    function moduleLoaded(exports) {
      if (dso.global) {
        mergeLibSymbols(exports, libName2);
      } else if (localScope2) {
        Object.assign(localScope2, exports);
      }
      dso.exports = exports;
    }
    __name(moduleLoaded, "moduleLoaded");
    if (flags2.loadAsync) {
      return getExports().then((exports) => {
        moduleLoaded(exports);
        return true;
      });
    }
    moduleLoaded(getExports());
    return true;
  }
  __name(loadDynamicLibrary, "loadDynamicLibrary");
  var reportUndefinedSymbols = /* @__PURE__ */ __name(() => {
    for (var [symName, entry] of Object.entries(GOT)) {
      if (entry.value == 0) {
        var value = resolveGlobalSymbol(symName, true).sym;
        if (!value && !entry.required) {
          continue;
        }
        if (typeof value == "function") {
          entry.value = addFunction(value, value.sig);
        } else if (typeof value == "number") {
          entry.value = value;
        } else {
          throw new Error(`bad export type for '${symName}': ${typeof value}`);
        }
      }
    }
  }, "reportUndefinedSymbols");
  var runDependencies = 0;
  var dependenciesFulfilled = null;
  var removeRunDependency = /* @__PURE__ */ __name((id) => {
    runDependencies--;
    Module["monitorRunDependencies"]?.(runDependencies);
    if (runDependencies == 0) {
      if (dependenciesFulfilled) {
        var callback = dependenciesFulfilled;
        dependenciesFulfilled = null;
        callback();
      }
    }
  }, "removeRunDependency");
  var addRunDependency = /* @__PURE__ */ __name((id) => {
    runDependencies++;
    Module["monitorRunDependencies"]?.(runDependencies);
  }, "addRunDependency");
  var loadDylibs = /* @__PURE__ */ __name(async () => {
    if (!dynamicLibraries.length) {
      reportUndefinedSymbols();
      return;
    }
    addRunDependency("loadDylibs");
    for (var lib of dynamicLibraries) {
      await loadDynamicLibrary(lib, {
        loadAsync: true,
        global: true,
        nodelete: true,
        allowUndefined: true
      });
    }
    reportUndefinedSymbols();
    removeRunDependency("loadDylibs");
  }, "loadDylibs");
  var noExitRuntime = true;
  function setValue(ptr, value, type = "i8") {
    if (type.endsWith("*")) type = "*";
    switch (type) {
      case "i1":
        HEAP8[ptr] = value;
        break;
      case "i8":
        HEAP8[ptr] = value;
        break;
      case "i16":
        LE_HEAP_STORE_I16((ptr >> 1) * 2, value);
        break;
      case "i32":
        LE_HEAP_STORE_I32((ptr >> 2) * 4, value);
        break;
      case "i64":
        LE_HEAP_STORE_I64((ptr >> 3) * 8, BigInt(value));
        break;
      case "float":
        LE_HEAP_STORE_F32((ptr >> 2) * 4, value);
        break;
      case "double":
        LE_HEAP_STORE_F64((ptr >> 3) * 8, value);
        break;
      case "*":
        LE_HEAP_STORE_U32((ptr >> 2) * 4, value);
        break;
      default:
        abort(`invalid type for setValue: ${type}`);
    }
  }
  __name(setValue, "setValue");
  var ___memory_base = new WebAssembly.Global({
    "value": "i32",
    "mutable": false
  }, 1024);
  var ___stack_high = 78240;
  var ___stack_low = 12704;
  var ___stack_pointer = new WebAssembly.Global({
    "value": "i32",
    "mutable": true
  }, 78240);
  var ___table_base = new WebAssembly.Global({
    "value": "i32",
    "mutable": false
  }, 1);
  var __abort_js = /* @__PURE__ */ __name(() => abort(""), "__abort_js");
  __abort_js.sig = "v";
  var getHeapMax = /* @__PURE__ */ __name(() => (
    // Stay one Wasm page short of 4GB: while e.g. Chrome is able to allocate
    // full 4GB Wasm memories, the size will wrap back to 0 bytes in Wasm side
    // for any code that deals with heap sizes, which would require special
    // casing all heap size related code to treat 0 specially.
    2147483648
  ), "getHeapMax");
  var growMemory = /* @__PURE__ */ __name((size) => {
    var oldHeapSize = wasmMemory.buffer.byteLength;
    var pages = (size - oldHeapSize + 65535) / 65536 | 0;
    try {
      wasmMemory.grow(pages);
      updateMemoryViews();
      return 1;
    } catch (e) {
    }
  }, "growMemory");
  var _emscripten_resize_heap = /* @__PURE__ */ __name((requestedSize) => {
    var oldSize = HEAPU8.length;
    requestedSize >>>= 0;
    var maxHeapSize = getHeapMax();
    if (requestedSize > maxHeapSize) {
      return false;
    }
    for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
      var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
      overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
      var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));
      var replacement = growMemory(newSize);
      if (replacement) {
        return true;
      }
    }
    return false;
  }, "_emscripten_resize_heap");
  _emscripten_resize_heap.sig = "ip";
  var _fd_close = /* @__PURE__ */ __name((fd) => 52, "_fd_close");
  _fd_close.sig = "ii";
  var INT53_MAX = 9007199254740992;
  var INT53_MIN = -9007199254740992;
  var bigintToI53Checked = /* @__PURE__ */ __name((num) => num < INT53_MIN || num > INT53_MAX ? NaN : Number(num), "bigintToI53Checked");
  function _fd_seek(fd, offset, whence, newOffset) {
    offset = bigintToI53Checked(offset);
    return 70;
  }
  __name(_fd_seek, "_fd_seek");
  _fd_seek.sig = "iijip";
  var printCharBuffers = [null, [], []];
  var printChar = /* @__PURE__ */ __name((stream, curr) => {
    var buffer = printCharBuffers[stream];
    if (curr === 0 || curr === 10) {
      (stream === 1 ? out : err)(UTF8ArrayToString(buffer));
      buffer.length = 0;
    } else {
      buffer.push(curr);
    }
  }, "printChar");
  var _fd_write = /* @__PURE__ */ __name((fd, iov, iovcnt, pnum) => {
    var num = 0;
    for (var i2 = 0; i2 < iovcnt; i2++) {
      var ptr = LE_HEAP_LOAD_U32((iov >> 2) * 4);
      var len = LE_HEAP_LOAD_U32((iov + 4 >> 2) * 4);
      iov += 8;
      for (var j = 0; j < len; j++) {
        printChar(fd, HEAPU8[ptr + j]);
      }
      num += len;
    }
    LE_HEAP_STORE_U32((pnum >> 2) * 4, num);
    return 0;
  }, "_fd_write");
  _fd_write.sig = "iippp";
  function _tree_sitter_log_callback(isLexMessage, messageAddress) {
    if (Module.currentLogCallback) {
      const message = UTF8ToString(messageAddress);
      Module.currentLogCallback(message, isLexMessage !== 0);
    }
  }
  __name(_tree_sitter_log_callback, "_tree_sitter_log_callback");
  function _tree_sitter_parse_callback(inputBufferAddress, index, row, column, lengthAddress) {
    const INPUT_BUFFER_SIZE = 10 * 1024;
    const string = Module.currentParseCallback(index, {
      row,
      column
    });
    if (typeof string === "string") {
      setValue(lengthAddress, string.length, "i32");
      stringToUTF16(string, inputBufferAddress, INPUT_BUFFER_SIZE);
    } else {
      setValue(lengthAddress, 0, "i32");
    }
  }
  __name(_tree_sitter_parse_callback, "_tree_sitter_parse_callback");
  function _tree_sitter_progress_callback(currentOffset, hasError) {
    if (Module.currentProgressCallback) {
      return Module.currentProgressCallback({
        currentOffset,
        hasError
      });
    }
    return false;
  }
  __name(_tree_sitter_progress_callback, "_tree_sitter_progress_callback");
  function _tree_sitter_query_progress_callback(currentOffset) {
    if (Module.currentQueryProgressCallback) {
      return Module.currentQueryProgressCallback({
        currentOffset
      });
    }
    return false;
  }
  __name(_tree_sitter_query_progress_callback, "_tree_sitter_query_progress_callback");
  var runtimeKeepaliveCounter = 0;
  var keepRuntimeAlive = /* @__PURE__ */ __name(() => noExitRuntime || runtimeKeepaliveCounter > 0, "keepRuntimeAlive");
  var _proc_exit = /* @__PURE__ */ __name((code) => {
    EXITSTATUS = code;
    if (!keepRuntimeAlive()) {
      Module["onExit"]?.(code);
      ABORT = true;
    }
    quit_(code, new ExitStatus(code));
  }, "_proc_exit");
  _proc_exit.sig = "vi";
  var exitJS = /* @__PURE__ */ __name((status, implicit) => {
    EXITSTATUS = status;
    _proc_exit(status);
  }, "exitJS");
  var handleException = /* @__PURE__ */ __name((e) => {
    if (e instanceof ExitStatus || e == "unwind") {
      return EXITSTATUS;
    }
    quit_(1, e);
  }, "handleException");
  var lengthBytesUTF8 = /* @__PURE__ */ __name((str2) => {
    var len = 0;
    for (var i2 = 0; i2 < str2.length; ++i2) {
      var c2 = str2.charCodeAt(i2);
      if (c2 <= 127) {
        len++;
      } else if (c2 <= 2047) {
        len += 2;
      } else if (c2 >= 55296 && c2 <= 57343) {
        len += 4;
        ++i2;
      } else {
        len += 3;
      }
    }
    return len;
  }, "lengthBytesUTF8");
  var stringToUTF8Array = /* @__PURE__ */ __name((str2, heap, outIdx, maxBytesToWrite) => {
    if (!(maxBytesToWrite > 0)) return 0;
    var startIdx = outIdx;
    var endIdx = outIdx + maxBytesToWrite - 1;
    for (var i2 = 0; i2 < str2.length; ++i2) {
      var u = str2.codePointAt(i2);
      if (u <= 127) {
        if (outIdx >= endIdx) break;
        heap[outIdx++] = u;
      } else if (u <= 2047) {
        if (outIdx + 1 >= endIdx) break;
        heap[outIdx++] = 192 | u >> 6;
        heap[outIdx++] = 128 | u & 63;
      } else if (u <= 65535) {
        if (outIdx + 2 >= endIdx) break;
        heap[outIdx++] = 224 | u >> 12;
        heap[outIdx++] = 128 | u >> 6 & 63;
        heap[outIdx++] = 128 | u & 63;
      } else {
        if (outIdx + 3 >= endIdx) break;
        heap[outIdx++] = 240 | u >> 18;
        heap[outIdx++] = 128 | u >> 12 & 63;
        heap[outIdx++] = 128 | u >> 6 & 63;
        heap[outIdx++] = 128 | u & 63;
        i2++;
      }
    }
    heap[outIdx] = 0;
    return outIdx - startIdx;
  }, "stringToUTF8Array");
  var stringToUTF8 = /* @__PURE__ */ __name((str2, outPtr, maxBytesToWrite) => stringToUTF8Array(str2, HEAPU8, outPtr, maxBytesToWrite), "stringToUTF8");
  var stackAlloc = /* @__PURE__ */ __name((sz) => __emscripten_stack_alloc(sz), "stackAlloc");
  var stringToUTF8OnStack = /* @__PURE__ */ __name((str2) => {
    var size = lengthBytesUTF8(str2) + 1;
    var ret = stackAlloc(size);
    stringToUTF8(str2, ret, size);
    return ret;
  }, "stringToUTF8OnStack");
  var AsciiToString = /* @__PURE__ */ __name((ptr) => {
    var str2 = "";
    while (1) {
      var ch = HEAPU8[ptr++];
      if (!ch) return str2;
      str2 += String.fromCharCode(ch);
    }
  }, "AsciiToString");
  var stringToUTF16 = /* @__PURE__ */ __name((str2, outPtr, maxBytesToWrite) => {
    maxBytesToWrite ??= 2147483647;
    if (maxBytesToWrite < 2) return 0;
    maxBytesToWrite -= 2;
    var startPtr = outPtr;
    var numCharsToWrite = maxBytesToWrite < str2.length * 2 ? maxBytesToWrite / 2 : str2.length;
    for (var i2 = 0; i2 < numCharsToWrite; ++i2) {
      var codeUnit = str2.charCodeAt(i2);
      LE_HEAP_STORE_I16((outPtr >> 1) * 2, codeUnit);
      outPtr += 2;
    }
    LE_HEAP_STORE_I16((outPtr >> 1) * 2, 0);
    return outPtr - startPtr;
  }, "stringToUTF16");
  LE_ATOMICS_NATIVE_BYTE_ORDER = new Int8Array(new Int16Array([1]).buffer)[0] === 1 ? [
    /* little endian */
    ((x) => x),
    ((x) => x),
    void 0,
    ((x) => x)
  ] : [
    /* big endian */
    ((x) => x),
    ((x) => ((x & 65280) << 8 | (x & 255) << 24) >> 16),
    void 0,
    ((x) => x >> 24 & 255 | x >> 8 & 65280 | (x & 65280) << 8 | (x & 255) << 24)
  ];
  function LE_HEAP_UPDATE() {
    HEAPU16.unsigned = ((x) => x & 65535);
    HEAPU32.unsigned = ((x) => x >>> 0);
  }
  __name(LE_HEAP_UPDATE, "LE_HEAP_UPDATE");
  {
    initMemory();
    if (Module["noExitRuntime"]) noExitRuntime = Module["noExitRuntime"];
    if (Module["print"]) out = Module["print"];
    if (Module["printErr"]) err = Module["printErr"];
    if (Module["dynamicLibraries"]) dynamicLibraries = Module["dynamicLibraries"];
    if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];
    if (Module["arguments"]) arguments_ = Module["arguments"];
    if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
    if (Module["preInit"]) {
      if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
      while (Module["preInit"].length > 0) {
        Module["preInit"].shift()();
      }
    }
  }
  Module["setValue"] = setValue;
  Module["getValue"] = getValue;
  Module["UTF8ToString"] = UTF8ToString;
  Module["stringToUTF8"] = stringToUTF8;
  Module["lengthBytesUTF8"] = lengthBytesUTF8;
  Module["AsciiToString"] = AsciiToString;
  Module["stringToUTF16"] = stringToUTF16;
  Module["loadWebAssemblyModule"] = loadWebAssemblyModule;
  Module["LE_HEAP_STORE_I64"] = LE_HEAP_STORE_I64;
  var ASM_CONSTS = {};
  var _malloc, _calloc, _realloc, _free, _ts_range_edit, _memcmp, _ts_language_symbol_count, _ts_language_state_count, _ts_language_abi_version, _ts_language_name, _ts_language_field_count, _ts_language_next_state, _ts_language_symbol_name, _ts_language_symbol_for_name, _strncmp, _ts_language_symbol_type, _ts_language_field_name_for_id, _ts_lookahead_iterator_new, _ts_lookahead_iterator_delete, _ts_lookahead_iterator_reset_state, _ts_lookahead_iterator_reset, _ts_lookahead_iterator_next, _ts_lookahead_iterator_current_symbol, _ts_point_edit, _ts_parser_delete, _ts_parser_reset, _ts_parser_set_language, _ts_parser_set_included_ranges, _ts_query_new, _ts_query_delete, _iswspace, _iswalnum, _ts_query_pattern_count, _ts_query_capture_count, _ts_query_string_count, _ts_query_capture_name_for_id, _ts_query_capture_quantifier_for_id, _ts_query_string_value_for_id, _ts_query_predicates_for_pattern, _ts_query_start_byte_for_pattern, _ts_query_end_byte_for_pattern, _ts_query_is_pattern_rooted, _ts_query_is_pattern_non_local, _ts_query_is_pattern_guaranteed_at_step, _ts_query_disable_capture, _ts_query_disable_pattern, _ts_tree_copy, _ts_tree_delete, _ts_init, _ts_parser_new_wasm, _ts_parser_enable_logger_wasm, _ts_parser_parse_wasm, _ts_parser_included_ranges_wasm, _ts_language_type_is_named_wasm, _ts_language_type_is_visible_wasm, _ts_language_metadata_wasm, _ts_language_supertypes_wasm, _ts_language_subtypes_wasm, _ts_tree_root_node_wasm, _ts_tree_root_node_with_offset_wasm, _ts_tree_edit_wasm, _ts_tree_included_ranges_wasm, _ts_tree_get_changed_ranges_wasm, _ts_tree_cursor_new_wasm, _ts_tree_cursor_copy_wasm, _ts_tree_cursor_delete_wasm, _ts_tree_cursor_reset_wasm, _ts_tree_cursor_reset_to_wasm, _ts_tree_cursor_goto_first_child_wasm, _ts_tree_cursor_goto_last_child_wasm, _ts_tree_cursor_goto_first_child_for_index_wasm, _ts_tree_cursor_goto_first_child_for_position_wasm, _ts_tree_cursor_goto_next_sibling_wasm, _ts_tree_cursor_goto_previous_sibling_wasm, _ts_tree_cursor_goto_descendant_wasm, _ts_tree_cursor_goto_parent_wasm, _ts_tree_cursor_current_node_type_id_wasm, _ts_tree_cursor_current_node_state_id_wasm, _ts_tree_cursor_current_node_is_named_wasm, _ts_tree_cursor_current_node_is_missing_wasm, _ts_tree_cursor_current_node_id_wasm, _ts_tree_cursor_start_position_wasm, _ts_tree_cursor_end_position_wasm, _ts_tree_cursor_start_index_wasm, _ts_tree_cursor_end_index_wasm, _ts_tree_cursor_current_field_id_wasm, _ts_tree_cursor_current_depth_wasm, _ts_tree_cursor_current_descendant_index_wasm, _ts_tree_cursor_current_node_wasm, _ts_node_symbol_wasm, _ts_node_field_name_for_child_wasm, _ts_node_field_name_for_named_child_wasm, _ts_node_children_by_field_id_wasm, _ts_node_first_child_for_byte_wasm, _ts_node_first_named_child_for_byte_wasm, _ts_node_grammar_symbol_wasm, _ts_node_child_count_wasm, _ts_node_named_child_count_wasm, _ts_node_child_wasm, _ts_node_named_child_wasm, _ts_node_child_by_field_id_wasm, _ts_node_next_sibling_wasm, _ts_node_prev_sibling_wasm, _ts_node_next_named_sibling_wasm, _ts_node_prev_named_sibling_wasm, _ts_node_descendant_count_wasm, _ts_node_parent_wasm, _ts_node_child_with_descendant_wasm, _ts_node_descendant_for_index_wasm, _ts_node_named_descendant_for_index_wasm, _ts_node_descendant_for_position_wasm, _ts_node_named_descendant_for_position_wasm, _ts_node_start_point_wasm, _ts_node_end_point_wasm, _ts_node_start_index_wasm, _ts_node_end_index_wasm, _ts_node_to_string_wasm, _ts_node_children_wasm, _ts_node_named_children_wasm, _ts_node_descendants_of_type_wasm, _ts_node_is_named_wasm, _ts_node_has_changes_wasm, _ts_node_has_error_wasm, _ts_node_is_error_wasm, _ts_node_is_missing_wasm, _ts_node_is_extra_wasm, _ts_node_parse_state_wasm, _ts_node_next_parse_state_wasm, _ts_query_matches_wasm, _ts_query_captures_wasm, _memset, _memcpy, _memmove, _iswalpha, _iswblank, _iswdigit, _iswlower, _iswupper, _iswxdigit, _memchr, _strlen, _strcmp, _strncat, _strncpy, _towlower, _towupper, _setThrew, __emscripten_stack_restore, __emscripten_stack_alloc, _emscripten_stack_get_current, ___wasm_apply_data_relocs;
  function assignWasmExports(wasmExports2) {
    Module["_malloc"] = _malloc = wasmExports2["malloc"];
    Module["_calloc"] = _calloc = wasmExports2["calloc"];
    Module["_realloc"] = _realloc = wasmExports2["realloc"];
    Module["_free"] = _free = wasmExports2["free"];
    Module["_ts_range_edit"] = _ts_range_edit = wasmExports2["ts_range_edit"];
    Module["_memcmp"] = _memcmp = wasmExports2["memcmp"];
    Module["_ts_language_symbol_count"] = _ts_language_symbol_count = wasmExports2["ts_language_symbol_count"];
    Module["_ts_language_state_count"] = _ts_language_state_count = wasmExports2["ts_language_state_count"];
    Module["_ts_language_abi_version"] = _ts_language_abi_version = wasmExports2["ts_language_abi_version"];
    Module["_ts_language_name"] = _ts_language_name = wasmExports2["ts_language_name"];
    Module["_ts_language_field_count"] = _ts_language_field_count = wasmExports2["ts_language_field_count"];
    Module["_ts_language_next_state"] = _ts_language_next_state = wasmExports2["ts_language_next_state"];
    Module["_ts_language_symbol_name"] = _ts_language_symbol_name = wasmExports2["ts_language_symbol_name"];
    Module["_ts_language_symbol_for_name"] = _ts_language_symbol_for_name = wasmExports2["ts_language_symbol_for_name"];
    Module["_strncmp"] = _strncmp = wasmExports2["strncmp"];
    Module["_ts_language_symbol_type"] = _ts_language_symbol_type = wasmExports2["ts_language_symbol_type"];
    Module["_ts_language_field_name_for_id"] = _ts_language_field_name_for_id = wasmExports2["ts_language_field_name_for_id"];
    Module["_ts_lookahead_iterator_new"] = _ts_lookahead_iterator_new = wasmExports2["ts_lookahead_iterator_new"];
    Module["_ts_lookahead_iterator_delete"] = _ts_lookahead_iterator_delete = wasmExports2["ts_lookahead_iterator_delete"];
    Module["_ts_lookahead_iterator_reset_state"] = _ts_lookahead_iterator_reset_state = wasmExports2["ts_lookahead_iterator_reset_state"];
    Module["_ts_lookahead_iterator_reset"] = _ts_lookahead_iterator_reset = wasmExports2["ts_lookahead_iterator_reset"];
    Module["_ts_lookahead_iterator_next"] = _ts_lookahead_iterator_next = wasmExports2["ts_lookahead_iterator_next"];
    Module["_ts_lookahead_iterator_current_symbol"] = _ts_lookahead_iterator_current_symbol = wasmExports2["ts_lookahead_iterator_current_symbol"];
    Module["_ts_point_edit"] = _ts_point_edit = wasmExports2["ts_point_edit"];
    Module["_ts_parser_delete"] = _ts_parser_delete = wasmExports2["ts_parser_delete"];
    Module["_ts_parser_reset"] = _ts_parser_reset = wasmExports2["ts_parser_reset"];
    Module["_ts_parser_set_language"] = _ts_parser_set_language = wasmExports2["ts_parser_set_language"];
    Module["_ts_parser_set_included_ranges"] = _ts_parser_set_included_ranges = wasmExports2["ts_parser_set_included_ranges"];
    Module["_ts_query_new"] = _ts_query_new = wasmExports2["ts_query_new"];
    Module["_ts_query_delete"] = _ts_query_delete = wasmExports2["ts_query_delete"];
    Module["_iswspace"] = _iswspace = wasmExports2["iswspace"];
    Module["_iswalnum"] = _iswalnum = wasmExports2["iswalnum"];
    Module["_ts_query_pattern_count"] = _ts_query_pattern_count = wasmExports2["ts_query_pattern_count"];
    Module["_ts_query_capture_count"] = _ts_query_capture_count = wasmExports2["ts_query_capture_count"];
    Module["_ts_query_string_count"] = _ts_query_string_count = wasmExports2["ts_query_string_count"];
    Module["_ts_query_capture_name_for_id"] = _ts_query_capture_name_for_id = wasmExports2["ts_query_capture_name_for_id"];
    Module["_ts_query_capture_quantifier_for_id"] = _ts_query_capture_quantifier_for_id = wasmExports2["ts_query_capture_quantifier_for_id"];
    Module["_ts_query_string_value_for_id"] = _ts_query_string_value_for_id = wasmExports2["ts_query_string_value_for_id"];
    Module["_ts_query_predicates_for_pattern"] = _ts_query_predicates_for_pattern = wasmExports2["ts_query_predicates_for_pattern"];
    Module["_ts_query_start_byte_for_pattern"] = _ts_query_start_byte_for_pattern = wasmExports2["ts_query_start_byte_for_pattern"];
    Module["_ts_query_end_byte_for_pattern"] = _ts_query_end_byte_for_pattern = wasmExports2["ts_query_end_byte_for_pattern"];
    Module["_ts_query_is_pattern_rooted"] = _ts_query_is_pattern_rooted = wasmExports2["ts_query_is_pattern_rooted"];
    Module["_ts_query_is_pattern_non_local"] = _ts_query_is_pattern_non_local = wasmExports2["ts_query_is_pattern_non_local"];
    Module["_ts_query_is_pattern_guaranteed_at_step"] = _ts_query_is_pattern_guaranteed_at_step = wasmExports2["ts_query_is_pattern_guaranteed_at_step"];
    Module["_ts_query_disable_capture"] = _ts_query_disable_capture = wasmExports2["ts_query_disable_capture"];
    Module["_ts_query_disable_pattern"] = _ts_query_disable_pattern = wasmExports2["ts_query_disable_pattern"];
    Module["_ts_tree_copy"] = _ts_tree_copy = wasmExports2["ts_tree_copy"];
    Module["_ts_tree_delete"] = _ts_tree_delete = wasmExports2["ts_tree_delete"];
    Module["_ts_init"] = _ts_init = wasmExports2["ts_init"];
    Module["_ts_parser_new_wasm"] = _ts_parser_new_wasm = wasmExports2["ts_parser_new_wasm"];
    Module["_ts_parser_enable_logger_wasm"] = _ts_parser_enable_logger_wasm = wasmExports2["ts_parser_enable_logger_wasm"];
    Module["_ts_parser_parse_wasm"] = _ts_parser_parse_wasm = wasmExports2["ts_parser_parse_wasm"];
    Module["_ts_parser_included_ranges_wasm"] = _ts_parser_included_ranges_wasm = wasmExports2["ts_parser_included_ranges_wasm"];
    Module["_ts_language_type_is_named_wasm"] = _ts_language_type_is_named_wasm = wasmExports2["ts_language_type_is_named_wasm"];
    Module["_ts_language_type_is_visible_wasm"] = _ts_language_type_is_visible_wasm = wasmExports2["ts_language_type_is_visible_wasm"];
    Module["_ts_language_metadata_wasm"] = _ts_language_metadata_wasm = wasmExports2["ts_language_metadata_wasm"];
    Module["_ts_language_supertypes_wasm"] = _ts_language_supertypes_wasm = wasmExports2["ts_language_supertypes_wasm"];
    Module["_ts_language_subtypes_wasm"] = _ts_language_subtypes_wasm = wasmExports2["ts_language_subtypes_wasm"];
    Module["_ts_tree_root_node_wasm"] = _ts_tree_root_node_wasm = wasmExports2["ts_tree_root_node_wasm"];
    Module["_ts_tree_root_node_with_offset_wasm"] = _ts_tree_root_node_with_offset_wasm = wasmExports2["ts_tree_root_node_with_offset_wasm"];
    Module["_ts_tree_edit_wasm"] = _ts_tree_edit_wasm = wasmExports2["ts_tree_edit_wasm"];
    Module["_ts_tree_included_ranges_wasm"] = _ts_tree_included_ranges_wasm = wasmExports2["ts_tree_included_ranges_wasm"];
    Module["_ts_tree_get_changed_ranges_wasm"] = _ts_tree_get_changed_ranges_wasm = wasmExports2["ts_tree_get_changed_ranges_wasm"];
    Module["_ts_tree_cursor_new_wasm"] = _ts_tree_cursor_new_wasm = wasmExports2["ts_tree_cursor_new_wasm"];
    Module["_ts_tree_cursor_copy_wasm"] = _ts_tree_cursor_copy_wasm = wasmExports2["ts_tree_cursor_copy_wasm"];
    Module["_ts_tree_cursor_delete_wasm"] = _ts_tree_cursor_delete_wasm = wasmExports2["ts_tree_cursor_delete_wasm"];
    Module["_ts_tree_cursor_reset_wasm"] = _ts_tree_cursor_reset_wasm = wasmExports2["ts_tree_cursor_reset_wasm"];
    Module["_ts_tree_cursor_reset_to_wasm"] = _ts_tree_cursor_reset_to_wasm = wasmExports2["ts_tree_cursor_reset_to_wasm"];
    Module["_ts_tree_cursor_goto_first_child_wasm"] = _ts_tree_cursor_goto_first_child_wasm = wasmExports2["ts_tree_cursor_goto_first_child_wasm"];
    Module["_ts_tree_cursor_goto_last_child_wasm"] = _ts_tree_cursor_goto_last_child_wasm = wasmExports2["ts_tree_cursor_goto_last_child_wasm"];
    Module["_ts_tree_cursor_goto_first_child_for_index_wasm"] = _ts_tree_cursor_goto_first_child_for_index_wasm = wasmExports2["ts_tree_cursor_goto_first_child_for_index_wasm"];
    Module["_ts_tree_cursor_goto_first_child_for_position_wasm"] = _ts_tree_cursor_goto_first_child_for_position_wasm = wasmExports2["ts_tree_cursor_goto_first_child_for_position_wasm"];
    Module["_ts_tree_cursor_goto_next_sibling_wasm"] = _ts_tree_cursor_goto_next_sibling_wasm = wasmExports2["ts_tree_cursor_goto_next_sibling_wasm"];
    Module["_ts_tree_cursor_goto_previous_sibling_wasm"] = _ts_tree_cursor_goto_previous_sibling_wasm = wasmExports2["ts_tree_cursor_goto_previous_sibling_wasm"];
    Module["_ts_tree_cursor_goto_descendant_wasm"] = _ts_tree_cursor_goto_descendant_wasm = wasmExports2["ts_tree_cursor_goto_descendant_wasm"];
    Module["_ts_tree_cursor_goto_parent_wasm"] = _ts_tree_cursor_goto_parent_wasm = wasmExports2["ts_tree_cursor_goto_parent_wasm"];
    Module["_ts_tree_cursor_current_node_type_id_wasm"] = _ts_tree_cursor_current_node_type_id_wasm = wasmExports2["ts_tree_cursor_current_node_type_id_wasm"];
    Module["_ts_tree_cursor_current_node_state_id_wasm"] = _ts_tree_cursor_current_node_state_id_wasm = wasmExports2["ts_tree_cursor_current_node_state_id_wasm"];
    Module["_ts_tree_cursor_current_node_is_named_wasm"] = _ts_tree_cursor_current_node_is_named_wasm = wasmExports2["ts_tree_cursor_current_node_is_named_wasm"];
    Module["_ts_tree_cursor_current_node_is_missing_wasm"] = _ts_tree_cursor_current_node_is_missing_wasm = wasmExports2["ts_tree_cursor_current_node_is_missing_wasm"];
    Module["_ts_tree_cursor_current_node_id_wasm"] = _ts_tree_cursor_current_node_id_wasm = wasmExports2["ts_tree_cursor_current_node_id_wasm"];
    Module["_ts_tree_cursor_start_position_wasm"] = _ts_tree_cursor_start_position_wasm = wasmExports2["ts_tree_cursor_start_position_wasm"];
    Module["_ts_tree_cursor_end_position_wasm"] = _ts_tree_cursor_end_position_wasm = wasmExports2["ts_tree_cursor_end_position_wasm"];
    Module["_ts_tree_cursor_start_index_wasm"] = _ts_tree_cursor_start_index_wasm = wasmExports2["ts_tree_cursor_start_index_wasm"];
    Module["_ts_tree_cursor_end_index_wasm"] = _ts_tree_cursor_end_index_wasm = wasmExports2["ts_tree_cursor_end_index_wasm"];
    Module["_ts_tree_cursor_current_field_id_wasm"] = _ts_tree_cursor_current_field_id_wasm = wasmExports2["ts_tree_cursor_current_field_id_wasm"];
    Module["_ts_tree_cursor_current_depth_wasm"] = _ts_tree_cursor_current_depth_wasm = wasmExports2["ts_tree_cursor_current_depth_wasm"];
    Module["_ts_tree_cursor_current_descendant_index_wasm"] = _ts_tree_cursor_current_descendant_index_wasm = wasmExports2["ts_tree_cursor_current_descendant_index_wasm"];
    Module["_ts_tree_cursor_current_node_wasm"] = _ts_tree_cursor_current_node_wasm = wasmExports2["ts_tree_cursor_current_node_wasm"];
    Module["_ts_node_symbol_wasm"] = _ts_node_symbol_wasm = wasmExports2["ts_node_symbol_wasm"];
    Module["_ts_node_field_name_for_child_wasm"] = _ts_node_field_name_for_child_wasm = wasmExports2["ts_node_field_name_for_child_wasm"];
    Module["_ts_node_field_name_for_named_child_wasm"] = _ts_node_field_name_for_named_child_wasm = wasmExports2["ts_node_field_name_for_named_child_wasm"];
    Module["_ts_node_children_by_field_id_wasm"] = _ts_node_children_by_field_id_wasm = wasmExports2["ts_node_children_by_field_id_wasm"];
    Module["_ts_node_first_child_for_byte_wasm"] = _ts_node_first_child_for_byte_wasm = wasmExports2["ts_node_first_child_for_byte_wasm"];
    Module["_ts_node_first_named_child_for_byte_wasm"] = _ts_node_first_named_child_for_byte_wasm = wasmExports2["ts_node_first_named_child_for_byte_wasm"];
    Module["_ts_node_grammar_symbol_wasm"] = _ts_node_grammar_symbol_wasm = wasmExports2["ts_node_grammar_symbol_wasm"];
    Module["_ts_node_child_count_wasm"] = _ts_node_child_count_wasm = wasmExports2["ts_node_child_count_wasm"];
    Module["_ts_node_named_child_count_wasm"] = _ts_node_named_child_count_wasm = wasmExports2["ts_node_named_child_count_wasm"];
    Module["_ts_node_child_wasm"] = _ts_node_child_wasm = wasmExports2["ts_node_child_wasm"];
    Module["_ts_node_named_child_wasm"] = _ts_node_named_child_wasm = wasmExports2["ts_node_named_child_wasm"];
    Module["_ts_node_child_by_field_id_wasm"] = _ts_node_child_by_field_id_wasm = wasmExports2["ts_node_child_by_field_id_wasm"];
    Module["_ts_node_next_sibling_wasm"] = _ts_node_next_sibling_wasm = wasmExports2["ts_node_next_sibling_wasm"];
    Module["_ts_node_prev_sibling_wasm"] = _ts_node_prev_sibling_wasm = wasmExports2["ts_node_prev_sibling_wasm"];
    Module["_ts_node_next_named_sibling_wasm"] = _ts_node_next_named_sibling_wasm = wasmExports2["ts_node_next_named_sibling_wasm"];
    Module["_ts_node_prev_named_sibling_wasm"] = _ts_node_prev_named_sibling_wasm = wasmExports2["ts_node_prev_named_sibling_wasm"];
    Module["_ts_node_descendant_count_wasm"] = _ts_node_descendant_count_wasm = wasmExports2["ts_node_descendant_count_wasm"];
    Module["_ts_node_parent_wasm"] = _ts_node_parent_wasm = wasmExports2["ts_node_parent_wasm"];
    Module["_ts_node_child_with_descendant_wasm"] = _ts_node_child_with_descendant_wasm = wasmExports2["ts_node_child_with_descendant_wasm"];
    Module["_ts_node_descendant_for_index_wasm"] = _ts_node_descendant_for_index_wasm = wasmExports2["ts_node_descendant_for_index_wasm"];
    Module["_ts_node_named_descendant_for_index_wasm"] = _ts_node_named_descendant_for_index_wasm = wasmExports2["ts_node_named_descendant_for_index_wasm"];
    Module["_ts_node_descendant_for_position_wasm"] = _ts_node_descendant_for_position_wasm = wasmExports2["ts_node_descendant_for_position_wasm"];
    Module["_ts_node_named_descendant_for_position_wasm"] = _ts_node_named_descendant_for_position_wasm = wasmExports2["ts_node_named_descendant_for_position_wasm"];
    Module["_ts_node_start_point_wasm"] = _ts_node_start_point_wasm = wasmExports2["ts_node_start_point_wasm"];
    Module["_ts_node_end_point_wasm"] = _ts_node_end_point_wasm = wasmExports2["ts_node_end_point_wasm"];
    Module["_ts_node_start_index_wasm"] = _ts_node_start_index_wasm = wasmExports2["ts_node_start_index_wasm"];
    Module["_ts_node_end_index_wasm"] = _ts_node_end_index_wasm = wasmExports2["ts_node_end_index_wasm"];
    Module["_ts_node_to_string_wasm"] = _ts_node_to_string_wasm = wasmExports2["ts_node_to_string_wasm"];
    Module["_ts_node_children_wasm"] = _ts_node_children_wasm = wasmExports2["ts_node_children_wasm"];
    Module["_ts_node_named_children_wasm"] = _ts_node_named_children_wasm = wasmExports2["ts_node_named_children_wasm"];
    Module["_ts_node_descendants_of_type_wasm"] = _ts_node_descendants_of_type_wasm = wasmExports2["ts_node_descendants_of_type_wasm"];
    Module["_ts_node_is_named_wasm"] = _ts_node_is_named_wasm = wasmExports2["ts_node_is_named_wasm"];
    Module["_ts_node_has_changes_wasm"] = _ts_node_has_changes_wasm = wasmExports2["ts_node_has_changes_wasm"];
    Module["_ts_node_has_error_wasm"] = _ts_node_has_error_wasm = wasmExports2["ts_node_has_error_wasm"];
    Module["_ts_node_is_error_wasm"] = _ts_node_is_error_wasm = wasmExports2["ts_node_is_error_wasm"];
    Module["_ts_node_is_missing_wasm"] = _ts_node_is_missing_wasm = wasmExports2["ts_node_is_missing_wasm"];
    Module["_ts_node_is_extra_wasm"] = _ts_node_is_extra_wasm = wasmExports2["ts_node_is_extra_wasm"];
    Module["_ts_node_parse_state_wasm"] = _ts_node_parse_state_wasm = wasmExports2["ts_node_parse_state_wasm"];
    Module["_ts_node_next_parse_state_wasm"] = _ts_node_next_parse_state_wasm = wasmExports2["ts_node_next_parse_state_wasm"];
    Module["_ts_query_matches_wasm"] = _ts_query_matches_wasm = wasmExports2["ts_query_matches_wasm"];
    Module["_ts_query_captures_wasm"] = _ts_query_captures_wasm = wasmExports2["ts_query_captures_wasm"];
    Module["_memset"] = _memset = wasmExports2["memset"];
    Module["_memcpy"] = _memcpy = wasmExports2["memcpy"];
    Module["_memmove"] = _memmove = wasmExports2["memmove"];
    Module["_iswalpha"] = _iswalpha = wasmExports2["iswalpha"];
    Module["_iswblank"] = _iswblank = wasmExports2["iswblank"];
    Module["_iswdigit"] = _iswdigit = wasmExports2["iswdigit"];
    Module["_iswlower"] = _iswlower = wasmExports2["iswlower"];
    Module["_iswupper"] = _iswupper = wasmExports2["iswupper"];
    Module["_iswxdigit"] = _iswxdigit = wasmExports2["iswxdigit"];
    Module["_memchr"] = _memchr = wasmExports2["memchr"];
    Module["_strlen"] = _strlen = wasmExports2["strlen"];
    Module["_strcmp"] = _strcmp = wasmExports2["strcmp"];
    Module["_strncat"] = _strncat = wasmExports2["strncat"];
    Module["_strncpy"] = _strncpy = wasmExports2["strncpy"];
    Module["_towlower"] = _towlower = wasmExports2["towlower"];
    Module["_towupper"] = _towupper = wasmExports2["towupper"];
    _setThrew = wasmExports2["setThrew"];
    __emscripten_stack_restore = wasmExports2["_emscripten_stack_restore"];
    __emscripten_stack_alloc = wasmExports2["_emscripten_stack_alloc"];
    _emscripten_stack_get_current = wasmExports2["emscripten_stack_get_current"];
    ___wasm_apply_data_relocs = wasmExports2["__wasm_apply_data_relocs"];
  }
  __name(assignWasmExports, "assignWasmExports");
  var wasmImports = {
    /** @export */
    __heap_base: ___heap_base,
    /** @export */
    __indirect_function_table: wasmTable,
    /** @export */
    __memory_base: ___memory_base,
    /** @export */
    __stack_high: ___stack_high,
    /** @export */
    __stack_low: ___stack_low,
    /** @export */
    __stack_pointer: ___stack_pointer,
    /** @export */
    __table_base: ___table_base,
    /** @export */
    _abort_js: __abort_js,
    /** @export */
    emscripten_resize_heap: _emscripten_resize_heap,
    /** @export */
    fd_close: _fd_close,
    /** @export */
    fd_seek: _fd_seek,
    /** @export */
    fd_write: _fd_write,
    /** @export */
    memory: wasmMemory,
    /** @export */
    tree_sitter_log_callback: _tree_sitter_log_callback,
    /** @export */
    tree_sitter_parse_callback: _tree_sitter_parse_callback,
    /** @export */
    tree_sitter_progress_callback: _tree_sitter_progress_callback,
    /** @export */
    tree_sitter_query_progress_callback: _tree_sitter_query_progress_callback
  };
  function callMain(args2 = []) {
    var entryFunction = resolveGlobalSymbol("main").sym;
    if (!entryFunction) return;
    args2.unshift(thisProgram);
    var argc = args2.length;
    var argv = stackAlloc((argc + 1) * 4);
    var argv_ptr = argv;
    args2.forEach((arg) => {
      LE_HEAP_STORE_U32((argv_ptr >> 2) * 4, stringToUTF8OnStack(arg));
      argv_ptr += 4;
    });
    LE_HEAP_STORE_U32((argv_ptr >> 2) * 4, 0);
    try {
      var ret = entryFunction(argc, argv);
      exitJS(
        ret,
        /* implicit = */
        true
      );
      return ret;
    } catch (e) {
      return handleException(e);
    }
  }
  __name(callMain, "callMain");
  function run(args2 = arguments_) {
    if (runDependencies > 0) {
      dependenciesFulfilled = run;
      return;
    }
    preRun();
    if (runDependencies > 0) {
      dependenciesFulfilled = run;
      return;
    }
    function doRun() {
      Module["calledRun"] = true;
      if (ABORT) return;
      initRuntime();
      preMain();
      readyPromiseResolve?.(Module);
      Module["onRuntimeInitialized"]?.();
      var noInitialRun = Module["noInitialRun"] || false;
      if (!noInitialRun) callMain(args2);
      postRun();
    }
    __name(doRun, "doRun");
    if (Module["setStatus"]) {
      Module["setStatus"]("Running...");
      setTimeout(() => {
        setTimeout(() => Module["setStatus"](""), 1);
        doRun();
      }, 1);
    } else {
      doRun();
    }
  }
  __name(run, "run");
  var wasmExports;
  wasmExports = await createWasm();
  run();
  if (runtimeInitialized) {
    moduleRtn = Module;
  } else {
    moduleRtn = new Promise((resolve22, reject) => {
      readyPromiseResolve = resolve22;
      readyPromiseReject = reject;
    });
  }
  return moduleRtn;
}
async function initializeBinding(moduleOptions) {
  return Module3 ??= await web_tree_sitter_default(moduleOptions);
}
function checkModule() {
  return !!Module3;
}
function parseAnyPredicate(steps, index, operator, textPredicates) {
  if (steps.length !== 3) {
    throw new Error(
      `Wrong number of arguments to \`#${operator}\` predicate. Expected 2, got ${steps.length - 1}`
    );
  }
  if (!isCaptureStep(steps[1])) {
    throw new Error(
      `First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}"`
    );
  }
  const isPositive = operator === "eq?" || operator === "any-eq?";
  const matchAll = !operator.startsWith("any-");
  if (isCaptureStep(steps[2])) {
    const captureName1 = steps[1].name;
    const captureName2 = steps[2].name;
    textPredicates[index].push((captures) => {
      const nodes1 = [];
      const nodes2 = [];
      for (const c2 of captures) {
        if (c2.name === captureName1) nodes1.push(c2.node);
        if (c2.name === captureName2) nodes2.push(c2.node);
      }
      const compare = /* @__PURE__ */ __name((n1, n2, positive) => {
        return positive ? n1.text === n2.text : n1.text !== n2.text;
      }, "compare");
      return matchAll ? nodes1.every((n1) => nodes2.some((n2) => compare(n1, n2, isPositive))) : nodes1.some((n1) => nodes2.some((n2) => compare(n1, n2, isPositive)));
    });
  } else {
    const captureName = steps[1].name;
    const stringValue = steps[2].value;
    const matches = /* @__PURE__ */ __name((n) => n.text === stringValue, "matches");
    const doesNotMatch = /* @__PURE__ */ __name((n) => n.text !== stringValue, "doesNotMatch");
    textPredicates[index].push((captures) => {
      const nodes = [];
      for (const c2 of captures) {
        if (c2.name === captureName) nodes.push(c2.node);
      }
      const test = isPositive ? matches : doesNotMatch;
      return matchAll ? nodes.every(test) : nodes.some(test);
    });
  }
}
function parseMatchPredicate(steps, index, operator, textPredicates) {
  if (steps.length !== 3) {
    throw new Error(
      `Wrong number of arguments to \`#${operator}\` predicate. Expected 2, got ${steps.length - 1}.`
    );
  }
  if (steps[1].type !== "capture") {
    throw new Error(
      `First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}".`
    );
  }
  if (steps[2].type !== "string") {
    throw new Error(
      `Second argument of \`#${operator}\` predicate must be a string. Got @${steps[2].name}.`
    );
  }
  const isPositive = operator === "match?" || operator === "any-match?";
  const matchAll = !operator.startsWith("any-");
  const captureName = steps[1].name;
  const regex = new RegExp(steps[2].value);
  textPredicates[index].push((captures) => {
    const nodes = [];
    for (const c2 of captures) {
      if (c2.name === captureName) nodes.push(c2.node.text);
    }
    const test = /* @__PURE__ */ __name((text, positive) => {
      return positive ? regex.test(text) : !regex.test(text);
    }, "test");
    if (nodes.length === 0) return !isPositive;
    return matchAll ? nodes.every((text) => test(text, isPositive)) : nodes.some((text) => test(text, isPositive));
  });
}
function parseAnyOfPredicate(steps, index, operator, textPredicates) {
  if (steps.length < 2) {
    throw new Error(
      `Wrong number of arguments to \`#${operator}\` predicate. Expected at least 1. Got ${steps.length - 1}.`
    );
  }
  if (steps[1].type !== "capture") {
    throw new Error(
      `First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}".`
    );
  }
  const isPositive = operator === "any-of?";
  const captureName = steps[1].name;
  const stringSteps = steps.slice(2);
  if (!stringSteps.every(isStringStep)) {
    throw new Error(
      `Arguments to \`#${operator}\` predicate must be strings.".`
    );
  }
  const values = stringSteps.map((s) => s.value);
  textPredicates[index].push((captures) => {
    const nodes = [];
    for (const c2 of captures) {
      if (c2.name === captureName) nodes.push(c2.node.text);
    }
    if (nodes.length === 0) return !isPositive;
    return nodes.every((text) => values.includes(text)) === isPositive;
  });
}
function parseIsPredicate(steps, index, operator, assertedProperties, refutedProperties) {
  if (steps.length < 2 || steps.length > 3) {
    throw new Error(
      `Wrong number of arguments to \`#${operator}\` predicate. Expected 1 or 2. Got ${steps.length - 1}.`
    );
  }
  if (!steps.every(isStringStep)) {
    throw new Error(
      `Arguments to \`#${operator}\` predicate must be strings.".`
    );
  }
  const properties = operator === "is?" ? assertedProperties : refutedProperties;
  if (!properties[index]) properties[index] = {};
  properties[index][steps[1].value] = steps[2]?.value ?? null;
}
function parseSetDirective(steps, index, setProperties) {
  if (steps.length < 2 || steps.length > 3) {
    throw new Error(`Wrong number of arguments to \`#set!\` predicate. Expected 1 or 2. Got ${steps.length - 1}.`);
  }
  if (!steps.every(isStringStep)) {
    throw new Error(`Arguments to \`#set!\` predicate must be strings.".`);
  }
  if (!setProperties[index]) setProperties[index] = {};
  setProperties[index][steps[1].value] = steps[2]?.value ?? null;
}
function parsePattern(index, stepType, stepValueId, captureNames, stringValues, steps, textPredicates, predicates, setProperties, assertedProperties, refutedProperties) {
  if (stepType === PREDICATE_STEP_TYPE_CAPTURE) {
    const name2 = captureNames[stepValueId];
    steps.push({ type: "capture", name: name2 });
  } else if (stepType === PREDICATE_STEP_TYPE_STRING) {
    steps.push({ type: "string", value: stringValues[stepValueId] });
  } else if (steps.length > 0) {
    if (steps[0].type !== "string") {
      throw new Error("Predicates must begin with a literal value");
    }
    const operator = steps[0].value;
    switch (operator) {
      case "any-not-eq?":
      case "not-eq?":
      case "any-eq?":
      case "eq?":
        parseAnyPredicate(steps, index, operator, textPredicates);
        break;
      case "any-not-match?":
      case "not-match?":
      case "any-match?":
      case "match?":
        parseMatchPredicate(steps, index, operator, textPredicates);
        break;
      case "not-any-of?":
      case "any-of?":
        parseAnyOfPredicate(steps, index, operator, textPredicates);
        break;
      case "is?":
      case "is-not?":
        parseIsPredicate(steps, index, operator, assertedProperties, refutedProperties);
        break;
      case "set!":
        parseSetDirective(steps, index, setProperties);
        break;
      default:
        predicates[index].push({ operator, operands: steps.slice(1) });
    }
    steps.length = 0;
  }
}
var __defProp2;
var __name;
var Edit;
var SIZE_OF_SHORT;
var SIZE_OF_INT;
var SIZE_OF_CURSOR;
var SIZE_OF_NODE;
var SIZE_OF_POINT;
var SIZE_OF_RANGE;
var ZERO_POINT;
var INTERNAL;
var C;
var LookaheadIterator;
var Tree;
var TreeCursor;
var Node;
var LANGUAGE_FUNCTION_REGEX;
var Language;
var web_tree_sitter_default;
var Module3;
var TRANSFER_BUFFER;
var LANGUAGE_VERSION;
var MIN_COMPATIBLE_VERSION;
var Parser;
var PREDICATE_STEP_TYPE_CAPTURE;
var PREDICATE_STEP_TYPE_STRING;
var QUERY_WORD_REGEX;
var CaptureQuantifier;
var isCaptureStep;
var isStringStep;
var QueryErrorKind;
var QueryError;
var Query;
var init_web_tree_sitter = __esm({
  "node_modules/.pnpm/web-tree-sitter@0.26.11/node_modules/web-tree-sitter/web-tree-sitter.js"() {
    "use strict";
    __defProp2 = Object.defineProperty;
    __name = (target, value) => __defProp2(target, "name", { value, configurable: true });
    Edit = class {
      static {
        __name(this, "Edit");
      }
      /** The start position of the change. */
      startPosition;
      /** The end position of the change before the edit. */
      oldEndPosition;
      /** The end position of the change after the edit. */
      newEndPosition;
      /** The start index of the change. */
      startIndex;
      /** The end index of the change before the edit. */
      oldEndIndex;
      /** The end index of the change after the edit. */
      newEndIndex;
      constructor({
        startIndex,
        oldEndIndex,
        newEndIndex,
        startPosition,
        oldEndPosition,
        newEndPosition
      }) {
        this.startIndex = startIndex >>> 0;
        this.oldEndIndex = oldEndIndex >>> 0;
        this.newEndIndex = newEndIndex >>> 0;
        this.startPosition = startPosition;
        this.oldEndPosition = oldEndPosition;
        this.newEndPosition = newEndPosition;
      }
      /**
       * Edit a point and index to keep it in-sync with source code that has been edited.
       *
       * This function updates a single point's byte offset and row/column position
       * based on an edit operation. This is useful for editing points without
       * requiring a tree or node instance.
       */
      editPoint(point, index) {
        let newIndex = index;
        const newPoint = { ...point };
        if (index >= this.oldEndIndex) {
          newIndex = this.newEndIndex + (index - this.oldEndIndex);
          const originalRow = point.row;
          newPoint.row = this.newEndPosition.row + (point.row - this.oldEndPosition.row);
          newPoint.column = originalRow === this.oldEndPosition.row ? this.newEndPosition.column + (point.column - this.oldEndPosition.column) : point.column;
        } else if (index > this.startIndex) {
          newIndex = this.newEndIndex;
          newPoint.row = this.newEndPosition.row;
          newPoint.column = this.newEndPosition.column;
        }
        return { point: newPoint, index: newIndex };
      }
      /**
       * Edit a range to keep it in-sync with source code that has been edited.
       *
       * This function updates a range's start and end positions based on an edit
       * operation. This is useful for editing ranges without requiring a tree
       * or node instance.
       */
      editRange(range) {
        const newRange = {
          startIndex: range.startIndex,
          startPosition: { ...range.startPosition },
          endIndex: range.endIndex,
          endPosition: { ...range.endPosition }
        };
        if (range.endIndex >= this.oldEndIndex) {
          if (range.endIndex !== Number.MAX_SAFE_INTEGER) {
            newRange.endIndex = this.newEndIndex + (range.endIndex - this.oldEndIndex);
            newRange.endPosition = {
              row: this.newEndPosition.row + (range.endPosition.row - this.oldEndPosition.row),
              column: range.endPosition.row === this.oldEndPosition.row ? this.newEndPosition.column + (range.endPosition.column - this.oldEndPosition.column) : range.endPosition.column
            };
            if (newRange.endIndex < this.newEndIndex) {
              newRange.endIndex = Number.MAX_SAFE_INTEGER;
              newRange.endPosition = { row: Number.MAX_SAFE_INTEGER, column: Number.MAX_SAFE_INTEGER };
            }
          }
        } else if (range.endIndex > this.startIndex) {
          newRange.endIndex = this.startIndex;
          newRange.endPosition = { ...this.startPosition };
        }
        if (range.startIndex >= this.oldEndIndex) {
          newRange.startIndex = this.newEndIndex + (range.startIndex - this.oldEndIndex);
          newRange.startPosition = {
            row: this.newEndPosition.row + (range.startPosition.row - this.oldEndPosition.row),
            column: range.startPosition.row === this.oldEndPosition.row ? this.newEndPosition.column + (range.startPosition.column - this.oldEndPosition.column) : range.startPosition.column
          };
          if (newRange.startIndex < this.newEndIndex) {
            newRange.startIndex = Number.MAX_SAFE_INTEGER;
            newRange.startPosition = { row: Number.MAX_SAFE_INTEGER, column: Number.MAX_SAFE_INTEGER };
          }
        } else if (range.startIndex > this.startIndex) {
          newRange.startIndex = this.startIndex;
          newRange.startPosition = { ...this.startPosition };
        }
        return newRange;
      }
    };
    SIZE_OF_SHORT = 2;
    SIZE_OF_INT = 4;
    SIZE_OF_CURSOR = 4 * SIZE_OF_INT;
    SIZE_OF_NODE = 5 * SIZE_OF_INT;
    SIZE_OF_POINT = 2 * SIZE_OF_INT;
    SIZE_OF_RANGE = 2 * SIZE_OF_INT + 2 * SIZE_OF_POINT;
    ZERO_POINT = { row: 0, column: 0 };
    INTERNAL = /* @__PURE__ */ Symbol("INTERNAL");
    __name(assertInternal, "assertInternal");
    __name(isPoint, "isPoint");
    __name(setModule, "setModule");
    LookaheadIterator = class {
      static {
        __name(this, "LookaheadIterator");
      }
      /** @internal */
      [0] = 0;
      // Internal handle for Wasm
      /** @internal */
      language;
      /** @internal */
      constructor(internal, address, language) {
        assertInternal(internal);
        this[0] = address;
        this.language = language;
      }
      /** Get the current symbol of the lookahead iterator. */
      get currentTypeId() {
        return C._ts_lookahead_iterator_current_symbol(this[0]);
      }
      /** Get the current symbol name of the lookahead iterator. */
      get currentType() {
        return this.language.types[this.currentTypeId] || "ERROR";
      }
      /** Delete the lookahead iterator, freeing its resources. */
      delete() {
        C._ts_lookahead_iterator_delete(this[0]);
        this[0] = 0;
      }
      /**
       * Reset the lookahead iterator.
       *
       * This returns `true` if the language was set successfully and `false`
       * otherwise.
       */
      reset(language, stateId) {
        if (C._ts_lookahead_iterator_reset(this[0], language[0], stateId)) {
          this.language = language;
          return true;
        }
        return false;
      }
      /**
       * Reset the lookahead iterator to another state.
       *
       * This returns `true` if the iterator was reset to the given state and
       * `false` otherwise.
       */
      resetState(stateId) {
        return Boolean(C._ts_lookahead_iterator_reset_state(this[0], stateId));
      }
      /**
       * Returns an iterator that iterates over the symbols of the lookahead iterator.
       *
       * The iterator will yield the current symbol name as a string for each step
       * until there are no more symbols to iterate over.
       */
      [Symbol.iterator]() {
        return {
          next: /* @__PURE__ */ __name(() => {
            if (C._ts_lookahead_iterator_next(this[0])) {
              return { done: false, value: this.currentType };
            }
            return { done: true, value: "" };
          }, "next")
        };
      }
    };
    __name(getText, "getText");
    Tree = class _Tree {
      static {
        __name(this, "Tree");
      }
      /** @internal */
      [0] = 0;
      // Internal handle for Wasm
      /** @internal */
      textCallback;
      /** The language that was used to parse the syntax tree. */
      language;
      /** @internal */
      constructor(internal, address, language, textCallback) {
        assertInternal(internal);
        this[0] = address;
        this.language = language;
        this.textCallback = textCallback;
      }
      /** Create a shallow copy of the syntax tree. This is very fast. */
      copy() {
        const address = C._ts_tree_copy(this[0]);
        return new _Tree(INTERNAL, address, this.language, this.textCallback);
      }
      /** Delete the syntax tree, freeing its resources. */
      delete() {
        C._ts_tree_delete(this[0]);
        this[0] = 0;
      }
      /** Get the root node of the syntax tree. */
      get rootNode() {
        C._ts_tree_root_node_wasm(this[0]);
        return unmarshalNode(this);
      }
      /**
       * Get the root node of the syntax tree, but with its position shifted
       * forward by the given offset.
       */
      rootNodeWithOffset(offsetBytes, offsetExtent) {
        const address = TRANSFER_BUFFER + SIZE_OF_NODE;
        C.setValue(address, offsetBytes, "i32");
        marshalPoint(address + SIZE_OF_INT, offsetExtent);
        C._ts_tree_root_node_with_offset_wasm(this[0]);
        return unmarshalNode(this);
      }
      /**
       * Edit the syntax tree to keep it in sync with source code that has been
       * edited.
       *
       * You must describe the edit both in terms of byte offsets and in terms of
       * row/column coordinates.
       */
      edit(edit) {
        marshalEdit(edit);
        C._ts_tree_edit_wasm(this[0]);
      }
      /** Create a new {@link TreeCursor} starting from the root of the tree. */
      walk() {
        return this.rootNode.walk();
      }
      /**
       * Compare this old edited syntax tree to a new syntax tree representing
       * the same document, returning a sequence of ranges whose syntactic
       * structure has changed.
       *
       * For this to work correctly, this syntax tree must have been edited such
       * that its ranges match up to the new tree. Generally, you'll want to
       * call this method right after calling one of the [`Parser::parse`]
       * functions. Call it on the old tree that was passed to parse, and
       * pass the new tree that was returned from `parse`.
       */
      getChangedRanges(other) {
        if (!(other instanceof _Tree)) {
          throw new TypeError("Argument must be a Tree");
        }
        C._ts_tree_get_changed_ranges_wasm(this[0], other[0]);
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const result = new Array(count);
        if (count > 0) {
          let address = buffer;
          for (let i2 = 0; i2 < count; i2++) {
            result[i2] = unmarshalRange(address);
            address += SIZE_OF_RANGE;
          }
          C._free(buffer);
        }
        return result;
      }
      /** Get the included ranges that were used to parse the syntax tree. */
      getIncludedRanges() {
        C._ts_tree_included_ranges_wasm(this[0]);
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const result = new Array(count);
        if (count > 0) {
          let address = buffer;
          for (let i2 = 0; i2 < count; i2++) {
            result[i2] = unmarshalRange(address);
            address += SIZE_OF_RANGE;
          }
          C._free(buffer);
        }
        return result;
      }
    };
    TreeCursor = class _TreeCursor {
      static {
        __name(this, "TreeCursor");
      }
      /** @internal */
      // @ts-expect-error: never read
      [0] = 0;
      // Internal handle for Wasm
      /** @internal */
      // @ts-expect-error: never read
      [1] = 0;
      // Internal handle for Wasm
      /** @internal */
      // @ts-expect-error: never read
      [2] = 0;
      // Internal handle for Wasm
      /** @internal */
      // @ts-expect-error: never read
      [3] = 0;
      // Internal handle for Wasm
      /** @internal */
      tree;
      /** @internal */
      constructor(internal, tree) {
        assertInternal(internal);
        this.tree = tree;
        unmarshalTreeCursor(this);
      }
      /** Creates a deep copy of the tree cursor. This allocates new memory. */
      copy() {
        const copy = new _TreeCursor(INTERNAL, this.tree);
        C._ts_tree_cursor_copy_wasm(this.tree[0]);
        unmarshalTreeCursor(copy);
        return copy;
      }
      /** Delete the tree cursor, freeing its resources. */
      delete() {
        marshalTreeCursor(this);
        C._ts_tree_cursor_delete_wasm(this.tree[0]);
        this[0] = this[1] = this[2] = 0;
      }
      /** Get the tree cursor's current {@link Node}. */
      get currentNode() {
        marshalTreeCursor(this);
        C._ts_tree_cursor_current_node_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /**
       * Get the numerical field id of this tree cursor's current node.
       *
       * See also {@link TreeCursor#currentFieldName}.
       */
      get currentFieldId() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_field_id_wasm(this.tree[0]);
      }
      /** Get the field name of this tree cursor's current node. */
      get currentFieldName() {
        return this.tree.language.fields[this.currentFieldId];
      }
      /**
       * Get the depth of the cursor's current node relative to the original
       * node that the cursor was constructed with.
       */
      get currentDepth() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_depth_wasm(this.tree[0]);
      }
      /**
       * Get the index of the cursor's current node out of all of the
       * descendants of the original node that the cursor was constructed with.
       */
      get currentDescendantIndex() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_descendant_index_wasm(this.tree[0]);
      }
      /** Get the type of the cursor's current node. */
      get nodeType() {
        return this.tree.language.types[this.nodeTypeId] || "ERROR";
      }
      /** Get the type id of the cursor's current node. */
      get nodeTypeId() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_node_type_id_wasm(this.tree[0]);
      }
      /** Get the state id of the cursor's current node. */
      get nodeStateId() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_node_state_id_wasm(this.tree[0]);
      }
      /** Get the id of the cursor's current node. */
      get nodeId() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_node_id_wasm(this.tree[0]);
      }
      /**
       * Check if the cursor's current node is *named*.
       *
       * Named nodes correspond to named rules in the grammar, whereas
       * *anonymous* nodes correspond to string literals in the grammar.
       */
      get nodeIsNamed() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_node_is_named_wasm(this.tree[0]) === 1;
      }
      /**
       * Check if the cursor's current node is *missing*.
       *
       * Missing nodes are inserted by the parser in order to recover from
       * certain kinds of syntax errors.
       */
      get nodeIsMissing() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_node_is_missing_wasm(this.tree[0]) === 1;
      }
      /** Get the string content of the cursor's current node. */
      get nodeText() {
        marshalTreeCursor(this);
        const startIndex = C._ts_tree_cursor_start_index_wasm(this.tree[0]);
        const endIndex = C._ts_tree_cursor_end_index_wasm(this.tree[0]);
        C._ts_tree_cursor_start_position_wasm(this.tree[0]);
        const startPosition = unmarshalPoint(TRANSFER_BUFFER);
        return getText(this.tree, startIndex, endIndex, startPosition);
      }
      /** Get the start position of the cursor's current node. */
      get startPosition() {
        marshalTreeCursor(this);
        C._ts_tree_cursor_start_position_wasm(this.tree[0]);
        return unmarshalPoint(TRANSFER_BUFFER);
      }
      /** Get the end position of the cursor's current node. */
      get endPosition() {
        marshalTreeCursor(this);
        C._ts_tree_cursor_end_position_wasm(this.tree[0]);
        return unmarshalPoint(TRANSFER_BUFFER);
      }
      /** Get the start index of the cursor's current node. */
      get startIndex() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_start_index_wasm(this.tree[0]);
      }
      /** Get the end index of the cursor's current node. */
      get endIndex() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_end_index_wasm(this.tree[0]);
      }
      /**
       * Move this cursor to the first child of its current node.
       *
       * This returns `true` if the cursor successfully moved, and returns
       * `false` if there were no children.
       */
      gotoFirstChild() {
        marshalTreeCursor(this);
        const result = C._ts_tree_cursor_goto_first_child_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
        return result === 1;
      }
      /**
       * Move this cursor to the last child of its current node.
       *
       * This returns `true` if the cursor successfully moved, and returns
       * `false` if there were no children.
       *
       * Note that this function may be slower than
       * {@link TreeCursor#gotoFirstChild} because it needs to
       * iterate through all the children to compute the child's position.
       */
      gotoLastChild() {
        marshalTreeCursor(this);
        const result = C._ts_tree_cursor_goto_last_child_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
        return result === 1;
      }
      /**
       * Move this cursor to the parent of its current node.
       *
       * This returns `true` if the cursor successfully moved, and returns
       * `false` if there was no parent node (the cursor was already on the
       * root node).
       *
       * Note that the node the cursor was constructed with is considered the root
       * of the cursor, and the cursor cannot walk outside this node.
       */
      gotoParent() {
        marshalTreeCursor(this);
        const result = C._ts_tree_cursor_goto_parent_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
        return result === 1;
      }
      /**
       * Move this cursor to the next sibling of its current node.
       *
       * This returns `true` if the cursor successfully moved, and returns
       * `false` if there was no next sibling node.
       *
       * Note that the node the cursor was constructed with is considered the root
       * of the cursor, and the cursor cannot walk outside this node.
       */
      gotoNextSibling() {
        marshalTreeCursor(this);
        const result = C._ts_tree_cursor_goto_next_sibling_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
        return result === 1;
      }
      /**
       * Move this cursor to the previous sibling of its current node.
       *
       * This returns `true` if the cursor successfully moved, and returns
       * `false` if there was no previous sibling node.
       *
       * Note that this function may be slower than
       * {@link TreeCursor#gotoNextSibling} due to how node
       * positions are stored. In the worst case, this will need to iterate
       * through all the children up to the previous sibling node to recalculate
       * its position. Also note that the node the cursor was constructed with is
       * considered the root of the cursor, and the cursor cannot walk outside this node.
       */
      gotoPreviousSibling() {
        marshalTreeCursor(this);
        const result = C._ts_tree_cursor_goto_previous_sibling_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
        return result === 1;
      }
      /**
       * Move the cursor to the node that is the nth descendant of
       * the original node that the cursor was constructed with, where
       * zero represents the original node itself.
       */
      gotoDescendant(goalDescendantIndex) {
        marshalTreeCursor(this);
        C._ts_tree_cursor_goto_descendant_wasm(this.tree[0], goalDescendantIndex);
        unmarshalTreeCursor(this);
      }
      /**
       * Move this cursor to the first child of its current node that contains or
       * starts after the given byte offset.
       *
       * This returns `true` if the cursor successfully moved to a child node, and returns
       * `false` if no such child was found.
       */
      gotoFirstChildForIndex(goalIndex) {
        marshalTreeCursor(this);
        C.setValue(TRANSFER_BUFFER + SIZE_OF_CURSOR, goalIndex, "i32");
        const result = C._ts_tree_cursor_goto_first_child_for_index_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
        return result === 1;
      }
      /**
       * Move this cursor to the first child of its current node that contains or
       * starts after the given byte offset.
       *
       * This returns the index of the child node if one was found, and returns
       * `null` if no such child was found.
       */
      gotoFirstChildForPosition(goalPosition) {
        marshalTreeCursor(this);
        marshalPoint(TRANSFER_BUFFER + SIZE_OF_CURSOR, goalPosition);
        const result = C._ts_tree_cursor_goto_first_child_for_position_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
        return result === 1;
      }
      /**
       * Re-initialize this tree cursor to start at the original node that the
       * cursor was constructed with.
       */
      reset(node) {
        marshalNode(node);
        marshalTreeCursor(this, TRANSFER_BUFFER + SIZE_OF_NODE);
        C._ts_tree_cursor_reset_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
      }
      /**
       * Re-initialize a tree cursor to the same position as another cursor.
       *
       * Unlike {@link TreeCursor#reset}, this will not lose parent
       * information and allows reusing already created cursors.
       */
      resetTo(cursor) {
        marshalTreeCursor(this, TRANSFER_BUFFER);
        marshalTreeCursor(cursor, TRANSFER_BUFFER + SIZE_OF_CURSOR);
        C._ts_tree_cursor_reset_to_wasm(this.tree[0], cursor.tree[0]);
        unmarshalTreeCursor(this);
      }
    };
    Node = class {
      static {
        __name(this, "Node");
      }
      /** @internal */
      // @ts-expect-error: never read
      [0] = 0;
      // Internal handle for Wasm
      /** @internal */
      _children;
      /** @internal */
      _namedChildren;
      /** @internal */
      constructor(internal, {
        id,
        tree,
        startIndex,
        startPosition,
        other
      }) {
        assertInternal(internal);
        this[0] = other;
        this.id = id;
        this.tree = tree;
        this.startIndex = startIndex;
        this.startPosition = startPosition;
      }
      /**
       * The numeric id for this node that is unique.
       *
       * Within a given syntax tree, no two nodes have the same id. However:
       *
       * * If a new tree is created based on an older tree, and a node from the old tree is reused in
       *   the process, then that node will have the same id in both trees.
       *
       * * A node not marked as having changes does not guarantee it was reused.
       *
       * * If a node is marked as having changed in the old tree, it will not be reused.
       */
      id;
      /** The byte index where this node starts. */
      startIndex;
      /** The position where this node starts. */
      startPosition;
      /** The tree that this node belongs to. */
      tree;
      /** Get this node's type as a numerical id. */
      get typeId() {
        marshalNode(this);
        return C._ts_node_symbol_wasm(this.tree[0]);
      }
      /**
       * Get the node's type as a numerical id as it appears in the grammar,
       * ignoring aliases.
       */
      get grammarId() {
        marshalNode(this);
        return C._ts_node_grammar_symbol_wasm(this.tree[0]);
      }
      /** Get this node's type as a string. */
      get type() {
        return this.tree.language.types[this.typeId] || "ERROR";
      }
      /**
       * Get this node's symbol name as it appears in the grammar, ignoring
       * aliases as a string.
       */
      get grammarType() {
        return this.tree.language.types[this.grammarId] || "ERROR";
      }
      /**
       * Check if this node is *named*.
       *
       * Named nodes correspond to named rules in the grammar, whereas
       * *anonymous* nodes correspond to string literals in the grammar.
       */
      get isNamed() {
        marshalNode(this);
        return C._ts_node_is_named_wasm(this.tree[0]) === 1;
      }
      /**
       * Check if this node is *extra*.
       *
       * Extra nodes represent things like comments, which are not required
       * by the grammar, but can appear anywhere.
       */
      get isExtra() {
        marshalNode(this);
        return C._ts_node_is_extra_wasm(this.tree[0]) === 1;
      }
      /**
       * Check if this node represents a syntax error.
       *
       * Syntax errors represent parts of the code that could not be incorporated
       * into a valid syntax tree.
       */
      get isError() {
        marshalNode(this);
        return C._ts_node_is_error_wasm(this.tree[0]) === 1;
      }
      /**
       * Check if this node is *missing*.
       *
       * Missing nodes are inserted by the parser in order to recover from
       * certain kinds of syntax errors.
       */
      get isMissing() {
        marshalNode(this);
        return C._ts_node_is_missing_wasm(this.tree[0]) === 1;
      }
      /** Check if this node has been edited. */
      get hasChanges() {
        marshalNode(this);
        return C._ts_node_has_changes_wasm(this.tree[0]) === 1;
      }
      /**
       * Check if this node represents a syntax error or contains any syntax
       * errors anywhere within it.
       */
      get hasError() {
        marshalNode(this);
        return C._ts_node_has_error_wasm(this.tree[0]) === 1;
      }
      /** Get the byte index where this node ends. */
      get endIndex() {
        marshalNode(this);
        return C._ts_node_end_index_wasm(this.tree[0]);
      }
      /** Get the position where this node ends. */
      get endPosition() {
        marshalNode(this);
        C._ts_node_end_point_wasm(this.tree[0]);
        return unmarshalPoint(TRANSFER_BUFFER);
      }
      /** Get the string content of this node. */
      get text() {
        return getText(this.tree, this.startIndex, this.endIndex, this.startPosition);
      }
      /** Get this node's parse state. */
      get parseState() {
        marshalNode(this);
        return C._ts_node_parse_state_wasm(this.tree[0]);
      }
      /** Get the parse state after this node. */
      get nextParseState() {
        marshalNode(this);
        return C._ts_node_next_parse_state_wasm(this.tree[0]);
      }
      /** Check if this node is equal to another node. */
      equals(other) {
        return this.tree === other.tree && this.id === other.id;
      }
      /**
       * Get the node's child at the given index, where zero represents the first child.
       *
       * This method is fairly fast, but its cost is technically log(n), so if
       * you might be iterating over a long list of children, you should use
       * {@link Node#children} instead.
       */
      child(index) {
        marshalNode(this);
        C._ts_node_child_wasm(this.tree[0], index);
        return unmarshalNode(this.tree);
      }
      /**
       * Get this node's *named* child at the given index.
       *
       * See also {@link Node#isNamed}.
       * This method is fairly fast, but its cost is technically log(n), so if
       * you might be iterating over a long list of children, you should use
       * {@link Node#namedChildren} instead.
       */
      namedChild(index) {
        marshalNode(this);
        C._ts_node_named_child_wasm(this.tree[0], index);
        return unmarshalNode(this.tree);
      }
      /**
       * Get this node's child with the given numerical field id.
       *
       * See also {@link Node#childForFieldName}. You can
       * convert a field name to an id using {@link Language#fieldIdForName}.
       */
      childForFieldId(fieldId) {
        marshalNode(this);
        C._ts_node_child_by_field_id_wasm(this.tree[0], fieldId);
        return unmarshalNode(this.tree);
      }
      /**
       * Get the first child with the given field name.
       *
       * If multiple children may have the same field name, access them using
       * {@link Node#childrenForFieldName}.
       */
      childForFieldName(fieldName) {
        const fieldId = this.tree.language.fields.indexOf(fieldName);
        if (fieldId !== -1) return this.childForFieldId(fieldId);
        return null;
      }
      /** Get the field name of this node's child at the given index. */
      fieldNameForChild(index) {
        marshalNode(this);
        const address = C._ts_node_field_name_for_child_wasm(this.tree[0], index);
        if (!address) return null;
        return C.AsciiToString(address);
      }
      /** Get the field name of this node's named child at the given index. */
      fieldNameForNamedChild(index) {
        marshalNode(this);
        const address = C._ts_node_field_name_for_named_child_wasm(this.tree[0], index);
        if (!address) return null;
        return C.AsciiToString(address);
      }
      /**
       * Get an array of this node's children with a given field name.
       *
       * See also {@link Node#children}.
       */
      childrenForFieldName(fieldName) {
        const fieldId = this.tree.language.fields.indexOf(fieldName);
        if (fieldId !== -1 && fieldId !== 0) return this.childrenForFieldId(fieldId);
        return [];
      }
      /**
        * Get an array of this node's children with a given field id.
        *
        * See also {@link Node#childrenForFieldName}.
        */
      childrenForFieldId(fieldId) {
        marshalNode(this);
        C._ts_node_children_by_field_id_wasm(this.tree[0], fieldId);
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const result = new Array(count);
        if (count > 0) {
          let address = buffer;
          for (let i2 = 0; i2 < count; i2++) {
            result[i2] = unmarshalNode(this.tree, address);
            address += SIZE_OF_NODE;
          }
          C._free(buffer);
        }
        return result;
      }
      /** Get the node's first child that contains or starts after the given byte offset. */
      firstChildForIndex(index) {
        marshalNode(this);
        const address = TRANSFER_BUFFER + SIZE_OF_NODE;
        C.setValue(address, index, "i32");
        C._ts_node_first_child_for_byte_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get the node's first named child that contains or starts after the given byte offset. */
      firstNamedChildForIndex(index) {
        marshalNode(this);
        const address = TRANSFER_BUFFER + SIZE_OF_NODE;
        C.setValue(address, index, "i32");
        C._ts_node_first_named_child_for_byte_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get this node's number of children. */
      get childCount() {
        marshalNode(this);
        return C._ts_node_child_count_wasm(this.tree[0]);
      }
      /**
       * Get this node's number of *named* children.
       *
       * See also {@link Node#isNamed}.
       */
      get namedChildCount() {
        marshalNode(this);
        return C._ts_node_named_child_count_wasm(this.tree[0]);
      }
      /** Get this node's first child. */
      get firstChild() {
        return this.child(0);
      }
      /**
       * Get this node's first named child.
       *
       * See also {@link Node#isNamed}.
       */
      get firstNamedChild() {
        return this.namedChild(0);
      }
      /** Get this node's last child. */
      get lastChild() {
        return this.child(this.childCount - 1);
      }
      /**
       * Get this node's last named child.
       *
       * See also {@link Node#isNamed}.
       */
      get lastNamedChild() {
        return this.namedChild(this.namedChildCount - 1);
      }
      /**
       * Iterate over this node's children.
       *
       * If you're walking the tree recursively, you may want to use the
       * {@link TreeCursor} APIs directly instead.
       */
      get children() {
        if (!this._children) {
          marshalNode(this);
          C._ts_node_children_wasm(this.tree[0]);
          const count = C.getValue(TRANSFER_BUFFER, "i32");
          const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
          this._children = new Array(count);
          if (count > 0) {
            let address = buffer;
            for (let i2 = 0; i2 < count; i2++) {
              this._children[i2] = unmarshalNode(this.tree, address);
              address += SIZE_OF_NODE;
            }
            C._free(buffer);
          }
        }
        return this._children;
      }
      /**
       * Iterate over this node's named children.
       *
       * See also {@link Node#children}.
       */
      get namedChildren() {
        if (!this._namedChildren) {
          marshalNode(this);
          C._ts_node_named_children_wasm(this.tree[0]);
          const count = C.getValue(TRANSFER_BUFFER, "i32");
          const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
          this._namedChildren = new Array(count);
          if (count > 0) {
            let address = buffer;
            for (let i2 = 0; i2 < count; i2++) {
              this._namedChildren[i2] = unmarshalNode(this.tree, address);
              address += SIZE_OF_NODE;
            }
            C._free(buffer);
          }
        }
        return this._namedChildren;
      }
      /**
       * Get the descendants of this node that are the given type, or in the given types array.
       *
       * The types array should contain node type strings, which can be retrieved from {@link Language#types}.
       *
       * Additionally, a `startPosition` and `endPosition` can be passed in to restrict the search to a byte range.
       */
      descendantsOfType(types, startPosition = ZERO_POINT, endPosition = ZERO_POINT) {
        if (!Array.isArray(types)) types = [types];
        const symbols = [];
        const typesBySymbol = this.tree.language.types;
        for (const node_type of types) {
          if (node_type == "ERROR") {
            symbols.push(65535);
          }
        }
        for (let i2 = 0, n = typesBySymbol.length; i2 < n; i2++) {
          if (types.includes(typesBySymbol[i2])) {
            symbols.push(i2);
          }
        }
        const symbolsAddress = C._malloc(SIZE_OF_INT * symbols.length);
        for (let i2 = 0, n = symbols.length; i2 < n; i2++) {
          C.setValue(symbolsAddress + i2 * SIZE_OF_INT, symbols[i2], "i32");
        }
        marshalNode(this);
        C._ts_node_descendants_of_type_wasm(
          this.tree[0],
          symbolsAddress,
          symbols.length,
          startPosition.row,
          startPosition.column,
          endPosition.row,
          endPosition.column
        );
        const descendantCount = C.getValue(TRANSFER_BUFFER, "i32");
        const descendantAddress = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const result = new Array(descendantCount);
        if (descendantCount > 0) {
          let address = descendantAddress;
          for (let i2 = 0; i2 < descendantCount; i2++) {
            result[i2] = unmarshalNode(this.tree, address);
            address += SIZE_OF_NODE;
          }
        }
        C._free(descendantAddress);
        C._free(symbolsAddress);
        return result;
      }
      /** Get this node's next sibling. */
      get nextSibling() {
        marshalNode(this);
        C._ts_node_next_sibling_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get this node's previous sibling. */
      get previousSibling() {
        marshalNode(this);
        C._ts_node_prev_sibling_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /**
       * Get this node's next *named* sibling.
       *
       * See also {@link Node#isNamed}.
       */
      get nextNamedSibling() {
        marshalNode(this);
        C._ts_node_next_named_sibling_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /**
       * Get this node's previous *named* sibling.
       *
       * See also {@link Node#isNamed}.
       */
      get previousNamedSibling() {
        marshalNode(this);
        C._ts_node_prev_named_sibling_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get the node's number of descendants, including one for the node itself. */
      get descendantCount() {
        marshalNode(this);
        return C._ts_node_descendant_count_wasm(this.tree[0]);
      }
      /**
       * Get this node's immediate parent.
       * Prefer {@link Node#childWithDescendant} for iterating over this node's ancestors.
       */
      get parent() {
        marshalNode(this);
        C._ts_node_parent_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /**
       * Get the node that contains `descendant`.
       *
       * Note that this can return `descendant` itself.
       */
      childWithDescendant(descendant) {
        marshalNode(this);
        marshalNode(descendant, 1);
        C._ts_node_child_with_descendant_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get the smallest node within this node that spans the given byte range. */
      descendantForIndex(start2, end = start2) {
        if (typeof start2 !== "number" || typeof end !== "number") {
          throw new Error("Arguments must be numbers");
        }
        marshalNode(this);
        const address = TRANSFER_BUFFER + SIZE_OF_NODE;
        C.setValue(address, start2, "i32");
        C.setValue(address + SIZE_OF_INT, end, "i32");
        C._ts_node_descendant_for_index_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get the smallest named node within this node that spans the given byte range. */
      namedDescendantForIndex(start2, end = start2) {
        if (typeof start2 !== "number" || typeof end !== "number") {
          throw new Error("Arguments must be numbers");
        }
        marshalNode(this);
        const address = TRANSFER_BUFFER + SIZE_OF_NODE;
        C.setValue(address, start2, "i32");
        C.setValue(address + SIZE_OF_INT, end, "i32");
        C._ts_node_named_descendant_for_index_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get the smallest node within this node that spans the given point range. */
      descendantForPosition(start2, end = start2) {
        if (!isPoint(start2) || !isPoint(end)) {
          throw new Error("Arguments must be {row, column} objects");
        }
        marshalNode(this);
        const address = TRANSFER_BUFFER + SIZE_OF_NODE;
        marshalPoint(address, start2);
        marshalPoint(address + SIZE_OF_POINT, end);
        C._ts_node_descendant_for_position_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get the smallest named node within this node that spans the given point range. */
      namedDescendantForPosition(start2, end = start2) {
        if (!isPoint(start2) || !isPoint(end)) {
          throw new Error("Arguments must be {row, column} objects");
        }
        marshalNode(this);
        const address = TRANSFER_BUFFER + SIZE_OF_NODE;
        marshalPoint(address, start2);
        marshalPoint(address + SIZE_OF_POINT, end);
        C._ts_node_named_descendant_for_position_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /**
       * Create a new {@link TreeCursor} starting from this node.
       *
       * Note that the given node is considered the root of the cursor,
       * and the cursor cannot walk outside this node.
       */
      walk() {
        marshalNode(this);
        C._ts_tree_cursor_new_wasm(this.tree[0]);
        return new TreeCursor(INTERNAL, this.tree);
      }
      /**
       * Edit this node to keep it in-sync with source code that has been edited.
       *
       * This function is only rarely needed. When you edit a syntax tree with
       * the {@link Tree#edit} method, all of the nodes that you retrieve from
       * the tree afterward will already reflect the edit. You only need to
       * use {@link Node#edit} when you have a specific {@link Node} instance that
       * you want to keep and continue to use after an edit.
       */
      edit(edit) {
        if (this.startIndex >= edit.oldEndIndex) {
          this.startIndex = edit.newEndIndex + (this.startIndex - edit.oldEndIndex);
          let subbedPointRow;
          let subbedPointColumn;
          if (this.startPosition.row > edit.oldEndPosition.row) {
            subbedPointRow = this.startPosition.row - edit.oldEndPosition.row;
            subbedPointColumn = this.startPosition.column;
          } else {
            subbedPointRow = 0;
            subbedPointColumn = this.startPosition.column;
            if (this.startPosition.column >= edit.oldEndPosition.column) {
              subbedPointColumn = this.startPosition.column - edit.oldEndPosition.column;
            }
          }
          if (subbedPointRow > 0) {
            this.startPosition.row += subbedPointRow;
            this.startPosition.column = subbedPointColumn;
          } else {
            this.startPosition.column += subbedPointColumn;
          }
        } else if (this.startIndex > edit.startIndex) {
          this.startIndex = edit.newEndIndex;
          this.startPosition.row = edit.newEndPosition.row;
          this.startPosition.column = edit.newEndPosition.column;
        }
      }
      /** Get the S-expression representation of this node. */
      toString() {
        marshalNode(this);
        const address = C._ts_node_to_string_wasm(this.tree[0]);
        const result = C.AsciiToString(address);
        C._free(address);
        return result;
      }
    };
    __name(unmarshalCaptures, "unmarshalCaptures");
    __name(marshalNode, "marshalNode");
    __name(unmarshalNode, "unmarshalNode");
    __name(marshalTreeCursor, "marshalTreeCursor");
    __name(unmarshalTreeCursor, "unmarshalTreeCursor");
    __name(marshalPoint, "marshalPoint");
    __name(unmarshalPoint, "unmarshalPoint");
    __name(marshalRange, "marshalRange");
    __name(unmarshalRange, "unmarshalRange");
    __name(marshalEdit, "marshalEdit");
    __name(unmarshalLanguageMetadata, "unmarshalLanguageMetadata");
    LANGUAGE_FUNCTION_REGEX = /^tree_sitter_\w+$/;
    Language = class _Language {
      static {
        __name(this, "Language");
      }
      /** @internal */
      [0] = 0;
      // Internal handle for Wasm
      /**
       * A list of all node types in the language. The index of each type in this
       * array is its node type id.
       */
      types;
      /**
       * A list of all field names in the language. The index of each field name in
       * this array is its field id.
       */
      fields;
      /** @internal */
      constructor(internal, address) {
        assertInternal(internal);
        this[0] = address;
        this.types = new Array(C._ts_language_symbol_count(this[0]));
        for (let i2 = 0, n = this.types.length; i2 < n; i2++) {
          if (C._ts_language_symbol_type(this[0], i2) < 2) {
            this.types[i2] = C.UTF8ToString(C._ts_language_symbol_name(this[0], i2));
          }
        }
        this.fields = new Array(C._ts_language_field_count(this[0]) + 1);
        for (let i2 = 0, n = this.fields.length; i2 < n; i2++) {
          const fieldName = C._ts_language_field_name_for_id(this[0], i2);
          if (fieldName !== 0) {
            this.fields[i2] = C.UTF8ToString(fieldName);
          } else {
            this.fields[i2] = null;
          }
        }
      }
      /**
       * Gets the name of the language.
       */
      get name() {
        const ptr = C._ts_language_name(this[0]);
        if (ptr === 0) return null;
        return C.UTF8ToString(ptr);
      }
      /**
       * Gets the ABI version of the language.
       */
      get abiVersion() {
        return C._ts_language_abi_version(this[0]);
      }
      /**
      * Get the metadata for this language. This information is generated by the
      * CLI, and relies on the language author providing the correct metadata in
      * the language's `tree-sitter.json` file.
      */
      get metadata() {
        C._ts_language_metadata_wasm(this[0]);
        const length = C.getValue(TRANSFER_BUFFER, "i32");
        if (length === 0) return null;
        return unmarshalLanguageMetadata(TRANSFER_BUFFER + SIZE_OF_INT);
      }
      /**
       * Gets the number of fields in the language.
       */
      get fieldCount() {
        return this.fields.length - 1;
      }
      /**
       * Gets the number of states in the language.
       */
      get stateCount() {
        return C._ts_language_state_count(this[0]);
      }
      /**
       * Get the field id for a field name.
       */
      fieldIdForName(fieldName) {
        const result = this.fields.indexOf(fieldName);
        return result !== -1 ? result : null;
      }
      /**
       * Get the field name for a field id.
       */
      fieldNameForId(fieldId) {
        return this.fields[fieldId] ?? null;
      }
      /**
       * Get the node type id for a node type name.
       */
      idForNodeType(type, named) {
        const typeLength = C.lengthBytesUTF8(type);
        const typeAddress = C._malloc(typeLength + 1);
        C.stringToUTF8(type, typeAddress, typeLength + 1);
        const result = C._ts_language_symbol_for_name(this[0], typeAddress, typeLength, named ? 1 : 0);
        C._free(typeAddress);
        return result || null;
      }
      /**
       * Gets the number of node types in the language.
       */
      get nodeTypeCount() {
        return C._ts_language_symbol_count(this[0]);
      }
      /**
       * Get the node type name for a node type id.
       */
      nodeTypeForId(typeId) {
        const name2 = C._ts_language_symbol_name(this[0], typeId);
        return name2 ? C.UTF8ToString(name2) : null;
      }
      /**
       * Check if a node type is named.
       *
       * @see {@link https://tree-sitter.github.io/tree-sitter/using-parsers/2-basic-parsing.html#named-vs-anonymous-nodes}
       */
      nodeTypeIsNamed(typeId) {
        return C._ts_language_type_is_named_wasm(this[0], typeId) ? true : false;
      }
      /**
       * Check if a node type is visible.
       */
      nodeTypeIsVisible(typeId) {
        return C._ts_language_type_is_visible_wasm(this[0], typeId) ? true : false;
      }
      /**
       * Get the supertypes ids of this language.
       *
       * @see {@link https://tree-sitter.github.io/tree-sitter/using-parsers/6-static-node-types.html?highlight=supertype#supertype-nodes}
       */
      get supertypes() {
        C._ts_language_supertypes_wasm(this[0]);
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const result = new Array(count);
        if (count > 0) {
          let address = buffer;
          for (let i2 = 0; i2 < count; i2++) {
            result[i2] = C.getValue(address, "i16");
            address += SIZE_OF_SHORT;
          }
        }
        return result;
      }
      /**
       * Get the subtype ids for a given supertype node id.
       */
      subtypes(supertype) {
        C._ts_language_subtypes_wasm(this[0], supertype);
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const result = new Array(count);
        if (count > 0) {
          let address = buffer;
          for (let i2 = 0; i2 < count; i2++) {
            result[i2] = C.getValue(address, "i16");
            address += SIZE_OF_SHORT;
          }
        }
        return result;
      }
      /**
       * Get the next state id for a given state id and node type id.
       */
      nextState(stateId, typeId) {
        return C._ts_language_next_state(this[0], stateId, typeId);
      }
      /**
       * Create a new lookahead iterator for this language and parse state.
       *
       * This returns `null` if state is invalid for this language.
       *
       * Iterating {@link LookaheadIterator} will yield valid symbols in the given
       * parse state. Newly created lookahead iterators will return the `ERROR`
       * symbol from {@link LookaheadIterator#currentType}.
       *
       * Lookahead iterators can be useful for generating suggestions and improving
       * syntax error diagnostics. To get symbols valid in an `ERROR` node, use the
       * lookahead iterator on its first leaf node state. For `MISSING` nodes, a
       * lookahead iterator created on the previous non-extra leaf node may be
       * appropriate.
       */
      lookaheadIterator(stateId) {
        const address = C._ts_lookahead_iterator_new(this[0], stateId);
        if (address) return new LookaheadIterator(INTERNAL, address, this);
        return null;
      }
      /**
       * Load a language from a WebAssembly module.
       * The module can be provided as a path to a file or as a buffer.
       */
      static async load(input) {
        let binary2;
        if (input instanceof Uint8Array) {
          binary2 = input;
        } else if (globalThis.process?.versions.node) {
          const fs2 = await import("fs/promises");
          binary2 = await fs2.readFile(input);
        } else {
          const response = await fetch(input);
          if (!response.ok) {
            const body2 = await response.text();
            throw new Error(`Language.load failed with status ${response.status}.

${body2}`);
          }
          const retryResp = response.clone();
          try {
            binary2 = await WebAssembly.compileStreaming(response);
          } catch (reason) {
            console.error("wasm streaming compile failed:", reason);
            console.error("falling back to ArrayBuffer instantiation");
            binary2 = new Uint8Array(await retryResp.arrayBuffer());
          }
        }
        const mod = await C.loadWebAssemblyModule(binary2, { loadAsync: true });
        const symbolNames = Object.keys(mod);
        const functionName = symbolNames.find((key) => LANGUAGE_FUNCTION_REGEX.test(key) && !key.includes("external_scanner_"));
        if (!functionName) {
          console.log(`Couldn't find language function in Wasm file. Symbols:
${JSON.stringify(symbolNames, null, 2)}`);
          throw new Error("Language.load failed: no language function found in Wasm file");
        }
        const languageAddress = mod[functionName]();
        return new _Language(INTERNAL, languageAddress);
      }
    };
    __name(Module2, "Module");
    web_tree_sitter_default = Module2;
    Module3 = null;
    __name(initializeBinding, "initializeBinding");
    __name(checkModule, "checkModule");
    Parser = class {
      static {
        __name(this, "Parser");
      }
      /** @internal */
      [0] = 0;
      // Internal handle for Wasm
      /** @internal */
      [1] = 0;
      // Internal handle for Wasm
      /** @internal */
      logCallback = null;
      /** The parser's current language. */
      language = null;
      /**
       * This must always be called before creating a Parser.
       *
       * You can optionally pass in options to configure the Wasm module, the most common
       * one being `locateFile` to help the module find the `.wasm` file.
       */
      static async init(moduleOptions) {
        setModule(await initializeBinding(moduleOptions));
        TRANSFER_BUFFER = C._ts_init();
        LANGUAGE_VERSION = C.getValue(TRANSFER_BUFFER, "i32");
        MIN_COMPATIBLE_VERSION = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
      }
      /**
       * Create a new parser.
       */
      constructor() {
        this.initialize();
      }
      /** @internal */
      initialize() {
        if (!checkModule()) {
          throw new Error("cannot construct a Parser before calling `init()`");
        }
        C._ts_parser_new_wasm();
        this[0] = C.getValue(TRANSFER_BUFFER, "i32");
        this[1] = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
      }
      /** Delete the parser, freeing its resources. */
      delete() {
        C._ts_parser_delete(this[0]);
        C._free(this[1]);
        this[0] = 0;
        this[1] = 0;
      }
      /**
       * Set the language that the parser should use for parsing.
       *
       * If the language was not successfully assigned, an error will be thrown.
       * This happens if the language was generated with an incompatible
       * version of the Tree-sitter CLI. Check the language's version using
       * {@link Language#version} and compare it to this library's
       * {@link LANGUAGE_VERSION} and {@link MIN_COMPATIBLE_VERSION} constants.
       */
      setLanguage(language) {
        let address;
        if (!language) {
          address = 0;
          this.language = null;
        } else if (language.constructor === Language) {
          address = language[0];
          const version = C._ts_language_abi_version(address);
          if (version < MIN_COMPATIBLE_VERSION || LANGUAGE_VERSION < version) {
            throw new Error(
              `Incompatible language version ${version}. Compatibility range ${MIN_COMPATIBLE_VERSION} through ${LANGUAGE_VERSION}.`
            );
          }
          this.language = language;
        } else {
          throw new Error("Argument must be a Language");
        }
        C._ts_parser_set_language(this[0], address);
        return this;
      }
      /**
       * Parse a slice of UTF8 text.
       *
       * @param {string | ParseCallback} callback - The UTF8-encoded text to parse or a callback function.
       *
       * @param {Tree | null} [oldTree] - A previous syntax tree parsed from the same document. If the text of the
       *   document has changed since `oldTree` was created, then you must edit `oldTree` to match
       *   the new text using {@link Tree#edit}.
       *
       * @param {ParseOptions} [options] - Options for parsing the text.
       *  This can be used to set the included ranges, or a progress callback.
       *
       * @returns {Tree | null} A {@link Tree} if parsing succeeded, or `null` if:
       *  - The parser has not yet had a language assigned with {@link Parser#setLanguage}.
       *  - The progress callback returned true.
       */
      parse(callback, oldTree, options) {
        if (typeof callback === "string") {
          C.currentParseCallback = (index) => callback.slice(index);
        } else if (typeof callback === "function") {
          C.currentParseCallback = callback;
        } else {
          throw new Error("Argument must be a string or a function");
        }
        if (options?.progressCallback) {
          C.currentProgressCallback = options.progressCallback;
        } else {
          C.currentProgressCallback = null;
        }
        if (this.logCallback) {
          C.currentLogCallback = this.logCallback;
          C._ts_parser_enable_logger_wasm(this[0], 1);
        } else {
          C.currentLogCallback = null;
          C._ts_parser_enable_logger_wasm(this[0], 0);
        }
        let rangeCount = 0;
        let rangeAddress = 0;
        if (options?.includedRanges) {
          rangeCount = options.includedRanges.length;
          rangeAddress = C._calloc(rangeCount, SIZE_OF_RANGE);
          let address = rangeAddress;
          for (let i2 = 0; i2 < rangeCount; i2++) {
            marshalRange(address, options.includedRanges[i2]);
            address += SIZE_OF_RANGE;
          }
        }
        const treeAddress = C._ts_parser_parse_wasm(
          this[0],
          this[1],
          oldTree ? oldTree[0] : 0,
          rangeAddress,
          rangeCount
        );
        if (!treeAddress) {
          C.currentParseCallback = null;
          C.currentLogCallback = null;
          C.currentProgressCallback = null;
          return null;
        }
        if (!this.language) {
          throw new Error("Parser must have a language to parse");
        }
        const result = new Tree(INTERNAL, treeAddress, this.language, C.currentParseCallback);
        C.currentParseCallback = null;
        C.currentLogCallback = null;
        C.currentProgressCallback = null;
        return result;
      }
      /**
       * Instruct the parser to start the next parse from the beginning.
       *
       * If the parser previously failed because of a callback, 
       * then by default, it will resume where it left off on the
       * next call to {@link Parser#parse} or other parsing functions.
       * If you don't want to resume, and instead intend to use this parser to
       * parse some other document, you must call `reset` first.
       */
      reset() {
        C._ts_parser_reset(this[0]);
      }
      /** Get the ranges of text that the parser will include when parsing. */
      getIncludedRanges() {
        C._ts_parser_included_ranges_wasm(this[0]);
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const result = new Array(count);
        if (count > 0) {
          let address = buffer;
          for (let i2 = 0; i2 < count; i2++) {
            result[i2] = unmarshalRange(address);
            address += SIZE_OF_RANGE;
          }
          C._free(buffer);
        }
        return result;
      }
      /** Set the logging callback that a parser should use during parsing. */
      setLogger(callback) {
        if (!callback) {
          this.logCallback = null;
        } else if (typeof callback !== "function") {
          throw new Error("Logger callback must be a function");
        } else {
          this.logCallback = callback;
        }
        return this;
      }
      /** Get the parser's current logger. */
      getLogger() {
        return this.logCallback;
      }
    };
    PREDICATE_STEP_TYPE_CAPTURE = 1;
    PREDICATE_STEP_TYPE_STRING = 2;
    QUERY_WORD_REGEX = /[\w-]+/g;
    CaptureQuantifier = {
      Zero: 0,
      ZeroOrOne: 1,
      ZeroOrMore: 2,
      One: 3,
      OneOrMore: 4
    };
    isCaptureStep = /* @__PURE__ */ __name((step) => step.type === "capture", "isCaptureStep");
    isStringStep = /* @__PURE__ */ __name((step) => step.type === "string", "isStringStep");
    QueryErrorKind = {
      Syntax: 1,
      NodeName: 2,
      FieldName: 3,
      CaptureName: 4,
      PatternStructure: 5
    };
    QueryError = class _QueryError extends Error {
      constructor(kind, info2, index, length) {
        super(_QueryError.formatMessage(kind, info2));
        this.kind = kind;
        this.info = info2;
        this.index = index;
        this.length = length;
        this.name = "QueryError";
      }
      static {
        __name(this, "QueryError");
      }
      /** Formats an error message based on the error kind and info */
      static formatMessage(kind, info2) {
        switch (kind) {
          case QueryErrorKind.NodeName:
            return `Bad node name '${info2.word}'`;
          case QueryErrorKind.FieldName:
            return `Bad field name '${info2.word}'`;
          case QueryErrorKind.CaptureName:
            return `Bad capture name @${info2.word}`;
          case QueryErrorKind.PatternStructure:
            return `Bad pattern structure at offset ${info2.suffix}`;
          case QueryErrorKind.Syntax:
            return `Bad syntax at offset ${info2.suffix}`;
        }
      }
    };
    __name(parseAnyPredicate, "parseAnyPredicate");
    __name(parseMatchPredicate, "parseMatchPredicate");
    __name(parseAnyOfPredicate, "parseAnyOfPredicate");
    __name(parseIsPredicate, "parseIsPredicate");
    __name(parseSetDirective, "parseSetDirective");
    __name(parsePattern, "parsePattern");
    Query = class {
      static {
        __name(this, "Query");
      }
      /** @internal */
      [0] = 0;
      // Internal handle for Wasm
      /** @internal */
      exceededMatchLimit;
      /** @internal */
      textPredicates;
      /** The names of the captures used in the query. */
      captureNames;
      /** The quantifiers of the captures used in the query. */
      captureQuantifiers;
      /**
       * The other user-defined predicates associated with the given index.
       *
       * This includes predicates with operators other than:
       * - `match?`
       * - `eq?` and `not-eq?`
       * - `any-of?` and `not-any-of?`
       * - `is?` and `is-not?`
       * - `set!`
       */
      predicates;
      /** The properties for predicates with the operator `set!`. */
      setProperties;
      /** The properties for predicates with the operator `is?`. */
      assertedProperties;
      /** The properties for predicates with the operator `is-not?`. */
      refutedProperties;
      /** The maximum number of in-progress matches for this cursor. */
      matchLimit;
      /**
       * Create a new query from a string containing one or more S-expression
       * patterns.
       *
       * The query is associated with a particular language, and can only be run
       * on syntax nodes parsed with that language. References to Queries can be
       * shared between multiple threads.
       *
       * @link {@see https://tree-sitter.github.io/tree-sitter/using-parsers/queries}
       */
      constructor(language, source) {
        const sourceLength = C.lengthBytesUTF8(source);
        const sourceAddress = C._malloc(sourceLength + 1);
        C.stringToUTF8(source, sourceAddress, sourceLength + 1);
        const address = C._ts_query_new(
          language[0],
          sourceAddress,
          sourceLength,
          TRANSFER_BUFFER,
          TRANSFER_BUFFER + SIZE_OF_INT
        );
        if (!address) {
          const errorId = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
          const errorByte = C.getValue(TRANSFER_BUFFER, "i32");
          const errorIndex = C.UTF8ToString(sourceAddress, errorByte).length;
          const suffix = source.slice(errorIndex, errorIndex + 100).split("\n")[0];
          const word = suffix.match(QUERY_WORD_REGEX)?.[0] ?? "";
          C._free(sourceAddress);
          switch (errorId) {
            case QueryErrorKind.Syntax:
              throw new QueryError(QueryErrorKind.Syntax, { suffix: `${errorIndex}: '${suffix}'...` }, errorIndex, 0);
            case QueryErrorKind.NodeName:
              throw new QueryError(errorId, { word }, errorIndex, word.length);
            case QueryErrorKind.FieldName:
              throw new QueryError(errorId, { word }, errorIndex, word.length);
            case QueryErrorKind.CaptureName:
              throw new QueryError(errorId, { word }, errorIndex, word.length);
            case QueryErrorKind.PatternStructure:
              throw new QueryError(errorId, { suffix: `${errorIndex}: '${suffix}'...` }, errorIndex, 0);
          }
        }
        const stringCount = C._ts_query_string_count(address);
        const captureCount = C._ts_query_capture_count(address);
        const patternCount = C._ts_query_pattern_count(address);
        const captureNames = new Array(captureCount);
        const captureQuantifiers = new Array(patternCount);
        const stringValues = new Array(stringCount);
        for (let i2 = 0; i2 < captureCount; i2++) {
          const nameAddress = C._ts_query_capture_name_for_id(
            address,
            i2,
            TRANSFER_BUFFER
          );
          const nameLength = C.getValue(TRANSFER_BUFFER, "i32");
          captureNames[i2] = C.UTF8ToString(nameAddress, nameLength);
        }
        for (let i2 = 0; i2 < patternCount; i2++) {
          const captureQuantifiersArray = new Array(captureCount);
          for (let j = 0; j < captureCount; j++) {
            const quantifier = C._ts_query_capture_quantifier_for_id(address, i2, j);
            captureQuantifiersArray[j] = quantifier;
          }
          captureQuantifiers[i2] = captureQuantifiersArray;
        }
        for (let i2 = 0; i2 < stringCount; i2++) {
          const valueAddress = C._ts_query_string_value_for_id(
            address,
            i2,
            TRANSFER_BUFFER
          );
          const nameLength = C.getValue(TRANSFER_BUFFER, "i32");
          stringValues[i2] = C.UTF8ToString(valueAddress, nameLength);
        }
        const setProperties = new Array(patternCount);
        const assertedProperties = new Array(patternCount);
        const refutedProperties = new Array(patternCount);
        const predicates = new Array(patternCount);
        const textPredicates = new Array(patternCount);
        for (let i2 = 0; i2 < patternCount; i2++) {
          const predicatesAddress = C._ts_query_predicates_for_pattern(address, i2, TRANSFER_BUFFER);
          const stepCount = C.getValue(TRANSFER_BUFFER, "i32");
          predicates[i2] = [];
          textPredicates[i2] = [];
          const steps = new Array();
          let stepAddress = predicatesAddress;
          for (let j = 0; j < stepCount; j++) {
            const stepType = C.getValue(stepAddress, "i32");
            stepAddress += SIZE_OF_INT;
            const stepValueId = C.getValue(stepAddress, "i32");
            stepAddress += SIZE_OF_INT;
            parsePattern(
              i2,
              stepType,
              stepValueId,
              captureNames,
              stringValues,
              steps,
              textPredicates,
              predicates,
              setProperties,
              assertedProperties,
              refutedProperties
            );
          }
          Object.freeze(textPredicates[i2]);
          Object.freeze(predicates[i2]);
          Object.freeze(setProperties[i2]);
          Object.freeze(assertedProperties[i2]);
          Object.freeze(refutedProperties[i2]);
        }
        C._free(sourceAddress);
        this[0] = address;
        this.captureNames = captureNames;
        this.captureQuantifiers = captureQuantifiers;
        this.textPredicates = textPredicates;
        this.predicates = predicates;
        this.setProperties = setProperties;
        this.assertedProperties = assertedProperties;
        this.refutedProperties = refutedProperties;
        this.exceededMatchLimit = false;
      }
      /** Delete the query, freeing its resources. */
      delete() {
        C._ts_query_delete(this[0]);
        this[0] = 0;
      }
      /**
       * Iterate over all of the matches in the order that they were found.
       *
       * Each match contains the index of the pattern that matched, and a list of
       * captures. Because multiple patterns can match the same set of nodes,
       * one match may contain captures that appear *before* some of the
       * captures from a previous match.
       *
       * @param {Node} node - The node to execute the query on.
       *
       * @param {QueryOptions} options - Options for query execution.
       */
      matches(node, options = {}) {
        const startPosition = options.startPosition ?? ZERO_POINT;
        const endPosition = options.endPosition ?? ZERO_POINT;
        const startIndex = options.startIndex ?? 0;
        const endIndex = options.endIndex ?? 0;
        const startContainingPosition = options.startContainingPosition ?? ZERO_POINT;
        const endContainingPosition = options.endContainingPosition ?? ZERO_POINT;
        const startContainingIndex = options.startContainingIndex ?? 0;
        const endContainingIndex = options.endContainingIndex ?? 0;
        const matchLimit = options.matchLimit ?? 4294967295;
        const maxStartDepth = options.maxStartDepth ?? 4294967295;
        const progressCallback = options.progressCallback;
        if (typeof matchLimit !== "number") {
          throw new Error("Arguments must be numbers");
        }
        this.matchLimit = matchLimit;
        if (endIndex !== 0 && startIndex > endIndex) {
          throw new Error("`startIndex` cannot be greater than `endIndex`");
        }
        if (endPosition !== ZERO_POINT && (startPosition.row > endPosition.row || startPosition.row === endPosition.row && startPosition.column > endPosition.column)) {
          throw new Error("`startPosition` cannot be greater than `endPosition`");
        }
        if (endContainingIndex !== 0 && startContainingIndex > endContainingIndex) {
          throw new Error("`startContainingIndex` cannot be greater than `endContainingIndex`");
        }
        if (endContainingPosition !== ZERO_POINT && (startContainingPosition.row > endContainingPosition.row || startContainingPosition.row === endContainingPosition.row && startContainingPosition.column > endContainingPosition.column)) {
          throw new Error("`startContainingPosition` cannot be greater than `endContainingPosition`");
        }
        if (progressCallback) {
          C.currentQueryProgressCallback = progressCallback;
        }
        marshalNode(node);
        C._ts_query_matches_wasm(
          this[0],
          node.tree[0],
          startPosition.row,
          startPosition.column,
          endPosition.row,
          endPosition.column,
          startIndex,
          endIndex,
          startContainingPosition.row,
          startContainingPosition.column,
          endContainingPosition.row,
          endContainingPosition.column,
          startContainingIndex,
          endContainingIndex,
          matchLimit,
          maxStartDepth
        );
        const rawCount = C.getValue(TRANSFER_BUFFER, "i32");
        const startAddress = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const didExceedMatchLimit = C.getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
        const result = new Array(rawCount);
        this.exceededMatchLimit = Boolean(didExceedMatchLimit);
        let filteredCount = 0;
        let address = startAddress;
        for (let i2 = 0; i2 < rawCount; i2++) {
          const patternIndex = C.getValue(address, "i32");
          address += SIZE_OF_INT;
          const captureCount = C.getValue(address, "i32");
          address += SIZE_OF_INT;
          const captures = new Array(captureCount);
          address = unmarshalCaptures(this, node.tree, address, patternIndex, captures);
          if (this.textPredicates[patternIndex].every((p) => p(captures))) {
            result[filteredCount] = { patternIndex, captures };
            const setProperties = this.setProperties[patternIndex];
            result[filteredCount].setProperties = setProperties;
            const assertedProperties = this.assertedProperties[patternIndex];
            result[filteredCount].assertedProperties = assertedProperties;
            const refutedProperties = this.refutedProperties[patternIndex];
            result[filteredCount].refutedProperties = refutedProperties;
            filteredCount++;
          }
        }
        result.length = filteredCount;
        C._free(startAddress);
        C.currentQueryProgressCallback = null;
        return result;
      }
      /**
       * Iterate over all of the individual captures in the order that they
       * appear.
       *
       * This is useful if you don't care about which pattern matched, and just
       * want a single, ordered sequence of captures.
       *
       * @param {Node} node - The node to execute the query on.
       *
       * @param {QueryOptions} options - Options for query execution.
       */
      captures(node, options = {}) {
        const startPosition = options.startPosition ?? ZERO_POINT;
        const endPosition = options.endPosition ?? ZERO_POINT;
        const startIndex = options.startIndex ?? 0;
        const endIndex = options.endIndex ?? 0;
        const startContainingPosition = options.startContainingPosition ?? ZERO_POINT;
        const endContainingPosition = options.endContainingPosition ?? ZERO_POINT;
        const startContainingIndex = options.startContainingIndex ?? 0;
        const endContainingIndex = options.endContainingIndex ?? 0;
        const matchLimit = options.matchLimit ?? 4294967295;
        const maxStartDepth = options.maxStartDepth ?? 4294967295;
        const progressCallback = options.progressCallback;
        if (typeof matchLimit !== "number") {
          throw new Error("Arguments must be numbers");
        }
        this.matchLimit = matchLimit;
        if (endIndex !== 0 && startIndex > endIndex) {
          throw new Error("`startIndex` cannot be greater than `endIndex`");
        }
        if (endPosition !== ZERO_POINT && (startPosition.row > endPosition.row || startPosition.row === endPosition.row && startPosition.column > endPosition.column)) {
          throw new Error("`startPosition` cannot be greater than `endPosition`");
        }
        if (endContainingIndex !== 0 && startContainingIndex > endContainingIndex) {
          throw new Error("`startContainingIndex` cannot be greater than `endContainingIndex`");
        }
        if (endContainingPosition !== ZERO_POINT && (startContainingPosition.row > endContainingPosition.row || startContainingPosition.row === endContainingPosition.row && startContainingPosition.column > endContainingPosition.column)) {
          throw new Error("`startContainingPosition` cannot be greater than `endContainingPosition`");
        }
        if (progressCallback) {
          C.currentQueryProgressCallback = progressCallback;
        }
        marshalNode(node);
        C._ts_query_captures_wasm(
          this[0],
          node.tree[0],
          startPosition.row,
          startPosition.column,
          endPosition.row,
          endPosition.column,
          startIndex,
          endIndex,
          startContainingPosition.row,
          startContainingPosition.column,
          endContainingPosition.row,
          endContainingPosition.column,
          startContainingIndex,
          endContainingIndex,
          matchLimit,
          maxStartDepth
        );
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const startAddress = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const didExceedMatchLimit = C.getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
        const result = new Array();
        this.exceededMatchLimit = Boolean(didExceedMatchLimit);
        const captures = new Array();
        let address = startAddress;
        for (let i2 = 0; i2 < count; i2++) {
          const patternIndex = C.getValue(address, "i32");
          address += SIZE_OF_INT;
          const captureCount = C.getValue(address, "i32");
          address += SIZE_OF_INT;
          const captureIndex = C.getValue(address, "i32");
          address += SIZE_OF_INT;
          captures.length = captureCount;
          address = unmarshalCaptures(this, node.tree, address, patternIndex, captures);
          if (this.textPredicates[patternIndex].every((p) => p(captures))) {
            const capture = captures[captureIndex];
            const setProperties = this.setProperties[patternIndex];
            capture.setProperties = setProperties;
            const assertedProperties = this.assertedProperties[patternIndex];
            capture.assertedProperties = assertedProperties;
            const refutedProperties = this.refutedProperties[patternIndex];
            capture.refutedProperties = refutedProperties;
            result.push(capture);
          }
        }
        C._free(startAddress);
        C.currentQueryProgressCallback = null;
        return result;
      }
      /** Get the predicates for a given pattern. */
      predicatesForPattern(patternIndex) {
        return this.predicates[patternIndex];
      }
      /**
       * Disable a certain capture within a query.
       *
       * This prevents the capture from being returned in matches, and also
       * avoids any resource usage associated with recording the capture.
       */
      disableCapture(captureName) {
        const captureNameLength = C.lengthBytesUTF8(captureName);
        const captureNameAddress = C._malloc(captureNameLength + 1);
        C.stringToUTF8(captureName, captureNameAddress, captureNameLength + 1);
        C._ts_query_disable_capture(this[0], captureNameAddress, captureNameLength);
        C._free(captureNameAddress);
      }
      /**
       * Disable a certain pattern within a query.
       *
       * This prevents the pattern from matching, and also avoids any resource
       * usage associated with the pattern. This throws an error if the pattern
       * index is out of bounds.
       */
      disablePattern(patternIndex) {
        if (patternIndex >= this.predicates.length) {
          throw new Error(
            `Pattern index is ${patternIndex} but the pattern count is ${this.predicates.length}`
          );
        }
        C._ts_query_disable_pattern(this[0], patternIndex);
      }
      /**
       * Check if, on its last execution, this cursor exceeded its maximum number
       * of in-progress matches.
       */
      didExceedMatchLimit() {
        return this.exceededMatchLimit;
      }
      /** Get the byte offset where the given pattern starts in the query's source. */
      startIndexForPattern(patternIndex) {
        if (patternIndex >= this.predicates.length) {
          throw new Error(
            `Pattern index is ${patternIndex} but the pattern count is ${this.predicates.length}`
          );
        }
        return C._ts_query_start_byte_for_pattern(this[0], patternIndex);
      }
      /** Get the byte offset where the given pattern ends in the query's source. */
      endIndexForPattern(patternIndex) {
        if (patternIndex >= this.predicates.length) {
          throw new Error(
            `Pattern index is ${patternIndex} but the pattern count is ${this.predicates.length}`
          );
        }
        return C._ts_query_end_byte_for_pattern(this[0], patternIndex);
      }
      /** Get the number of patterns in the query. */
      patternCount() {
        return C._ts_query_pattern_count(this[0]);
      }
      /** Get the index for a given capture name. */
      captureIndexForName(captureName) {
        return this.captureNames.indexOf(captureName);
      }
      /** Check if a given pattern within a query has a single root node. */
      isPatternRooted(patternIndex) {
        return C._ts_query_is_pattern_rooted(this[0], patternIndex) === 1;
      }
      /** Check if a given pattern within a query has a single root node. */
      isPatternNonLocal(patternIndex) {
        return C._ts_query_is_pattern_non_local(this[0], patternIndex) === 1;
      }
      /**
       * Check if a given step in a query is 'definite'.
       *
       * A query step is 'definite' if its parent pattern will be guaranteed to
       * match successfully once it reaches the step.
       */
      isPatternGuaranteedAtStep(byteIndex) {
        return C._ts_query_is_pattern_guaranteed_at_step(this[0], byteIndex) === 1;
      }
    };
  }
});
function grammarKeyForExt(ext) {
  return EXT_GRAMMAR[ext];
}
function resolveGrammarDir() {
  const env = process.env.CODEINDEX_GRAMMAR_DIR ?? process.env.ULTRAINDEX_GRAMMAR_DIR;
  if (env && existsSync4(env)) return env;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join22(here, "grammars"),
    // bundle: <...>/scripts/grammars
    join22(here, "..", "..", "scripts", "grammars"),
    // dev: src/ast → <repo>/scripts/grammars
    join22(here, "..", "scripts", "grammars")
  ];
  for (const c2 of candidates) if (existsSync4(c2)) return c2;
  return join22(here, "grammars");
}
async function ensureGrammars(keys) {
  const dir = resolveGrammarDir();
  if (!runtimeReady) {
    const runtime = join22(dir, "web-tree-sitter.wasm");
    if (!existsSync4(runtime)) return;
    await Parser.init({ wasmBinary: readFileSync22(runtime) });
    runtimeReady = true;
    parser = new Parser();
  }
  for (const key of new Set(keys)) {
    if (loaded.has(key) || failed.has(key)) continue;
    const wasm = join22(dir, `${key}.wasm`);
    if (!existsSync4(wasm)) {
      failed.add(key);
      continue;
    }
    try {
      loaded.set(key, await Language.load(new Uint8Array(readFileSync22(wasm))));
    } catch {
      failed.add(key);
    }
  }
}
function allGrammarKeys() {
  return [...new Set(Object.values(EXT_GRAMMAR))];
}
function grammarReady(key) {
  return loaded.has(key);
}
function parserFor(key) {
  const lang = loaded.get(key);
  if (!parser || !lang) return null;
  parser.setLanguage(lang);
  return parser;
}
var EXT_GRAMMAR;
var runtimeReady;
var parser;
var loaded;
var failed;
var init_loader = __esm({
  "src/ast/loader.ts"() {
    "use strict";
    init_web_tree_sitter();
    EXT_GRAMMAR = {
      ".ts": "typescript",
      ".mts": "typescript",
      ".cts": "typescript",
      ".tsx": "tsx",
      ".js": "javascript",
      ".jsx": "javascript",
      ".mjs": "javascript",
      ".cjs": "javascript",
      ".py": "python",
      ".pyi": "python",
      ".go": "go",
      ".rs": "rust",
      ".java": "java",
      ".rb": "ruby",
      ".rake": "ruby",
      ".c": "c",
      ".h": "c",
      ".cc": "cpp",
      ".cpp": "cpp",
      ".cxx": "cpp",
      ".hpp": "cpp",
      ".hh": "cpp",
      ".cs": "c_sharp",
      ".php": "php"
    };
    runtimeReady = false;
    parser = null;
    loaded = /* @__PURE__ */ new Map();
    failed = /* @__PURE__ */ new Set();
  }
});
function collectRefIdents(root, defNames) {
  const found = /* @__PURE__ */ new Set();
  const visit = (node) => {
    if (node.namedChildCount === 0 && /identifier|constant|(^|_)name$/.test(node.type) && /^[A-Za-z_]\w{4,}$/.test(node.text) && !defNames.has(node.text)) {
      found.add(node.text);
    }
    for (let i2 = 0; i2 < node.namedChildCount; i2++) visit(node.namedChild(i2));
  };
  visit(root);
  return [...found].sort().slice(0, MAX_REF_IDENTS);
}
function firstLine(node) {
  const nl = node.text.indexOf("\n");
  return (nl === -1 ? node.text : node.text.slice(0, nl)).trim().slice(0, 200);
}
function nameOf(node) {
  const named = node.childForFieldName("name");
  if (named?.text) return named.text;
  let decl = node.childForFieldName("declarator");
  while (decl) {
    if (decl.namedChildCount === 0 && /(^|_)identifier$/.test(decl.type)) return decl.text;
    const next = decl.childForFieldName("declarator");
    if (!next || next === decl) break;
    decl = next;
  }
  for (let i2 = 0; i2 < node.namedChildCount; i2++) {
    const c2 = node.namedChild(i2);
    if (/(^|_)(identifier|name|constant)$/.test(c2.type)) return c2.text;
  }
  return void 0;
}
function collectImports(root, spec) {
  if (!spec.imports) return [];
  const out2 = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (s) => {
    const v = s.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out2.push({ kind: "import", spec: v });
    }
  };
  const visit = (node) => {
    const how = spec.imports[node.type];
    if (how === "string") {
      const str2 = findFirst(node, (n) => /string/.test(n.type));
      if (str2) add(str2.text.replace(/^['"]|['"]$/g, ""));
    } else if (how === "path") {
      const name2 = node.childForFieldName("name") ?? node.childForFieldName("module_name");
      add((name2 ?? node).text.replace(/^(import|from)\s+/, "").split(/\s+/)[0]);
    }
    for (let i2 = 0; i2 < node.namedChildCount; i2++) visit(node.namedChild(i2));
  };
  visit(root);
  return out2;
}
function findFirst(node, pred) {
  for (let i2 = 0; i2 < node.namedChildCount; i2++) {
    const c2 = node.namedChild(i2);
    if (pred(c2)) return c2;
    const deep = findFirst(c2, pred);
    if (deep) return deep;
  }
  return void 0;
}
function readName(node) {
  if (!node) return void 0;
  if (node.namedChildCount === 0) return IDENT_LEAF.test(node.type) ? node.text : void 0;
  const seg = node.childForFieldName("name") ?? node.childForFieldName("property") ?? node.childForFieldName("attribute") ?? node.childForFieldName("field");
  if (seg) return readName(seg);
  const last = node.namedChild(node.namedChildCount - 1);
  return last && last !== node ? readName(last) : void 0;
}
function collectCalls(root, spec) {
  if (!spec.calls) return [];
  const out2 = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (name2, node) => {
    if (!name2 || name2.length < 2 || !/^[A-Za-z_]\w*$/.test(name2)) return;
    const line2 = node.startPosition.row + 1;
    const key = `${name2} ${line2}`;
    if (seen.has(key)) return;
    seen.add(key);
    out2.push({ name: name2, line: line2 });
  };
  const visit = (node) => {
    const how = spec.calls[node.type];
    if (how === "function") {
      add(readName(node.childForFieldName("function") ?? node.childForFieldName("callee") ?? node.childForFieldName("method") ?? node.childForFieldName("name")), node);
    } else if (how === "member") {
      add(readName(node.childForFieldName("name")), node);
    } else if (how === "constructor") {
      let t = node.childForFieldName("constructor") ?? node.childForFieldName("type") ?? node.childForFieldName("name");
      for (let i2 = 0; !t && i2 < node.namedChildCount; i2++) {
        const c2 = node.namedChild(i2);
        if (IDENT_LEAF.test(c2.type)) t = c2;
      }
      add(readName(t), node);
    }
    for (let i2 = 0; i2 < node.namedChildCount; i2++) visit(node.namedChild(i2));
  };
  visit(root);
  out2.sort((a, b) => byStr(a.name, b.name) || a.line - b.line);
  return out2.slice(0, MAX_CALLS);
}
function collectImportedNames(root, spec) {
  if (!spec.imports?.import_statement) return [];
  const found = /* @__PURE__ */ new Set();
  const visit = (node) => {
    if (node.type === "import_statement") {
      for (let i2 = 0; i2 < node.namedChildCount; i2++) {
        const clause = node.namedChild(i2);
        if (clause.type !== "import_clause") continue;
        for (let j = 0; j < clause.namedChildCount; j++) {
          const named = clause.namedChild(j);
          if (named.type !== "named_imports") continue;
          for (let k = 0; k < named.namedChildCount; k++) {
            const specifier = named.namedChild(k);
            if (specifier.type !== "import_specifier") continue;
            const nm = specifier.childForFieldName("name") ?? specifier.namedChild(0);
            if (nm?.text) found.add(nm.text);
          }
        }
      }
    }
    for (let i2 = 0; i2 < node.namedChildCount; i2++) visit(node.namedChild(i2));
  };
  visit(root);
  return [...found].sort(byStr).slice(0, MAX_IMPORTED_NAMES);
}
function extractAst(rel, ext, content) {
  const key = grammarKeyForExt(ext);
  if (!key || !grammarReady(key)) return void 0;
  const spec = SPECS[key];
  if (!spec) return void 0;
  const parser2 = parserFor(key);
  if (!parser2) return void 0;
  let tree = null;
  try {
    tree = parser2.parse(content);
    if (!tree) return void 0;
    const symbols = [];
    const root = tree.rootNode;
    const exportedNames = /* @__PURE__ */ new Set();
    const walk22 = (node, parent, exported) => {
      const nowExported = exported || node.type === "export_statement";
      if (node.type === "export_statement") {
        for (let i2 = 0; i2 < node.namedChildCount; i2++) {
          const c2 = node.namedChild(i2);
          if (c2.type === "identifier") exportedNames.add(c2.text);
          else if (c2.type === "export_clause") {
            for (let j = 0; j < c2.namedChildCount; j++) {
              const spec2 = c2.namedChild(j);
              const nm = spec2.childForFieldName("name") ?? spec2.namedChild(0);
              if (nm?.text) exportedNames.add(nm.text);
            }
          }
        }
      }
      if (spec.assignments && node.type === "expression_statement") {
        const expr = node.namedChild(0);
        if (expr?.type === "assignment_expression") {
          const left = expr.childForFieldName("left");
          const right = expr.childForFieldName("right");
          const funcy = right && ["function_expression", "function", "generator_function", "arrow_function", "class"].includes(right.type);
          if (left && right && funcy) {
            let name2;
            let exportedAssign = false;
            if (left.type === "member_expression") {
              const prop = left.childForFieldName("property");
              if (prop?.type === "property_identifier") {
                name2 = prop.text;
                const obj = left.text.slice(0, left.text.length - prop.text.length - 1);
                exportedAssign = obj === "exports" || obj === "module.exports";
              }
            } else if (left.type === "identifier") {
              name2 = left.text;
            }
            if (name2) {
              symbols.push({
                name: name2,
                kind: right.type === "class" ? "class" : "function",
                file: rel,
                line: expr.startPosition.row + 1,
                endLine: expr.endPosition.row + 1,
                ...parent ? { parent } : {},
                signature: firstLine(expr),
                exported: nowExported || exportedAssign,
                lang: spec.lang
              });
              return;
            }
          }
        }
      }
      const kind = spec.defs[node.type];
      if (kind) {
        const name2 = nameOf(node);
        if (name2) {
          const line2 = firstLine(node);
          symbols.push({
            name: name2,
            kind,
            file: rel,
            line: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            ...parent ? { parent } : {},
            signature: line2,
            exported: nowExported || spec.exported(line2, name2),
            lang: spec.lang
          });
          for (let i2 = 0; i2 < node.namedChildCount; i2++) {
            walkBody(node.namedChild(i2), name2, nowExported);
          }
          return;
        }
      }
      if (spec.containers.has(node.type)) {
        for (let i2 = 0; i2 < node.namedChildCount; i2++) walk22(node.namedChild(i2), parent, nowExported);
      }
    };
    const walkBody = (node, parent, exported) => {
      if (spec.containers.has(node.type)) {
        for (let i2 = 0; i2 < node.namedChildCount; i2++) walk22(node.namedChild(i2), parent, exported);
      }
    };
    walk22(root, void 0, false);
    if (exportedNames.size) {
      for (const s of symbols) if (!s.exported && exportedNames.has(s.name)) s.exported = true;
    }
    const refs = collectImports(root, spec);
    const idents = collectRefIdents(root, new Set(symbols.map((s) => s.name)));
    const calls = collectCalls(root, spec);
    const importedNames = collectImportedNames(root, spec);
    let pkg;
    if (spec.lang === "java") {
      const p = findFirst(root, (n) => n.type === "package_declaration");
      if (p) pkg = p.text.replace(/^package\s+/, "").replace(/;.*$/, "").trim();
    }
    return { symbols, refs, pkg, idents, calls, importedNames };
  } catch {
    return void 0;
  } finally {
    tree?.delete();
  }
}
var MAX_REF_IDENTS;
var MAX_CALLS;
var MAX_IMPORTED_NAMES;
var byPublicKeyword;
var byPub;
var byCapital;
var byPyConvention;
var always;
var neverExport;
var TS_SPEC;
var SPECS;
var IDENT_LEAF;
var init_extract = __esm({
  "src/ast/extract.ts"() {
    "use strict";
    init_sort();
    init_loader();
    MAX_REF_IDENTS = 256;
    MAX_CALLS = 512;
    MAX_IMPORTED_NAMES = 256;
    byPublicKeyword = (line2) => /\b(public|internal)\b/.test(line2);
    byPub = (line2) => /\bpub\b/.test(line2);
    byCapital = (_l, name2) => /^[A-Z]/.test(name2);
    byPyConvention = (_l, name2) => !name2.startsWith("_") || /^__\w+__$/.test(name2);
    always = () => true;
    neverExport = () => false;
    TS_SPEC = {
      lang: "typescript",
      defs: {
        function_declaration: "function",
        generator_function_declaration: "function",
        class_declaration: "class",
        abstract_class_declaration: "class",
        interface_declaration: "interface",
        type_alias_declaration: "type",
        enum_declaration: "enum",
        method_definition: "method",
        variable_declarator: "const"
      },
      containers: /* @__PURE__ */ new Set(["class_body", "export_statement", "program", "lexical_declaration", "variable_declaration"]),
      exported: neverExport,
      // export is tracked structurally via export_statement; see walk
      imports: { import_statement: "string" },
      calls: { call_expression: "function", new_expression: "constructor" },
      assignments: true
    };
    SPECS = {
      typescript: TS_SPEC,
      tsx: { ...TS_SPEC, lang: "typescript" },
      javascript: {
        ...TS_SPEC,
        lang: "javascript",
        defs: {
          function_declaration: "function",
          generator_function_declaration: "function",
          class_declaration: "class",
          method_definition: "method",
          variable_declarator: "const"
        }
      },
      python: {
        lang: "python",
        defs: { function_definition: "function", class_definition: "class" },
        containers: /* @__PURE__ */ new Set(["block", "decorated_definition", "module"]),
        exported: byPyConvention,
        imports: { import_statement: "path", import_from_statement: "path" },
        calls: { call: "function" }
      },
      go: {
        lang: "go",
        defs: {
          function_declaration: "function",
          method_declaration: "method",
          type_spec: "type",
          const_spec: "const",
          var_spec: "var"
        },
        containers: /* @__PURE__ */ new Set(["type_declaration", "const_declaration", "var_declaration", "source_file"]),
        exported: byCapital,
        imports: { import_declaration: "string" },
        calls: { call_expression: "function" }
      },
      ruby: {
        lang: "ruby",
        defs: { method: "def", singleton_method: "def", class: "class", module: "module" },
        containers: /* @__PURE__ */ new Set(["class", "module", "body_statement", "program"]),
        exported: always,
        // Ruby models every invocation — dotted, parenthesized, or bare command form
        // (`puts "x"`) — as a `call` node whose callee is the `method` field.
        calls: { call: "function" }
      },
      java: {
        lang: "java",
        defs: {
          class_declaration: "class",
          interface_declaration: "interface",
          enum_declaration: "enum",
          record_declaration: "record",
          method_declaration: "method",
          constructor_declaration: "constructor"
        },
        containers: /* @__PURE__ */ new Set(["class_body", "interface_body", "enum_body", "program"]),
        exported: byPublicKeyword,
        imports: { import_declaration: "path" },
        calls: { method_invocation: "function", object_creation_expression: "constructor" }
      },
      rust: {
        lang: "rust",
        defs: {
          function_item: "function",
          struct_item: "struct",
          enum_item: "enum",
          trait_item: "trait",
          type_item: "type",
          mod_item: "mod",
          const_item: "const",
          static_item: "static",
          union_item: "union",
          macro_definition: "macro"
        },
        containers: /* @__PURE__ */ new Set(["impl_item", "declaration_list", "source_file"]),
        exported: byPub,
        calls: { call_expression: "function" }
      },
      c_sharp: {
        lang: "csharp",
        defs: {
          class_declaration: "class",
          interface_declaration: "interface",
          struct_declaration: "struct",
          enum_declaration: "enum",
          record_declaration: "record",
          method_declaration: "method",
          constructor_declaration: "constructor",
          property_declaration: "property"
        },
        containers: /* @__PURE__ */ new Set(["namespace_declaration", "declaration_list", "compilation_unit", "file_scoped_namespace_declaration"]),
        exported: byPublicKeyword,
        calls: { invocation_expression: "function", object_creation_expression: "constructor" }
      },
      php: {
        lang: "php",
        defs: {
          function_definition: "function",
          class_declaration: "class",
          interface_declaration: "interface",
          trait_declaration: "trait",
          enum_declaration: "enum",
          method_declaration: "method"
        },
        containers: /* @__PURE__ */ new Set(["declaration_list", "program"]),
        exported: always,
        calls: { function_call_expression: "function", member_call_expression: "member", object_creation_expression: "constructor" }
      },
      c: {
        lang: "c",
        defs: {
          function_definition: "function",
          struct_specifier: "struct",
          enum_specifier: "enum",
          union_specifier: "union",
          type_definition: "type"
        },
        // C has no visibility keyword — headers are the interface, so everything
        // counts as exported (same stance as the regex extractor).
        containers: /* @__PURE__ */ new Set(["translation_unit", "declaration_list", "linkage_specification", "preproc_ifdef", "preproc_if"]),
        exported: always,
        calls: { call_expression: "function" }
      },
      cpp: {
        lang: "cpp",
        defs: {
          function_definition: "function",
          class_specifier: "class",
          struct_specifier: "struct",
          enum_specifier: "enum",
          union_specifier: "union",
          type_definition: "type",
          namespace_definition: "namespace"
        },
        containers: /* @__PURE__ */ new Set([
          "translation_unit",
          "declaration_list",
          "field_declaration_list",
          "template_declaration",
          "linkage_specification",
          "preproc_ifdef",
          "preproc_if"
        ]),
        exported: always,
        calls: { call_expression: "function", new_expression: "constructor" }
      }
    };
    IDENT_LEAF = /(^|_)(identifier|name|constant)$/;
  }
});
function isDirective(line2) {
  return DIRECTIVE_RE.test(line2.trim());
}
function isBanner(line2) {
  return BANNER_RE.test(line2.trim());
}
function topDocComment(content) {
  const lines = content.split(/\r?\n/);
  const collected = [];
  let inBlock = null;
  for (let i2 = 0; i2 < Math.min(lines.length, 40); i2++) {
    const raw = lines[i2];
    const line2 = raw.trim();
    if (inBlock === "c") {
      collected.push(line2.replace(/\*+\/\s*$/, "").replace(/^\*+/, "").trim());
      if (line2.includes("*/")) inBlock = null;
      continue;
    }
    if (inBlock === "py") {
      if (line2.includes('"""') || line2.includes("'''")) {
        collected.push(line2.replace(/['"]{3}.*$/, "").trim());
        inBlock = null;
      } else collected.push(line2);
      continue;
    }
    if (line2 === "" && collected.length === 0) continue;
    if (line2.startsWith("#!")) continue;
    if (line2.startsWith("//")) {
      collected.push(line2.replace(/^\/+/, "").trim());
      continue;
    }
    if (line2.startsWith("#")) {
      collected.push(line2.replace(/^#+/, "").trim());
      continue;
    }
    if (line2.startsWith("/*")) {
      collected.push(line2.replace(/^\/\*+!?/, "").replace(/\*+\/\s*$/, "").trim());
      if (!line2.includes("*/")) inBlock = "c";
      continue;
    }
    if (line2.startsWith('"""') || line2.startsWith("'''")) {
      const rest = line2.slice(3);
      if (rest.includes('"""') || rest.includes("'''")) collected.push(rest.replace(/['"]{3}.*$/, "").trim());
      else {
        collected.push(rest.trim());
        inBlock = "py";
      }
      continue;
    }
    break;
  }
  const text = collected.filter((l) => l && !isDirective(l) && !isBanner(l)).join(" ").replace(/\s+/g, " ").trim();
  if (text.length < 8) return void 0;
  const sentence = /^(.*?[.!?])(\s|$)/.exec(text);
  return (sentence ? sentence[1] : text).slice(0, 200);
}
function expandUseGroups(path, out2 = []) {
  if (out2.length >= MAX_USE_EXPANSION) return out2;
  const brace = path.indexOf("{");
  if (brace === -1) {
    const cleaned = path.replace(/\s+as\s+\w+\s*$/, "").replace(/::\s*\*\s*$/, "").replace(/^::/, "").trim();
    if (cleaned) out2.push(cleaned);
    return out2;
  }
  const prefix = path.slice(0, brace);
  let depth = 0;
  let end = -1;
  for (let i2 = brace; i2 < path.length; i2++) {
    if (path[i2] === "{") depth++;
    else if (path[i2] === "}" && --depth === 0) {
      end = i2;
      break;
    }
  }
  if (end === -1) return out2;
  const parts2 = [];
  let cur = "";
  depth = 0;
  for (const ch of path.slice(brace + 1, end)) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (ch === "," && depth === 0) {
      parts2.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts2.push(cur);
  for (const part of parts2) {
    const t = part.trim();
    if (!t) continue;
    if (t === "self") expandUseGroups(prefix.replace(/::\s*$/, ""), out2);
    else expandUseGroups(prefix + t, out2);
  }
  return out2;
}
function extractImports(ext, content) {
  const specs = /* @__PURE__ */ new Set();
  const lines = content.split(/\r?\n/);
  if (JS_TS.has(ext)) {
    let m;
    const from = /(?:^|[^\w$.])(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g;
    while (m = from.exec(content)) specs.add(m[1]);
    const bare = /(?:^|[\n;])\s*import\s*['"]([^'"]+)['"]/g;
    while (m = bare.exec(content)) specs.add(m[1]);
    const req = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
    while (m = req.exec(content)) specs.add(m[1]);
    const dyn = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
    while (m = dyn.exec(content)) specs.add(m[1]);
  } else if (PY.has(ext)) {
    for (const line2 of lines) {
      const from = /^\s*from\s+(\.*[\w.]*)\s+import\b/.exec(line2);
      if (from) {
        specs.add(from[1]);
        continue;
      }
      const imp = /^\s*import\s+(.+)$/.exec(line2);
      if (imp) {
        for (const part of imp[1].split(",")) {
          const name2 = part.trim().split(/\s+as\s+/)[0].trim();
          if (name2 && /^[\w.]+$/.test(name2)) specs.add(name2);
        }
      }
    }
  } else if (ext === ".go") {
    let inBlock = false;
    for (const line2 of lines) {
      const t = line2.trim();
      if (inBlock) {
        if (t === ")") {
          inBlock = false;
          continue;
        }
        const b = /"([^"]+)"/.exec(t);
        if (b) specs.add(b[1]);
        continue;
      }
      if (/^import\s*\($/.test(t)) {
        inBlock = true;
        continue;
      }
      const single = /^import\s+(?:[\w.]+\s+)?"([^"]+)"/.exec(t);
      if (single) specs.add(single[1]);
    }
  } else if (ext === ".rs") {
    let m;
    const modRe = /^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)\s*;/gm;
    while (m = modRe.exec(content)) specs.add(`mod ${m[1]}`);
    const useRe = /^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+([^;]+);/gm;
    while (m = useRe.exec(content)) {
      for (const p of expandUseGroups(m[1].trim())) specs.add(p);
    }
  } else if (ext === ".java") {
    let m;
    const imp = /^\s*import\s+(?:static\s+)?([\w.]+(?:\.\*)?)\s*;/gm;
    while (m = imp.exec(content)) specs.add(m[1]);
  } else if (ext === ".rb" || ext === ".rake") {
    let m;
    const rel = /^\s*require_relative\s+['"]([^'"]+)['"]/gm;
    while (m = rel.exec(content)) specs.add(/^\.\.?\//.test(m[1]) ? m[1] : "./" + m[1]);
    const req = /^\s*require\s+['"]([^'"]+)['"]/gm;
    while (m = req.exec(content)) specs.add(m[1]);
  } else if (C_CPP.has(ext)) {
    let m;
    const inc = /^\s*#\s*include\s*"([^"]+)"/gm;
    while (m = inc.exec(content)) specs.add(m[1]);
  } else if (ext === ".php") {
    let m;
    const use = /^\s*use\s+(?:function\s+|const\s+)?\\?([A-Za-z_][\w\\]*)\s*(?:as\s+\w+)?\s*;/gm;
    while (m = use.exec(content)) specs.add(m[1]);
    const inc = /\b(?:require|include)(?:_once)?\s*\(?\s*['"]([^'"]+)['"]/g;
    while (m = inc.exec(content)) specs.add(/^\.\.?\//.test(m[1]) ? m[1] : "./" + m[1]);
  } else if (ext === ".cs") {
    let m;
    const using = /^\s*(?:global\s+)?using\s+(?:static\s+)?([A-Za-z_][\w.]*)\s*;/gm;
    while (m = using.exec(content)) specs.add(m[1]);
  }
  return [...specs].map((spec) => ({ kind: "import", spec }));
}
function extractReexports(rel, content) {
  if (!JS_TS.has(rel.slice(rel.lastIndexOf(".")))) return [];
  const lang = /\.(ts|tsx|mts|cts)$/.test(rel) ? "typescript" : "javascript";
  const out2 = [];
  const seen = /* @__PURE__ */ new Set();
  const lineAt = (idx) => content.slice(0, idx).split(/\r?\n/).length;
  const named = /export\s*\{([\s\S]*?)\}\s*(?:from\s*['"]([^'"]+)['"])?\s*;?/g;
  let m;
  while ((m = named.exec(content)) && out2.length < 60) {
    const from = m[2];
    for (const part of m[1].split(",")) {
      const p = part.trim().replace(/^type\s+/, "");
      const as = /^(\S+)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(p);
      const name2 = as ? as[2] : p;
      if (!/^[A-Za-z_$][\w$]*$/.test(name2) || name2 === "default" || seen.has(name2)) continue;
      seen.add(name2);
      out2.push({
        name: name2,
        kind: "reexport",
        file: rel,
        line: lineAt(m.index),
        signature: from ? `export { ${name2} } from "${from}"` : `export { ${name2} }`,
        exported: true,
        lang
      });
    }
  }
  const star = /export\s*\*\s*(?:as\s+([A-Za-z_$][\w$]*)\s+)?from\s*['"]([^'"]+)['"]/g;
  while ((m = star.exec(content)) && out2.length < 60) {
    const ns = m[1];
    const from = m[2];
    const key = "*" + (ns ?? from);
    if (seen.has(key)) continue;
    seen.add(key);
    out2.push({
      name: ns ?? `* (${from})`,
      kind: ns ? "reexport" : "reexport-all",
      file: rel,
      line: lineAt(m.index),
      signature: `export * ${ns ? `as ${ns} ` : ""}from "${from}"`,
      exported: true,
      lang
    });
  }
  return out2;
}
function collectCallsRegex(content) {
  const out2 = /* @__PURE__ */ new Map();
  const lines = content.split("\n");
  const CALL_RE = /(?:\bnew\s+)?([A-Za-z_$][\w$]*)\s*\(/g;
  for (let i2 = 0; i2 < lines.length && out2.size < 512; i2++) {
    const line2 = lines[i2];
    const trimmed = line2.trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*")) continue;
    CALL_RE.lastIndex = 0;
    let m;
    while ((m = CALL_RE.exec(line2)) !== null && out2.size < 512) {
      const name2 = m[1];
      if (name2.length < 2 || CALL_KEYWORDS.has(name2)) continue;
      if (DEF_INTRODUCERS.test(line2.slice(0, m.index))) continue;
      const key = `${name2} ${i2 + 1}`;
      if (!out2.has(key)) out2.set(key, { name: name2, line: i2 + 1 });
    }
  }
  return [...out2.values()].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : a.line - b.line);
}
function extractCode(rel, ext, content) {
  const ast = extractAst(rel, ext, content);
  const symbols = (ast ? ast.symbols : extractSymbols(rel, ext, content)).slice(0, 400);
  const known = new Set(symbols.map((s) => s.name));
  const reexports = extractReexports(rel, content).filter((s) => !known.has(s.name));
  return {
    symbols: [...symbols, ...reexports],
    summary: topDocComment(content),
    refs: extractImports(ext, content),
    // pkg anchors namespace→source-root resolution: Java's `package`, C#'s
    // `namespace` (block or file-scoped). Both feed the same resolver pattern.
    pkg: ext === ".java" ? /^\s*package\s+([\w.]+)\s*;/m.exec(content)?.[1] : ext === ".cs" ? /^\s*(?:file-scoped\s+)?namespace\s+([\w.]+)/m.exec(content)?.[1] : void 0,
    idents: ast?.idents,
    // AST call sites when a grammar parsed the file; the conservative regex
    // collector otherwise, so caller indexes exist without the wasm sidecar.
    calls: ast ? ast.calls : collectCallsRegex(content),
    importedNames: ast?.importedNames
  };
}
var JS_TS;
var PY;
var C_CPP;
var DIRECTIVE_RE;
var BANNER_RE;
var MAX_USE_EXPANSION;
var CALL_KEYWORDS;
var DEF_INTRODUCERS;
var init_code = __esm({
  "src/extract/code.ts"() {
    "use strict";
    init_registry();
    init_extract();
    JS_TS = /* @__PURE__ */ new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
    PY = /* @__PURE__ */ new Set([".py", ".pyi"]);
    C_CPP = /* @__PURE__ */ new Set([".c", ".h", ".cc", ".cpp", ".cxx", ".hpp", ".hh"]);
    DIRECTIVE_RE = /^(eslint\b|eslint-|prettier\b|prettier-|tslint\b|jshint\b|jslint\b|globals?\b|istanbul\b|c8\s|v8\s|@ts-|ts-|@flow\b|@jsx\b|@jsxRuntime\b|@jest-environment\b|@vitest-environment\b|@license\b|@preserve\b|@copyright\b|copyright\b|spdx-|<reference\b|use strict|biome-|deno-lint|noqa\b|type:\s*ignore|pylint:|flake8:|mypy:|coding[:=])/i;
    BANNER_RE = /^((?:mit|isc|bsd|apache|gnu|gpl|mpl|lgpl|agpl)\s+licen[sc]ed?\b|licen[sc]ed\b|(?:released|distributed)\s+under\b|all rights reserved\b|https?:\/\/|www\.)/i;
    MAX_USE_EXPANSION = 16;
    CALL_KEYWORDS = /* @__PURE__ */ new Set([
      "if",
      "else",
      "elif",
      "for",
      "while",
      "do",
      "switch",
      "case",
      "match",
      "when",
      "unless",
      "until",
      "catch",
      "except",
      "return",
      "throw",
      "raise",
      "yield",
      "await",
      "typeof",
      "instanceof",
      "sizeof",
      "delete",
      "void",
      "in",
      "of",
      "not",
      "and",
      "or",
      "assert",
      "defer",
      "select",
      "with",
      "loop"
    ]);
    DEF_INTRODUCERS = /(?:\bfunction|\bdef|\bfunc|\bfun|\bfn|\bclass|\bsub|\bmacro|\bproc)\s*[*]?\s*$/;
  }
});
function countLines(s) {
  if (!s) return 0;
  let n = 1;
  for (let i2 = 0; i2 < s.length; i2++) if (s.charCodeAt(i2) === 10) n++;
  return n;
}
function scanRepo(root, opts = {}) {
  const scoped = opts.scope ? [...opts.include ?? [], `${opts.scope.replace(/\/+$/, "")}/**`] : opts.include;
  const include = compileGlobs(scoped);
  const exclude = compileGlobs(opts.exclude);
  const { files: walked, capped } = walk(root, {
    maxFileBytes: opts.maxBytes,
    maxFiles: opts.maxFiles,
    gitignore: opts.gitignore
  });
  const outPrefix = opts.out ? opts.out.replace(/\/+$/, "") + "/" : null;
  const files = [];
  const languages = {};
  const docText = /* @__PURE__ */ new Map();
  const mtimes = /* @__PURE__ */ new Map();
  for (const f of walked) {
    if (outPrefix && (f.abs === opts.out || f.abs.startsWith(outPrefix))) continue;
    if (include && !include(f.rel)) continue;
    if (exclude && exclude(f.rel)) continue;
    const kind = classify(f.rel, f.ext);
    const lang = extToLang(f.ext);
    languages[lang] = (languages[lang] ?? 0) + 1;
    mtimes.set(f.rel, f.mtimeMs);
    const cached = opts.cache?.get(f.rel);
    if (kind !== "doc" && !opts.fullHash && cached && cached.size !== void 0 && cached.mtimeMs !== void 0 && cached.size === f.size && cached.mtimeMs === f.mtimeMs) {
      files.push(cached.record);
      continue;
    }
    const content = readText(f.abs);
    const hash = sha1(content);
    if (cached && cached.hash === hash) {
      files.push(cached.record);
      if (kind === "doc" && content) docText.set(f.rel, content);
      continue;
    }
    const record = {
      rel: f.rel,
      ext: f.ext,
      size: f.size,
      lines: countLines(content),
      hash,
      kind,
      lang,
      headings: [],
      symbols: [],
      refs: []
    };
    if (content) {
      if (kind === "doc" && MARKDOWN_EXT.has(f.ext)) {
        const md = extractMarkdown(content);
        record.title = md.title ?? basename2(f.rel);
        record.summary = md.summary;
        record.headings = md.headings;
        record.refs = md.refs;
      } else if (kind === "doc") {
        record.title = basename2(f.rel);
      } else if (kind === "code") {
        const code = extractCode(f.rel, f.ext, content);
        record.title = basename2(f.rel);
        record.summary = code.summary;
        record.symbols = code.symbols;
        record.refs = code.refs;
        record.pkg = code.pkg;
        record.idents = code.idents;
        record.calls = code.calls;
        record.importedNames = code.importedNames;
      } else {
        record.title = basename2(f.rel);
      }
    } else {
      record.title = basename2(f.rel);
    }
    if (kind === "doc" && content) docText.set(f.rel, content);
    files.push(record);
  }
  files.sort(byKey((f) => f.rel));
  return { root, commit: headCommit(root), files, languages, docText, mtimes, capped };
}
var init_scan = __esm({
  "src/scan.ts"() {
    "use strict";
    init_walk();
    init_git();
    init_hash();
    init_classify();
    init_registry();
    init_glob();
    init_sort();
    init_markdown();
    init_code();
  }
});
function distToSrcCandidates(target) {
  const segs = norm2(target).split("/").filter((s) => s !== ".");
  const out2 = [];
  let i2 = 0;
  while (i2 < segs.length - 1 && BUILD_DIRS.has(segs[i2])) {
    i2++;
    const rest = segs.slice(i2).join("/");
    out2.push("src/" + rest, rest);
  }
  return out2;
}
function norm2(p) {
  return posix.normalize(p).replace(/\/$/, "");
}
function firstThat(fileSet, candidates) {
  for (const c2 of candidates) {
    const n = norm2(c2);
    if (fileSet.has(n)) return n;
  }
  return void 0;
}
function byLen(a, b) {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}
function tolerantJsonParse(text) {
  let stripped = "";
  let inStr = false;
  for (let i2 = 0; i2 < text.length; i2++) {
    const c2 = text[i2];
    if (inStr) {
      stripped += c2;
      if (c2 === "\\") stripped += text[++i2] ?? "";
      else if (c2 === '"') inStr = false;
      continue;
    }
    if (c2 === '"') {
      inStr = true;
      stripped += c2;
    } else if (c2 === "/" && text[i2 + 1] === "/") {
      while (i2 < text.length && text[i2] !== "\n") i2++;
      stripped += "\n";
    } else if (c2 === "/" && text[i2 + 1] === "*") {
      i2 += 2;
      while (i2 < text.length && !(text[i2] === "*" && text[i2 + 1] === "/")) i2++;
      i2++;
    } else {
      stripped += c2;
    }
  }
  let out2 = "";
  inStr = false;
  for (let i2 = 0; i2 < stripped.length; i2++) {
    const c2 = stripped[i2];
    if (inStr) {
      out2 += c2;
      if (c2 === "\\") out2 += stripped[++i2] ?? "";
      else if (c2 === '"') inStr = false;
      continue;
    }
    if (c2 === '"') {
      inStr = true;
      out2 += c2;
      continue;
    }
    if (c2 === ",") {
      let j = i2 + 1;
      while (j < stripped.length && (stripped[j] === " " || stripped[j] === "	" || stripped[j] === "\n" || stripped[j] === "\r")) j++;
      if (stripped[j] === "}" || stripped[j] === "]") continue;
    }
    out2 += c2;
  }
  try {
    return JSON.parse(out2);
  } catch {
    return void 0;
  }
}
function resolveExtends(fileSet, fromDir, ext) {
  if (!/^\.\.?\//.test(ext)) return void 0;
  const base = norm2(posix.join(fromDir, ext));
  const cands = ext.endsWith(".json") ? [base] : [base + ".json", posix.join(base, "tsconfig.json")];
  for (const c2 of cands) if (fileSet.has(c2)) return c2;
  return void 0;
}
function readTsConfig(root, fileSet, rel, warnings, seen) {
  if (seen.has(rel)) return void 0;
  seen.add(rel);
  const cfg = tolerantJsonParse(readText(join32(root, rel)));
  if (cfg === void 0) {
    warnings.push(`unparseable ${rel} \u2014 its path aliases were ignored`);
    return void 0;
  }
  const dir = rel.includes("/") ? posix.dirname(rel) : "";
  const eff = { baseUrlDir: "", pathsDir: "" };
  const exts = cfg.extends === void 0 ? [] : Array.isArray(cfg.extends) ? cfg.extends : [cfg.extends];
  for (const ext of exts) {
    if (typeof ext !== "string") continue;
    const baseRel = resolveExtends(fileSet, dir, ext);
    if (!baseRel) {
      if (/^\.\.?\//.test(ext)) warnings.push(`${rel} extends "${ext}" which is missing \u2014 its path aliases were ignored`);
      continue;
    }
    const inherited = readTsConfig(root, fileSet, baseRel, warnings, seen);
    if (inherited?.baseUrl !== void 0) {
      eff.baseUrl = inherited.baseUrl;
      eff.baseUrlDir = inherited.baseUrlDir;
    }
    if (inherited?.paths) {
      eff.paths = inherited.paths;
      eff.pathsDir = inherited.pathsDir;
    }
  }
  const co = cfg.compilerOptions;
  if (co?.baseUrl !== void 0) {
    eff.baseUrl = co.baseUrl;
    eff.baseUrlDir = dir;
  }
  if (co?.paths) {
    eff.paths = co.paths;
    eff.pathsDir = dir;
  }
  return eff;
}
function conditionRank(key) {
  const i2 = CONDITION_PRIORITY.indexOf(key);
  if (i2 !== -1) return i2;
  return key === "types" ? CONDITION_PRIORITY.length + 1 : CONDITION_PRIORITY.length;
}
function flattenExportTargets(value, out2) {
  if (out2.length >= MAX_EXPORT_TARGETS) return;
  if (typeof value === "string") {
    if (!out2.includes(value)) out2.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) flattenExportTargets(v, out2);
  } else if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort((a, b) => conditionRank(a) - conditionRank(b) || (a < b ? -1 : a > b ? 1 : 0));
    for (const k of keys) flattenExportTargets(value[k], out2);
  }
}
function parseExportEntries(exportsField) {
  if (exportsField === void 0 || exportsField === null) return [];
  const entries = [];
  const push = (key, value) => {
    const targets = [];
    flattenExportTargets(value, targets);
    if (targets.length) entries.push({ key, star: key.includes("*"), targets });
  };
  if (typeof exportsField === "string" || Array.isArray(exportsField)) {
    push(".", exportsField);
  } else if (typeof exportsField === "object") {
    const keys = Object.keys(exportsField);
    if (keys.every((k) => k === "." || k.startsWith("./"))) {
      for (const k of keys) push(k, exportsField[k]);
    } else {
      push(".", exportsField);
    }
  }
  entries.sort((a, b) => Number(a.star) - Number(b.star) || b.key.length - a.key.length || (a.key < b.key ? -1 : 1));
  return entries;
}
function parseGoReplaces(text, modDir) {
  const out2 = [];
  const addLine = (line2) => {
    const m = /^\s*([^\s=]+)(?:\s+v\S+)?\s*=>\s*(\S+)(?:\s+v\S+)?\s*$/.exec(line2);
    if (!m) return;
    const target = m[2];
    if (!/^\.\.?\//.test(target)) return;
    const toDir = norm2(posix.join(modDir, target));
    if (toDir.startsWith("..")) return;
    out2.push({ from: m[1], toDir });
  };
  for (const m of text.matchAll(/^[ \t]*replace[ \t]+([^(\r\n][^\r\n]*)$/gm)) addLine(m[1]);
  for (const b of text.matchAll(/^[ \t]*replace[ \t]*\(([\s\S]*?)\)/gm)) {
    for (const line2 of b[1].split(/\r?\n/)) addLine(line2);
  }
  return out2;
}
function buildResolveContext(scan2) {
  const fileSet = new Set(scan2.files.map((f) => f.rel));
  const filesByDir = /* @__PURE__ */ new Map();
  const dirSet = /* @__PURE__ */ new Set();
  for (const f of scan2.files) {
    const dir = f.rel.includes("/") ? posix.dirname(f.rel) : "";
    let list = filesByDir.get(dir);
    if (!list) filesByDir.set(dir, list = []);
    list.push(f.rel);
    let d = dir;
    while (d) {
      if (dirSet.has(d)) break;
      dirSet.add(d);
      d = d.includes("/") ? posix.dirname(d) : "";
    }
  }
  const warnings = [];
  const tsConfigs = [];
  for (const rel of fileSet) {
    const base = rel.slice(rel.lastIndexOf("/") + 1);
    const isRootBase = rel === "tsconfig.base.json";
    if (base !== "tsconfig.json" && base !== "jsconfig.json" && !isRootBase) continue;
    const dir = rel.includes("/") ? posix.dirname(rel) : "";
    const eff = readTsConfig(scan2.root, fileSet, rel, warnings, /* @__PURE__ */ new Set());
    if (!eff?.paths) continue;
    const tsPaths = [];
    for (const [alias, targets] of Object.entries(eff.paths)) {
      if (!Array.isArray(targets)) continue;
      const star = alias.endsWith("*");
      tsPaths.push({ prefix: star ? alias.slice(0, -1) : alias, star, targets });
    }
    if (!tsPaths.length) continue;
    const baseUrl = eff.baseUrl !== void 0 ? norm2(posix.join(eff.baseUrlDir, eff.baseUrl)).replace(/^\.$/, "") : eff.pathsDir;
    tsConfigs.push({ dir, baseUrl, paths: tsPaths });
  }
  tsConfigs.sort((a, b) => b.dir.length - a.dir.length);
  const goModules = [];
  for (const rel of fileSet) {
    if (rel !== "go.mod" && !rel.endsWith("/go.mod")) continue;
    const text = readText(join32(scan2.root, rel));
    const m = /^\s*module\s+(\S+)/m.exec(text);
    if (!m) continue;
    const dir = rel.includes("/") ? posix.dirname(rel) : "";
    goModules.push({ module: m[1], dir, replaces: parseGoReplaces(text, dir) });
  }
  goModules.sort((a, b) => b.dir.length - a.dir.length || (a.dir < b.dir ? -1 : 1));
  const rustCrates = [];
  for (const rel of fileSet) {
    if (rel !== "Cargo.toml" && !rel.endsWith("/Cargo.toml")) continue;
    const text = readText(join32(scan2.root, rel));
    const m = /\[package\][^[]*?^\s*name\s*=\s*"([^"]+)"/ms.exec(text);
    if (!m) continue;
    const dir = rel.includes("/") ? posix.dirname(rel) : "";
    const srcDir = norm2(posix.join(dir, "src")).replace(/^\.$/, "");
    const rootFile = firstThat(fileSet, [posix.join(srcDir, "lib.rs"), posix.join(srcDir, "main.rs")]);
    rustCrates.push({ name: m[1].replace(/-/g, "_"), dir, srcDir, rootFile });
  }
  rustCrates.sort((a, b) => b.dir.length - a.dir.length || (a.dir < b.dir ? -1 : 1));
  const javaRoots = /* @__PURE__ */ new Set();
  for (const f of scan2.files) {
    if (f.ext !== ".java" || !f.pkg) continue;
    const dir = f.rel.includes("/") ? posix.dirname(f.rel) : "";
    const pkgPath = f.pkg.replace(/\./g, "/");
    if (dir === pkgPath) javaRoots.add("");
    else if (dir.endsWith("/" + pkgPath)) javaRoots.add(dir.slice(0, -pkgPath.length - 1));
  }
  const pyRoots = /* @__PURE__ */ new Set([""]);
  for (const rel of fileSet) {
    const base = rel.split("/").pop();
    if (base === "__init__.py" || base === "pyproject.toml" || base === "setup.py") {
      pyRoots.add(rel.includes("/") ? posix.dirname(rel) : "");
    }
  }
  const workspacePackages = [];
  for (const rel of fileSet) {
    if (rel !== "package.json" && !rel.endsWith("/package.json")) continue;
    const pkg = tolerantJsonParse(readText(join32(scan2.root, rel)));
    if (pkg === void 0) {
      warnings.push(`unparseable ${rel} \u2014 skipped for workspace resolution`);
      continue;
    }
    if (typeof pkg.name !== "string") continue;
    const mainCandidates = [pkg.source, pkg.main, pkg.module, pkg.types].filter(
      (v) => typeof v === "string"
    );
    workspacePackages.push({
      name: pkg.name,
      dir: rel.includes("/") ? posix.dirname(rel) : "",
      exportEntries: parseExportEntries(pkg.exports),
      mainCandidates
    });
  }
  workspacePackages.sort((a, b) => b.name.length - a.name.length);
  const cIncludeRoots = /* @__PURE__ */ new Set([""]);
  for (const d of dirSet) {
    const base = d.slice(d.lastIndexOf("/") + 1);
    if (base === "include" || base === "inc" || base === "src") cIncludeRoots.add(d);
  }
  const rubyLibRoots = /* @__PURE__ */ new Set([""]);
  for (const d of dirSet) if (d.slice(d.lastIndexOf("/") + 1) === "lib") rubyLibRoots.add(d);
  const phpPsr4 = [];
  for (const rel of fileSet) {
    if (rel !== "composer.json" && !rel.endsWith("/composer.json")) continue;
    const composer = tolerantJsonParse(readText(join32(scan2.root, rel)));
    if (!composer) {
      warnings.push(`unparseable ${rel} \u2014 skipped for PHP PSR-4 resolution`);
      continue;
    }
    const baseDir = rel.includes("/") ? posix.dirname(rel) : "";
    for (const block of [composer.autoload?.["psr-4"], composer["autoload-dev"]?.["psr-4"]]) {
      if (!block) continue;
      for (const [prefix, dirs] of Object.entries(block)) {
        for (const d of Array.isArray(dirs) ? dirs : [dirs]) {
          if (typeof d !== "string") continue;
          phpPsr4.push({ prefix: prefix.replace(/\\+$/, ""), dir: norm2(posix.join(baseDir, d)).replace(/^\.$/, "") });
        }
      }
    }
  }
  phpPsr4.sort((a, b) => b.prefix.length - a.prefix.length);
  const csharpNamespaces = /* @__PURE__ */ new Map();
  for (const f of scan2.files) {
    if (f.ext !== ".cs" || !f.pkg) continue;
    let arr = csharpNamespaces.get(f.pkg);
    if (!arr) csharpNamespaces.set(f.pkg, arr = []);
    arr.push(f.rel);
  }
  for (const arr of csharpNamespaces.values()) arr.sort(byStr);
  return {
    fileSet,
    dirSet,
    filesByDir,
    tsConfigs,
    goModules,
    rustCrates,
    javaRoots: [...javaRoots].sort(byLen),
    pyRoots: [...pyRoots],
    workspacePackages,
    cIncludeRoots: [...cIncludeRoots].sort(byLen),
    rubyLibRoots: [...rubyLibRoots].sort(byLen),
    phpPsr4,
    csharpNamespaces,
    warnings
  };
}
function firstExisting(ctx, candidates) {
  for (const c2 of candidates) {
    const n = norm2(c2);
    if (n && !n.startsWith("..") && ctx.fileSet.has(n)) return n;
  }
  return void 0;
}
function resolveDocLink(fromRel, spec, ctx) {
  let target = spec.split("#")[0].split("?")[0];
  if (!target) return { kind: "external" };
  if (target.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(target)) return { kind: "external" };
  const base = fromRel.includes("/") ? posix.dirname(fromRel) : "";
  const p = norm2(posix.join(base, target));
  if (p.startsWith("..")) return { kind: "dangling", reason: "escapes-repo-root" };
  const hit = firstExisting(ctx, [
    p,
    p + ".md",
    p + ".mdx",
    posix.join(p, "README.md"),
    posix.join(p, "readme.md"),
    posix.join(p, "index.md"),
    posix.join(p, "index.mdx")
  ]);
  if (hit) return { kind: "resolved", target: hit };
  if (ctx.dirSet.has(p)) return { kind: "external" };
  return { kind: "dangling", reason: "missing-target" };
}
function resolveJs(fromRel, spec, ctx) {
  const probe = (p) => firstExisting(ctx, [...JS_EXT_PROBES.map((e) => p + e), ...JS_INDEX.map((i2) => posix.join(p, i2))]);
  const tryResolve = (p) => {
    const hit = probe(p);
    if (hit) return hit;
    const noJs = p.replace(/\.(js|jsx|mjs|cjs)$/, "");
    return noJs !== p ? probe(noJs) : void 0;
  };
  if (spec.startsWith(".")) {
    const base = fromRel.includes("/") ? posix.dirname(fromRel) : "";
    const p = norm2(posix.join(base, spec));
    if (p.startsWith("..")) return { kind: "dangling", reason: "escapes-repo-root" };
    const hit = tryResolve(p);
    return hit ? { kind: "resolved", target: hit } : { kind: "dangling", reason: "missing-module" };
  }
  let aliasFallback;
  for (const cfg of ctx.tsConfigs) {
    if (cfg.dir && fromRel !== cfg.dir && !fromRel.startsWith(cfg.dir + "/")) continue;
    let matched = false;
    for (const tp of cfg.paths) {
      if (!(tp.star ? spec.startsWith(tp.prefix) : spec === tp.prefix)) continue;
      matched = true;
      const suffix = tp.star ? spec.slice(tp.prefix.length) : "";
      let targetTreeExists = false;
      for (const t of tp.targets) {
        const resolved = tp.star ? t.replace(/\*/, suffix) : t;
        const p = norm2(posix.join(cfg.baseUrl, resolved));
        const hit = tryResolve(p);
        if (hit) return { kind: "resolved", target: hit };
        const tdir = p.includes("/") ? posix.dirname(p) : "";
        if (ctx.dirSet.has(tdir) || ctx.fileSet.has(p)) targetTreeExists = true;
      }
      aliasFallback = targetTreeExists ? { kind: "dangling", reason: "alias-unresolved" } : { kind: "external" };
      break;
    }
    if (matched) break;
  }
  for (const pkg of ctx.workspacePackages) {
    if (spec !== pkg.name && !spec.startsWith(pkg.name + "/")) continue;
    const sub = spec.slice(pkg.name.length).replace(/^\//, "");
    const probeEntry = (entry) => {
      for (const cand of [entry, ...distToSrcCandidates(entry)]) {
        const hit = tryResolve(norm2(posix.join(pkg.dir, cand)));
        if (hit) return hit;
      }
      return void 0;
    };
    const subKey = sub ? "./" + sub : ".";
    for (const entry of pkg.exportEntries) {
      let fill;
      if (entry.star) {
        const starAt = entry.key.indexOf("*");
        const pre = entry.key.slice(0, starAt);
        const post = entry.key.slice(starAt + 1);
        if (!subKey.startsWith(pre) || !subKey.endsWith(post) || subKey.length < pre.length + post.length) continue;
        fill = subKey.slice(pre.length, subKey.length - post.length);
      } else if (entry.key !== subKey) continue;
      for (const t of entry.targets) {
        const hit = probeEntry(fill === void 0 ? t : t.replace(/\*/g, fill));
        if (hit) return { kind: "resolved", target: hit };
      }
      break;
    }
    if (!sub) {
      for (const m of pkg.mainCandidates) {
        const hit = probeEntry(m);
        if (hit) return { kind: "resolved", target: hit };
      }
    }
    const bases = sub ? [posix.join(pkg.dir, "src", sub), posix.join(pkg.dir, sub)] : [posix.join(pkg.dir, "src", "index"), posix.join(pkg.dir, "index"), posix.join(pkg.dir, "src")];
    for (const b of bases) {
      const hit = tryResolve(norm2(b));
      if (hit) return { kind: "resolved", target: hit };
    }
    return { kind: "external" };
  }
  return aliasFallback ?? { kind: "external" };
}
function resolvePython(fromRel, spec, ctx) {
  const probeModule = (dir, dotted) => {
    const sub = dotted ? dotted.replace(/\./g, "/") : "";
    const base = norm2(posix.join(dir, sub));
    return firstExisting(ctx, [base + ".py", base + ".pyi", posix.join(base, "__init__.py")]);
  };
  if (spec.startsWith(".")) {
    const dots = /^\.+/.exec(spec)[0].length;
    const rest = spec.slice(dots);
    const base = fromRel.includes("/") ? posix.dirname(fromRel) : "";
    let dir = base;
    for (let i2 = 1; i2 < dots; i2++) dir = dir.includes("/") ? posix.dirname(dir) : "";
    const hit = rest ? probeModule(dir, rest) : firstExisting(ctx, [posix.join(norm2(dir), "__init__.py")]);
    return hit ? { kind: "resolved", target: hit } : { kind: "dangling", reason: "missing-module" };
  }
  for (const root of ctx.pyRoots) {
    const hit = probeModule(root, spec);
    if (hit) return { kind: "resolved", target: hit };
  }
  return { kind: "external" };
}
function resolveGo(fromRel, spec, ctx) {
  if (!ctx.goModules.length) return { kind: "external" };
  const probePkg = (dir) => {
    const d = norm2(dir).replace(/^\.$/, "");
    const inDir = (ctx.filesByDir.get(d) ?? []).filter((f) => f.endsWith(".go")).sort();
    return inDir.length ? { kind: "resolved", target: inDir[0] } : { kind: "dangling", reason: "missing-package" };
  };
  const home = ctx.goModules.find((g) => !g.dir || fromRel === g.dir || fromRel.startsWith(g.dir + "/"));
  if (home) {
    for (const r of home.replaces) {
      if (spec !== r.from && !spec.startsWith(r.from + "/")) continue;
      const sub = spec.slice(r.from.length).replace(/^\//, "");
      return probePkg(posix.join(r.toDir, sub));
    }
  }
  const ordered = home ? [home, ...ctx.goModules.filter((g) => g !== home)] : ctx.goModules;
  for (const g of ordered) {
    if (spec !== g.module && !spec.startsWith(g.module + "/")) continue;
    const sub = spec.slice(g.module.length).replace(/^\//, "");
    return probePkg(posix.join(g.dir, sub));
  }
  return { kind: "external" };
}
function resolveRust(fromRel, spec, ctx) {
  if (!ctx.rustCrates.length) return { kind: "external" };
  const probeMod = (dir, name2) => firstExisting(ctx, [posix.join(dir, name2 + ".rs"), posix.join(dir, name2, "mod.rs")]);
  const walkPath = (baseDir2, segs2) => {
    for (let n = segs2.length; n >= 1; n--) {
      const dir = norm2(posix.join(baseDir2, ...segs2.slice(0, n - 1)));
      const hit2 = probeMod(dir, segs2[n - 1]);
      if (hit2) return hit2;
    }
    return void 0;
  };
  const fromDir = fromRel.includes("/") ? posix.dirname(fromRel) : "";
  const stem = fromRel.slice(fromRel.lastIndexOf("/") + 1).replace(/\.rs$/, "");
  const isRootish = stem === "mod" || stem === "lib" || stem === "main";
  const childDir = isRootish ? fromDir : posix.join(fromDir, stem);
  if (spec.startsWith("mod ")) {
    const name2 = spec.slice(4);
    const hit2 = probeMod(childDir, name2) ?? (isRootish ? void 0 : probeMod(fromDir, name2));
    return hit2 ? { kind: "resolved", target: hit2 } : { kind: "dangling", reason: "missing-module" };
  }
  const segs = spec.split("::").map((s) => s.trim()).filter(Boolean);
  if (!segs.length) return { kind: "external" };
  const head = segs[0];
  const home = ctx.rustCrates.find((c2) => !c2.dir || fromRel === c2.dir || fromRel.startsWith(c2.dir + "/"));
  let baseDir;
  let rest = [];
  if (head === "crate" && home) {
    baseDir = home.srcDir;
    rest = segs.slice(1);
  } else if (head === "self") {
    baseDir = childDir;
    rest = segs.slice(1);
  } else if (head === "super") {
    let dir = isRootish ? fromDir.includes("/") ? posix.dirname(fromDir) : "" : fromDir;
    let i2 = 1;
    while (i2 < segs.length && segs[i2] === "super") {
      dir = dir.includes("/") ? posix.dirname(dir) : "";
      i2++;
    }
    baseDir = dir;
    rest = segs.slice(i2);
  } else {
    const target = ctx.rustCrates.find((c2) => c2.name === head);
    if (target) {
      const walked = walkPath(target.srcDir, segs.slice(1));
      if (walked) return { kind: "resolved", target: walked };
      if (target.rootFile) return { kind: "resolved", target: target.rootFile };
    }
    return { kind: "external" };
  }
  if (!rest.length) return { kind: "external" };
  const hit = walkPath(baseDir, rest);
  if (hit) return { kind: "resolved", target: hit };
  if (home && baseDir === home.srcDir && home.rootFile) return { kind: "resolved", target: home.rootFile };
  const ownerDir = baseDir.includes("/") ? posix.dirname(baseDir) : "";
  const ownerName = baseDir.slice(baseDir.lastIndexOf("/") + 1);
  const owner = ownerName ? probeMod(ownerDir, ownerName) : void 0;
  if (owner && owner !== fromRel) return { kind: "resolved", target: owner };
  return { kind: "external" };
}
function resolveJava(spec, ctx) {
  if (!ctx.javaRoots.length) return { kind: "external" };
  const probe = (pkgPath) => {
    for (const root of ctx.javaRoots) {
      const p = norm2(posix.join(root, pkgPath));
      if (p.endsWith("/*") || p === "*") {
        const dir = p === "*" ? "" : p.slice(0, -2);
        const inDir = (ctx.filesByDir.get(dir) ?? []).filter((f) => f.endsWith(".java")).sort();
        if (inDir.length) return inDir[0];
        continue;
      }
      if (ctx.fileSet.has(p + ".java")) return p + ".java";
    }
    return void 0;
  };
  const path = spec.replace(/\./g, "/");
  let hit = probe(path);
  if (!hit && !spec.endsWith(".*")) {
    const segs = path.split("/");
    for (let n = segs.length - 1; n >= 2 && !hit; n--) {
      hit = probe(segs.slice(0, n).join("/"));
    }
  }
  return hit ? { kind: "resolved", target: hit } : { kind: "external" };
}
function resolveC(fromRel, spec, ctx) {
  const fromDir = fromRel.includes("/") ? posix.dirname(fromRel) : "";
  const hit = firstExisting(ctx, [posix.join(fromDir, spec), ...ctx.cIncludeRoots.map((r) => posix.join(r, spec))]);
  return hit ? { kind: "resolved", target: hit } : { kind: "dangling", reason: "missing-include" };
}
function resolveRuby(fromRel, spec, ctx) {
  if (spec.startsWith(".")) {
    const fromDir = fromRel.includes("/") ? posix.dirname(fromRel) : "";
    const base = norm2(posix.join(fromDir, spec));
    const hit = firstExisting(ctx, [base + ".rb", posix.join(base, "index.rb")]);
    return hit ? { kind: "resolved", target: hit } : { kind: "dangling", reason: "missing-module" };
  }
  for (const root of ctx.rubyLibRoots) {
    const hit = firstExisting(ctx, [posix.join(root, spec + ".rb")]);
    if (hit) return { kind: "resolved", target: hit };
  }
  return { kind: "external" };
}
function resolvePhp(fromRel, spec, ctx) {
  if (spec.startsWith(".")) {
    const fromDir = fromRel.includes("/") ? posix.dirname(fromRel) : "";
    const base = norm2(posix.join(fromDir, spec));
    const hit = firstExisting(ctx, [base, base + ".php"]);
    return hit ? { kind: "resolved", target: hit } : { kind: "dangling", reason: "missing-module" };
  }
  const ns = spec.replace(/^\\+/, "");
  for (const { prefix, dir } of ctx.phpPsr4) {
    if (prefix && ns !== prefix && !ns.startsWith(prefix + "\\")) continue;
    const rest = prefix ? ns.slice(prefix.length).replace(/^\\+/, "") : ns;
    const hit = firstExisting(ctx, [posix.join(dir, rest.replace(/\\/g, "/")) + ".php"]);
    if (hit) return { kind: "resolved", target: hit };
  }
  return { kind: "external" };
}
function resolveCsharp(spec, ctx) {
  const exact = ctx.csharpNamespaces.get(spec);
  if (exact?.length) return { kind: "resolved", target: exact[0] };
  let best;
  for (const [ns, files] of ctx.csharpNamespaces) {
    if (ns === spec || ns.startsWith(spec + ".")) {
      const f = files[0];
      if (best === void 0 || byStr(f, best) < 0) best = f;
    }
  }
  return best ? { kind: "resolved", target: best } : { kind: "external" };
}
function resolveImport(fromRel, ext, spec, ctx) {
  const dot = spec.lastIndexOf(".");
  if (dot !== -1 && ASSET_EXT.has(spec.slice(dot).toLowerCase().replace(/[?#].*$/, ""))) {
    return { kind: "external" };
  }
  if (JS_TS2.has(ext)) return resolveJs(fromRel, spec, ctx);
  if (PY2.has(ext)) return resolvePython(fromRel, spec, ctx);
  if (ext === ".go") return resolveGo(fromRel, spec, ctx);
  if (ext === ".rs") return resolveRust(fromRel, spec, ctx);
  if (ext === ".java") return resolveJava(spec, ctx);
  if (C_CPP2.has(ext)) return resolveC(fromRel, spec, ctx);
  if (ext === ".rb" || ext === ".rake") return resolveRuby(fromRel, spec, ctx);
  if (ext === ".php") return resolvePhp(fromRel, spec, ctx);
  if (ext === ".cs") return resolveCsharp(spec, ctx);
  return { kind: "external" };
}
var ASSET_EXT;
var JS_EXT_PROBES;
var JS_INDEX;
var JS_TS2;
var PY2;
var C_CPP2;
var BUILD_DIRS;
var CONDITION_PRIORITY;
var MAX_EXPORT_TARGETS;
var init_resolve = __esm({
  "src/resolve.ts"() {
    "use strict";
    init_walk();
    init_sort();
    ASSET_EXT = /* @__PURE__ */ new Set([
      ".svg",
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".webp",
      ".bmp",
      ".ico",
      ".icns",
      ".pdf",
      ".woff",
      ".woff2",
      ".ttf",
      ".otf",
      ".eot",
      ".mp3",
      ".mp4",
      ".mov",
      ".avi",
      ".webm",
      ".wav",
      ".flac",
      ".ogg",
      ".map"
    ]);
    JS_EXT_PROBES = ["", ".ts", ".tsx", ".d.ts", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
    JS_INDEX = ["index.ts", "index.tsx", "index.js", "index.jsx", "index.mjs", "index.cjs"];
    JS_TS2 = /* @__PURE__ */ new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
    PY2 = /* @__PURE__ */ new Set([".py", ".pyi"]);
    C_CPP2 = /* @__PURE__ */ new Set([".c", ".h", ".cc", ".cpp", ".cxx", ".hpp", ".hh"]);
    BUILD_DIRS = /* @__PURE__ */ new Set(["dist", "build", "lib", "out", "output", "esm", "cjs", "umd"]);
    CONDITION_PRIORITY = ["source", "ts", "import", "module", "require", "node", "default"];
    MAX_EXPORT_TARGETS = 8;
  }
});
function isTestFile(rel) {
  return TEST_FILE.test(rel.split("/").pop());
}
function dirOf(rel) {
  return rel.includes("/") ? posix2.dirname(rel) : ROOT_PATH;
}
function tierForPath(path) {
  if (path === ROOT_PATH) return 0;
  if (TIER2_ANY.test(path) || TIER2_LEAF.test(path)) return 2;
  if (TIER0.test(path)) return 0;
  return null;
}
function tierOf(path, members) {
  const byPath = tierForPath(path);
  if (byPath !== null) return byPath;
  if (members.every((m) => m.kind === "doc" || m.kind === "config" || isTestFile(m.rel))) return 2;
  return 1;
}
function summaryOf(path, members) {
  const readme = members.find((m) => /^(readme|index)\.(md|mdx)$/i.test(m.rel.split("/").pop()));
  if (readme?.summary) return readme.summary;
  if (readme?.title) return readme.title;
  const withSummary = members.filter((m) => m.summary).sort((a, b) => (b.summary?.length ?? 0) - (a.summary?.length ?? 0));
  if (withSummary[0]?.summary) return withSummary[0].summary;
  const langs = [...new Set(members.map((m) => m.lang))].filter((l) => l !== "other");
  const where = path === ROOT_PATH ? "the repository root" : `\`${path}/\``;
  return `${members.length} file(s) in ${where}${langs.length ? ` (${langs.slice(0, 3).join(", ")})` : ""}.`;
}
function buildModules(scan2) {
  const byDir = /* @__PURE__ */ new Map();
  for (const f of scan2.files) {
    const dir = dirOf(f.rel);
    let list = byDir.get(dir);
    if (!list) byDir.set(dir, list = []);
    list.push(f);
  }
  const dirs = [...byDir.keys()].sort(byStr);
  const baseOf = /* @__PURE__ */ new Map();
  const baseCount = /* @__PURE__ */ new Map();
  for (const dir of dirs) {
    const b = dir === ROOT_PATH ? "root" : slugify2(dir);
    baseOf.set(dir, b);
    baseCount.set(b, (baseCount.get(b) ?? 0) + 1);
  }
  const slugForDir = (dir) => {
    const b = baseOf.get(dir);
    return b && baseCount.get(b) === 1 ? b : `${b || "module"}-${sha1(dir).slice(0, 8)}`;
  };
  const modules = [];
  const moduleOf = /* @__PURE__ */ new Map();
  for (const dir of dirs) {
    const members = byDir.get(dir).slice().sort((a, b) => byStr(a.rel, b.rel));
    const slug = slugForDir(dir);
    const info2 = {
      slug,
      path: dir,
      title: dir,
      tier: tierOf(dir, members),
      members: members.map((m) => m.rel),
      summary: summaryOf(dir, members)
    };
    modules.push(info2);
    for (const m of members) moduleOf.set(m.rel, slug);
  }
  modules.sort((a, b) => byStr(a.slug, b.slug));
  return { modules, moduleOf };
}
var ROOT_PATH;
var TIER0;
var TIER2_ANY;
var TIER2_LEAF;
var TEST_FILE;
var init_modules = __esm({
  "src/modules.ts"() {
    "use strict";
    init_util();
    init_hash();
    init_sort();
    ROOT_PATH = "(root)";
    TIER0 = /(^|\/)(types?|util|utils|lib|libs|common|core|config|configs|constants|shared|helpers|internal)$/i;
    TIER2_ANY = /(^|\/)(tests?|__tests?__|__mocks?__|__snapshots?__|spec|specs|e2e|examples?|example|benchmark|benchmarks|fixtures?|docs?|documentation|\.github)(\/|$)/i;
    TIER2_LEAF = /(^|\/)(scripts?|bin|\.storybook)$/i;
    TEST_FILE = /\.(test|spec|e2e|stories|story)\.[cm]?[jt]sx?$/i;
  }
});
function familyOf(lang) {
  if (lang === "typescript" || lang === "javascript") return "js";
  if (lang === "c" || lang === "cpp") return "c";
  return lang;
}
function sharedSegments(a, b) {
  const as = a.split("/");
  const bs = b.split("/");
  let n = 0;
  while (n < as.length && n < bs.length && as[n] === bs[n]) n++;
  return n;
}
function pickCandidate(callerRel, cands) {
  if (cands.length === 1) return cands[0];
  if (cands.length === 0) return void 0;
  let best;
  let bestScore = -1;
  let tied = false;
  for (const c2 of cands) {
    const s = sharedSegments(callerRel, c2.file);
    if (s > bestScore) {
      bestScore = s;
      best = c2;
      tied = false;
    } else if (s === bestScore) {
      tied = true;
    }
  }
  return tied ? void 0 : best;
}
function resolveCallEdges(scan2, importPairs) {
  const defs = /* @__PURE__ */ new Map();
  const seen = /* @__PURE__ */ new Set();
  for (const f of scan2.files) {
    for (const s of f.symbols) {
      if (!s.exported || REFERENCE_KINDS.has(s.kind)) continue;
      const dedup = `${s.name} ${s.file}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);
      let arr = defs.get(s.name);
      if (!arr) defs.set(s.name, arr = []);
      arr.push({ file: s.file, lang: s.lang });
    }
  }
  const agg = /* @__PURE__ */ new Map();
  for (const f of scan2.files) {
    if (!f.calls?.length) continue;
    const family = familyOf(f.lang);
    const ownNames = new Set(f.symbols.map((s) => s.name));
    const counts = /* @__PURE__ */ new Map();
    for (const c2 of f.calls) counts.set(c2.name, (counts.get(c2.name) ?? 0) + 1);
    for (const [name2, count] of counts) {
      if (ownNames.has(name2)) continue;
      const cands = (defs.get(name2) ?? []).filter((d) => familyOf(d.lang) === family && d.file !== f.rel);
      if (!cands.length) continue;
      const imported = cands.filter((d) => importPairs.has(`${f.rel}|${d.file}`));
      let chosen;
      let confidence;
      if (family === "js") {
        if (!imported.length) continue;
        chosen = pickCandidate(f.rel, imported);
        confidence = "extracted";
      } else if (imported.length) {
        chosen = pickCandidate(f.rel, imported);
        confidence = "extracted";
      } else {
        chosen = pickCandidate(f.rel, cands);
        confidence = "inferred";
      }
      if (!chosen) continue;
      const key = `${f.rel}|${chosen.file}`;
      const prev = agg.get(key);
      if (prev) {
        prev.weight += count;
        if (confidence === "extracted") prev.confidence = "extracted";
      } else {
        agg.set(key, { from: f.rel, to: chosen.file, weight: count, confidence });
      }
    }
  }
  return [...agg.values()].map((e) => ({ from: e.from, to: e.to, kind: "call", weight: Math.min(e.weight, 5), confidence: e.confidence })).sort((a, b) => byStr(a.from, b.from) || byStr(a.to, b.to));
}
var REFERENCE_KINDS;
var init_calls = __esm({
  "src/calls.ts"() {
    "use strict";
    init_sort();
    REFERENCE_KINDS = /* @__PURE__ */ new Set(["reexport", "reexport-all", "default"]);
  }
});
function isDistinctive(name2) {
  if (name2.length < 5) return false;
  const internalUpper = /[a-z][A-Z]/.test(name2) || /[A-Z]{2}/.test(name2);
  return internalUpper || name2.includes("_") || /\d/.test(name2);
}
function uniqueSymbolDefs(scan2) {
  const byName = /* @__PURE__ */ new Map();
  for (const f of scan2.files) {
    for (const s of f.symbols) {
      if (!s.exported || REFERENCE_KINDS2.has(s.kind) || !isDistinctive(s.name)) continue;
      let set = byName.get(s.name);
      if (!set) byName.set(s.name, set = /* @__PURE__ */ new Set());
      set.add(f.rel);
    }
  }
  const unique = /* @__PURE__ */ new Map();
  for (const [name2, files] of byName) if (files.size === 1) unique.set(name2, [...files][0]);
  return unique;
}
function collect(edges, e) {
  const k = keyOf(e.from, e.to, e.kind);
  const prev = edges.get(k);
  if (prev) {
    prev.weight += e.weight;
    return;
  }
  edges.set(k, { ...e });
}
function buildGraph(scan2, ctx, modules, moduleOf, meta) {
  const fileEdgeMap = /* @__PURE__ */ new Map();
  const importPairs = /* @__PURE__ */ new Set();
  for (const f of scan2.files) {
    for (const ref of f.refs) {
      if (ref.kind === "doc-link") {
        const r = resolveDocLink(f.rel, ref.spec, ctx);
        if (r.kind === "external") continue;
        if (r.kind === "dangling") {
          collect(fileEdgeMap, { from: f.rel, to: ref.spec, kind: "doc-link", weight: 1, dangling: true, reason: r.reason });
        } else if (r.target !== f.rel) {
          collect(fileEdgeMap, { from: f.rel, to: r.target, kind: "doc-link", weight: 1 });
        }
      } else {
        const r = resolveImport(f.rel, f.ext, ref.spec, ctx);
        if (r.kind === "external") continue;
        if (r.kind === "dangling") {
          collect(fileEdgeMap, { from: f.rel, to: ref.spec, kind: "import", weight: 1, dangling: true, reason: r.reason });
        } else if (r.target !== f.rel) {
          collect(fileEdgeMap, { from: f.rel, to: r.target, kind: "import", weight: 1 });
          importPairs.add(`${f.rel}|${r.target}`);
        }
      }
    }
  }
  const callPairs = /* @__PURE__ */ new Set();
  for (const e of resolveCallEdges(scan2, importPairs)) {
    collect(fileEdgeMap, e);
    callPairs.add(`${e.from}|${e.to}`);
  }
  const unique = uniqueSymbolDefs(scan2);
  if (unique.size) {
    for (const f of scan2.files) {
      if (f.kind !== "code" || !f.idents?.length) continue;
      const perTarget = /* @__PURE__ */ new Map();
      for (const id of f.idents) {
        const target = unique.get(id);
        if (!target || target === f.rel) continue;
        perTarget.set(target, (perTarget.get(target) ?? 0) + 1);
      }
      for (const [target, count] of perTarget) {
        const pair = `${f.rel}|${target}`;
        if (importPairs.has(pair) || callPairs.has(pair)) continue;
        collect(fileEdgeMap, { from: f.rel, to: target, kind: "use", weight: Math.min(count, 5) });
      }
    }
  }
  if (unique.size) {
    for (const f of scan2.files) {
      if (f.kind !== "doc") continue;
      const content = scan2.docText.get(f.rel) ?? readText(join42(scan2.root, f.rel));
      if (!content) continue;
      const tokens = /* @__PURE__ */ new Map();
      for (const tok of content.split(/[^A-Za-z0-9_]+/)) {
        if (unique.has(tok)) tokens.set(tok, (tokens.get(tok) ?? 0) + 1);
      }
      for (const [name2, count] of tokens) {
        const target = unique.get(name2);
        if (target === f.rel) continue;
        collect(fileEdgeMap, { from: f.rel, to: target, kind: "mention", weight: Math.min(count, 5) });
      }
    }
  }
  const fileEdges = [...fileEdgeMap.values()].sort(
    (a, b) => byStr(a.from, b.from) || byStr(a.to, b.to) || byStr(a.kind, b.kind)
  );
  const degIn = /* @__PURE__ */ new Map();
  const degOut = /* @__PURE__ */ new Map();
  const fileSet = new Set(scan2.files.map((f) => f.rel));
  for (const e of fileEdges) {
    if (e.dangling || !fileSet.has(e.to)) continue;
    degOut.set(e.from, (degOut.get(e.from) ?? 0) + 1);
    degIn.set(e.to, (degIn.get(e.to) ?? 0) + 1);
  }
  const KIND_RANK = { import: 5, call: 4, use: 3, "doc-link": 2, mention: 1, contains: 0 };
  const modEdgeMap = /* @__PURE__ */ new Map();
  for (const e of fileEdges) {
    if (e.dangling || !fileSet.has(e.to)) continue;
    const from = moduleOf.get(e.from);
    const to = moduleOf.get(e.to);
    if (!from || !to || from === to) continue;
    const k = `${from}\0${to}`;
    const prev = modEdgeMap.get(k);
    if (prev) {
      prev.weight += e.weight;
      if ((KIND_RANK[e.kind] ?? 0) > (KIND_RANK[prev.kind] ?? 0)) prev.kind = e.kind;
    } else {
      modEdgeMap.set(k, { from, to, kind: e.kind, weight: e.weight });
    }
  }
  const moduleEdges = [...modEdgeMap.values()].sort((a, b) => byStr(a.from, b.from) || byStr(a.to, b.to));
  const modDegIn = /* @__PURE__ */ new Map();
  const modDegOut = /* @__PURE__ */ new Map();
  for (const e of moduleEdges) {
    modDegOut.set(e.from, (modDegOut.get(e.from) ?? 0) + 1);
    modDegIn.set(e.to, (modDegIn.get(e.to) ?? 0) + 1);
  }
  const files = scan2.files.map((f) => ({
    id: f.rel,
    kind: "file",
    rel: f.rel,
    fileKind: f.kind,
    lang: f.lang,
    module: moduleOf.get(f.rel) ?? "root",
    title: f.title,
    summary: f.summary,
    symbols: f.symbols.length,
    lines: f.lines,
    degIn: degIn.get(f.rel) ?? 0,
    degOut: degOut.get(f.rel) ?? 0
  })).sort((a, b) => byStr(a.rel, b.rel));
  const symbolsByModule = /* @__PURE__ */ new Map();
  for (const f of scan2.files) {
    const slug = moduleOf.get(f.rel) ?? "root";
    symbolsByModule.set(slug, (symbolsByModule.get(slug) ?? 0) + f.symbols.length);
  }
  const moduleNodes = modules.map((m) => ({
    id: m.slug,
    kind: "module",
    slug: m.slug,
    path: m.path,
    title: m.title,
    summary: m.summary,
    tier: m.tier,
    members: m.members,
    symbols: symbolsByModule.get(m.slug) ?? 0,
    degIn: modDegIn.get(m.slug) ?? 0,
    degOut: modDegOut.get(m.slug) ?? 0
  })).sort((a, b) => byStr(a.slug, b.slug));
  return {
    schemaVersion: meta?.schemaVersion ?? SCHEMA_VERSION,
    version: meta?.version ?? ENGINE_VERSION,
    commit: scan2.commit,
    fileCount: scan2.files.length,
    languages: scan2.languages,
    files,
    modules: moduleNodes,
    fileEdges,
    moduleEdges
  };
}
var REFERENCE_KINDS2;
var keyOf;
var init_graph = __esm({
  "src/graph.ts"() {
    "use strict";
    init_types();
    init_resolve();
    init_calls();
    init_walk();
    init_sort();
    REFERENCE_KINDS2 = /* @__PURE__ */ new Set(["reexport", "reexport-all", "default"]);
    keyOf = (from, to, kind) => `${from}\0${to}\0${kind}`;
  }
});
function computeImportPairs(scan2) {
  const ctx = buildResolveContext(scan2);
  const pairs = /* @__PURE__ */ new Set();
  for (const f of scan2.files) {
    for (const ref of f.refs) {
      if (ref.kind !== "import") continue;
      const r = resolveImport(f.rel, f.ext, ref.spec, ctx);
      if (r.kind === "resolved" && r.target !== f.rel) pairs.add(`${f.rel}|${r.target}`);
    }
  }
  return pairs;
}
function buildCallerIndex(scan2, importPairs) {
  const pairs = importPairs ?? computeImportPairs(scan2);
  const defs = /* @__PURE__ */ new Map();
  for (const f of scan2.files) {
    const seen = /* @__PURE__ */ new Set();
    for (const s of f.symbols) {
      if (!s.exported || REFERENCE_KINDS3.has(s.kind)) continue;
      if (seen.has(s.name)) continue;
      seen.add(s.name);
      let arr = defs.get(s.name);
      if (!arr) defs.set(s.name, arr = []);
      arr.push(s);
    }
  }
  const localDefs = /* @__PURE__ */ new Map();
  for (const f of scan2.files) {
    const byName = /* @__PURE__ */ new Map();
    for (const s of f.symbols) {
      if (!REFERENCE_KINDS3.has(s.kind) && !byName.has(s.name)) byName.set(s.name, s);
    }
    localDefs.set(f.rel, byName);
  }
  const sites = /* @__PURE__ */ new Map();
  const record = (def, caller) => {
    let entry = sites.get(def.name + "\0" + def.file);
    if (!entry) sites.set(def.name + "\0" + def.file, entry = { def, callers: [] });
    entry.callers.push(caller);
  };
  for (const f of scan2.files) {
    if (!f.calls?.length) continue;
    const family = familyOf(f.lang);
    const own = localDefs.get(f.rel);
    for (const c2 of f.calls) {
      const local = own.get(c2.name);
      if (local) {
        if (local.line !== c2.line) record(local, { file: f.rel, line: c2.line });
        continue;
      }
      const cands = (defs.get(c2.name) ?? []).filter((d) => familyOf(d.lang) === family && d.file !== f.rel).map((d) => ({ file: d.file, lang: d.lang }));
      if (!cands.length) continue;
      const imported = cands.filter((d) => pairs.has(`${f.rel}|${d.file}`));
      const chosen = family === "js" ? imported.length ? pickCandidate(f.rel, imported) : void 0 : imported.length ? pickCandidate(f.rel, imported) : pickCandidate(f.rel, cands);
      if (!chosen) continue;
      const def = defs.get(c2.name).find((d) => d.file === chosen.file);
      record(def, { file: f.rel, line: c2.line });
    }
  }
  const index = /* @__PURE__ */ new Map();
  const keys = [...sites.keys()].sort(byStr);
  for (const key of keys) {
    const { def, callers } = sites.get(key);
    callers.sort((a, b) => byStr(a.file, b.file) || a.line - b.line);
    if (!index.has(def.name)) index.set(def.name, { def, callers });
    else index.set(`${def.name}@${def.file}`, { def, callers });
  }
  return index;
}
function enclosingSymbol(scan2, file, line2) {
  const f = scan2.files.find((x) => x.rel === file);
  if (!f?.symbols.length) return void 0;
  let best;
  for (const s of f.symbols) {
    if (REFERENCE_KINDS3.has(s.kind)) continue;
    if (s.line > line2) continue;
    if (s.endLine !== void 0 && line2 > s.endLine) continue;
    if (!best || s.line > best.line || s.line === best.line && (s.endLine ?? Infinity) <= (best.endLine ?? Infinity)) {
      best = s;
    }
  }
  return best;
}
var REFERENCE_KINDS3;
var init_callers = __esm({
  "src/callers.ts"() {
    "use strict";
    init_calls();
    init_resolve();
    init_sort();
    REFERENCE_KINDS3 = /* @__PURE__ */ new Set(["reexport", "reexport-all", "default"]);
  }
});
function readJson(path) {
  const raw = readText(path);
  if (!raw) return void 0;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function tomlSectionBody(toml, section) {
  const re = new RegExp(`^\\[${section}\\]\\s*$([\\s\\S]*?)(?=^\\[|$(?![\\s\\S]))`, "m");
  const m = toml.match(re);
  return m ? m[1] : null;
}
function tomlStringArray(body2, key) {
  const m = body2.match(new RegExp(`${key}\\s*=\\s*\\[([^\\]]*)\\]`));
  if (!m) return [];
  return m[1].split(/\r?\n/).map((line2) => line2.replace(/#.*$/, "")).join("\n").split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
}
function wsGlobToRegExp(pat) {
  let re = "";
  for (let i2 = 0; i2 < pat.length; i2++) {
    const c2 = pat[i2];
    if (c2 === "*") {
      if (pat[i2 + 1] === "*") {
        re += ".*";
        i2++;
        if (pat[i2 + 1] === "/") i2++;
      } else {
        re += "[^/]*";
      }
    } else if ("\\^$.|?+()[]{}".includes(c2)) {
      re += "\\" + c2;
    } else {
      re += c2;
    }
  }
  return new RegExp(`^${re}($|/)`);
}
function packageAt(root, dir, kind) {
  const abs = join5(root, dir);
  const pkgJson = join5(abs, "package.json");
  if (existsSync22(pkgJson)) {
    const pkg = readJson(pkgJson);
    const name2 = typeof pkg?.name === "string" && pkg.name ? pkg.name : dir.split("/").pop();
    return { name: name2, dir, kind, manifest: `${dir}/package.json` };
  }
  const cargo = join5(abs, "Cargo.toml");
  if (existsSync22(cargo)) {
    const body2 = tomlSectionBody(readText(cargo), "package");
    const name2 = body2?.match(/name\s*=\s*["']([^"']+)["']/)?.[1] ?? dir.split("/").pop();
    return { name: name2, dir, kind: "cargo", manifest: `${dir}/Cargo.toml` };
  }
  const gomod = join5(abs, "go.mod");
  if (existsSync22(gomod)) {
    const name2 = readText(gomod).match(/^module\s+(\S+)/m)?.[1] ?? dir.split("/").pop();
    return { name: name2, dir, kind: "go", manifest: `${dir}/go.mod` };
  }
  const pom = join5(abs, "pom.xml");
  if (existsSync22(pom)) {
    const name2 = ownArtifactId(readText(pom)) ?? dir.split("/").pop();
    return { name: name2, dir, kind: "maven", manifest: `${dir}/pom.xml` };
  }
  return void 0;
}
function ownArtifactId(pom) {
  const stripped = pom.replace(/<parent>[\s\S]*?<\/parent>/g, "").replace(/<dependencies>[\s\S]*?<\/dependencies>/g, "");
  return stripped.match(/<artifactId>\s*([^<]+?)\s*<\/artifactId>/)?.[1];
}
function addPackage(root, dir, found, kind) {
  const clean = dir.replace(/^\.\//, "").replace(/\/+$/, "");
  if (!clean || found.has(clean)) return;
  const pkg = packageAt(root, clean, kind);
  if (pkg) found.set(clean, pkg);
}
function collectRecursive(root, base, found, kind, depth) {
  if (depth > MAX_RECURSE_DEPTH) return;
  let entries;
  try {
    entries = readdirSync22(join5(root, base), { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (!ent.isDirectory() || WS_SKIP_DIRS.has(ent.name)) continue;
    const sub = base ? `${base}/${ent.name}` : ent.name;
    addPackage(root, sub, found, kind);
    collectRecursive(root, sub, found, kind, depth + 1);
  }
}
function expandPattern(root, raw, found, kind) {
  const pat = raw.replace(/\/+$/, "");
  if (pat.endsWith("/**")) {
    collectRecursive(root, pat.slice(0, -3), found, kind, 0);
  } else if (pat.endsWith("/*")) {
    const base = pat.slice(0, -2);
    let entries;
    try {
      entries = readdirSync22(join5(root, base), { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.isDirectory()) addPackage(root, `${base}/${ent.name}`, found, kind);
    }
  } else {
    addPackage(root, pat, found, kind);
  }
}
function npmFamilyPatterns(root) {
  const positives = [];
  const negations = [];
  const push = (raw, kind) => {
    const t = raw.trim();
    if (!t) return;
    if (t.startsWith("!")) negations.push(t.slice(1));
    else positives.push({ pattern: t, kind });
  };
  const pkg = readJson(join5(root, "package.json"));
  const ws = pkg?.workspaces;
  if (Array.isArray(ws)) {
    for (const x of ws) if (typeof x === "string") push(x, "npm");
  } else if (ws && typeof ws === "object" && Array.isArray(ws.packages)) {
    for (const x of ws.packages) if (typeof x === "string") push(x, "npm");
  }
  const pnpm = readText(join5(root, "pnpm-workspace.yaml"));
  let inPackages = false;
  for (const line2 of pnpm.split(/\r?\n/)) {
    if (/^\S/.test(line2)) {
      inPackages = /^packages\s*:/.test(line2);
      continue;
    }
    if (!inPackages) continue;
    const m = line2.match(/^\s*-\s*['"]?([^'"#]+?)['"]?\s*(?:#.*)?$/);
    if (m) push(m[1].trim(), "pnpm");
  }
  return { positives, negations };
}
function fallbackNpmPatterns(root) {
  const lerna = readJson(join5(root, "lerna.json"));
  if (lerna && Array.isArray(lerna.packages)) {
    return lerna.packages.filter((x) => typeof x === "string").map((pattern) => ({ pattern, kind: "lerna" }));
  }
  const nx = readJson(join5(root, "nx.json"));
  if (nx) {
    const layout = nx.workspaceLayout ?? {};
    const appsDir = typeof layout.appsDir === "string" ? layout.appsDir : "apps";
    const libsDir = typeof layout.libsDir === "string" ? layout.libsDir : "libs";
    return [.../* @__PURE__ */ new Set([appsDir, libsDir])].map((dir) => ({ pattern: `${dir}/*`, kind: "nx" }));
  }
  return [];
}
function detectCargoMembers(root, found) {
  const toml = readText(join5(root, "Cargo.toml"));
  if (!toml) return;
  const body2 = tomlSectionBody(toml, "workspace");
  if (!body2) return;
  const members = tomlStringArray(body2, "members");
  if (!members.length) return;
  const excludes = tomlStringArray(body2, "exclude").map(wsGlobToRegExp);
  const candidates = /* @__PURE__ */ new Map();
  for (const pat of members) expandPattern(root, pat, candidates, "cargo");
  for (const [dir, pkg] of candidates) {
    if (excludes.some((re) => re.test(dir))) continue;
    if (!found.has(dir)) found.set(dir, pkg);
  }
}
function detectGoWork(root, found) {
  const gowork = readText(join5(root, "go.work"));
  if (!gowork) return;
  const dirs = [];
  for (const block of gowork.matchAll(/^use\s*\(([\s\S]*?)\)/gm)) {
    for (const line2 of block[1].split(/\r?\n/)) {
      const t = line2.replace(/\/\/.*$/, "").trim();
      if (t) dirs.push(t);
    }
  }
  for (const m of gowork.matchAll(/^use\s+([^\s(]+)/gm)) dirs.push(m[1]);
  for (const dir of dirs) {
    if (dir === "." || dir === "./") continue;
    addPackage(root, dir, found, "go");
  }
}
function detectMavenModules(root, found) {
  const pom = readText(join5(root, "pom.xml"));
  if (!pom) return;
  const modules = pom.match(/<modules>([\s\S]*?)<\/modules>/)?.[1];
  if (!modules) return;
  for (const m of modules.matchAll(/<module>\s*([^<]+?)\s*<\/module>/g)) {
    addPackage(root, m[1], found, "maven");
  }
}
function npmEdges(root, pkg, byName) {
  const manifest = readJson(join5(root, pkg.dir, "package.json"));
  if (!manifest) return [];
  const edges = /* @__PURE__ */ new Set();
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const deps = manifest[field];
    if (!deps || typeof deps !== "object") continue;
    for (const dep of Object.keys(deps)) {
      if (dep !== pkg.name && byName.has(dep)) edges.add(dep);
    }
  }
  return [...edges];
}
function normalizeDepPath(fromDir, rel) {
  const parts2 = `${fromDir}/${rel}`.split("/");
  const out2 = [];
  for (const p of parts2) {
    if (!p || p === ".") continue;
    if (p === "..") out2.pop();
    else out2.push(p);
  }
  return out2.join("/");
}
function cargoEdges(root, pkg, byName, byDir) {
  const toml = readText(join5(root, pkg.dir, "Cargo.toml"));
  if (!toml) return [];
  const edges = /* @__PURE__ */ new Set();
  for (const section of ["dependencies", "dev-dependencies", "build-dependencies"]) {
    const body2 = tomlSectionBody(toml, section);
    if (!body2) continue;
    for (const line2 of body2.split(/\r?\n/)) {
      const kv = line2.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
      if (!kv) continue;
      const dep = kv[1];
      if (dep !== pkg.name && byName.has(dep)) {
        edges.add(dep);
        continue;
      }
      const pathDep = kv[2].match(/path\s*=\s*["']([^"']+)["']/);
      if (pathDep) {
        const target = byDir.get(normalizeDepPath(pkg.dir, pathDep[1]));
        if (target && target !== pkg.name) edges.add(target);
      }
    }
  }
  return [...edges];
}
function goPkgEdges(root, pkg, byName, byDir) {
  const gomod = readText(join5(root, pkg.dir, "go.mod"));
  if (!gomod) return [];
  const edges = /* @__PURE__ */ new Set();
  for (const m of gomod.matchAll(/^\s*(?:require\s+)?([^\s/(][^\s]*)\s+v[^\s]+/gm)) {
    const dep = m[1];
    if (dep !== pkg.name && byName.has(dep)) edges.add(dep);
  }
  for (const m of gomod.matchAll(/^\s*(?:replace\s+)?(\S+)(?:\s+\S+)?\s*=>\s*(\.\.?\/\S+)/gm)) {
    const target = byDir.get(normalizeDepPath(pkg.dir, m[2]));
    if (target && target !== pkg.name) edges.add(target);
  }
  return [...edges];
}
function mavenEdges(root, pkg, byName) {
  const pom = readText(join5(root, pkg.dir, "pom.xml"));
  if (!pom) return [];
  const edges = /* @__PURE__ */ new Set();
  for (const m of pom.replace(/<parent>[\s\S]*?<\/parent>/g, "").matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    const aid = m[1].match(/<artifactId>\s*([^<]+?)\s*<\/artifactId>/)?.[1];
    if (aid && aid !== pkg.name && byName.has(aid)) edges.add(aid);
  }
  return [...edges];
}
function findCycle(packages) {
  const deps = new Map(packages.map((p) => [p.name, [...p.dependsOn ?? []].sort(byStr)]));
  const state = /* @__PURE__ */ new Map();
  const stack = [];
  const visit = (name2) => {
    state.set(name2, "visiting");
    stack.push(name2);
    for (const dep of deps.get(name2) ?? []) {
      if (!deps.has(dep)) continue;
      if (state.get(dep) === "visiting") return [...stack.slice(stack.indexOf(dep)), dep];
      if (!state.has(dep)) {
        const found = visit(dep);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(name2, "done");
    return null;
  };
  for (const name2 of [...deps.keys()].sort(byStr)) {
    if (!state.has(name2)) {
      const found = visit(name2);
      if (found) return found;
    }
  }
  return void 0;
}
function topoOrder(packages) {
  const remaining = new Map(packages.map((p) => [p.name, new Set(p.dependsOn ?? [])]));
  const order = [];
  while (remaining.size > 0) {
    const ready = [...remaining.entries()].filter(([, deps]) => [...deps].every((d) => !remaining.has(d))).map(([name2]) => name2).sort(byStr);
    if (!ready.length) {
      order.push(...[...remaining.keys()].sort(byStr));
      break;
    }
    for (const name2 of ready) {
      order.push(name2);
      remaining.delete(name2);
    }
  }
  return order;
}
function detectWorkspaces(root) {
  const found = /* @__PURE__ */ new Map();
  const { positives, negations } = npmFamilyPatterns(root);
  const npmPatterns = positives.length ? positives : fallbackNpmPatterns(root);
  if (npmPatterns.length) {
    const candidates = /* @__PURE__ */ new Map();
    for (const { pattern, kind } of npmPatterns) expandPattern(root, pattern, candidates, kind);
    const negRes = negations.map(wsGlobToRegExp);
    for (const [dir, pkg] of candidates) {
      if (negRes.some((re) => re.test(dir))) continue;
      found.set(dir, pkg);
    }
  }
  detectCargoMembers(root, found);
  detectGoWork(root, found);
  detectMavenModules(root, found);
  const packages = [...found.values()].sort((a, b) => byStr(a.dir, b.dir));
  const byName = new Set(packages.map((p) => p.name));
  const byDir = new Map(packages.map((p) => [p.dir, p.name]));
  for (const pkg of packages) {
    const edges = pkg.kind === "cargo" ? cargoEdges(root, pkg, byName, byDir) : pkg.kind === "go" ? goPkgEdges(root, pkg, byName, byDir) : pkg.kind === "maven" ? mavenEdges(root, pkg, byName) : npmEdges(root, pkg, byName);
    if (edges.length) pkg.dependsOn = edges.sort(byStr);
  }
  const byDepth = [...packages].sort((a, b) => b.dir.length - a.dir.length);
  return {
    packages,
    cycle: findCycle(packages),
    topoOrder: topoOrder(packages),
    packageOf: (rel) => byDepth.find((p) => rel === p.dir || rel.startsWith(p.dir + "/"))
  };
}
var WS_SKIP_DIRS;
var MAX_RECURSE_DEPTH;
var init_workspaces = __esm({
  "src/workspaces.ts"() {
    "use strict";
    init_walk();
    init_sort();
    WS_SKIP_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "build", "target", "coverage"]);
    MAX_RECURSE_DEPTH = 4;
  }
});
function pagerankOf(ids, edges, damping = DAMPING) {
  const out2 = /* @__PURE__ */ new Map();
  const n = ids.length;
  if (n === 0) return out2;
  const idx = new Map(ids.map((s, i2) => [s, i2]));
  const adj = Array.from({ length: n }, () => []);
  const outW = new Array(n).fill(0);
  for (const e of edges) {
    if (e.dangling) continue;
    const a = idx.get(e.from);
    const b = idx.get(e.to);
    if (a === void 0 || b === void 0 || a === b) continue;
    adj[a].push([b, e.weight]);
    outW[a] += e.weight;
  }
  let pr = new Array(n).fill(1 / n);
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    let dangling = 0;
    for (let i2 = 0; i2 < n; i2++) if (outW[i2] === 0) dangling += pr[i2];
    const base = (1 - damping) / n + damping * dangling / n;
    const next = new Array(n).fill(base);
    for (let i2 = 0; i2 < n; i2++) {
      if (outW[i2] === 0) continue;
      const share = damping * pr[i2] / outW[i2];
      for (const [j, w] of adj[i2]) next[j] += share * w;
    }
    let delta = 0;
    for (let i2 = 0; i2 < n; i2++) delta += Math.abs(next[i2] - pr[i2]);
    pr = next;
    if (delta < CONVERGENCE) break;
  }
  ids.forEach((s, i2) => out2.set(s, pr[i2]));
  return out2;
}
function betweennessOf(ids, edges) {
  const out2 = /* @__PURE__ */ new Map();
  for (const s of ids) out2.set(s, 0);
  const n = ids.length;
  if (n < 3) return out2;
  const idx = new Map(ids.map((s, i2) => [s, i2]));
  const nbSets = Array.from({ length: n }, () => /* @__PURE__ */ new Set());
  for (const e of edges) {
    if (e.dangling) continue;
    const a = idx.get(e.from);
    const b = idx.get(e.to);
    if (a === void 0 || b === void 0 || a === b) continue;
    nbSets[a].add(b);
    nbSets[b].add(a);
  }
  const adj = nbSets.map((s) => [...s].sort((x, y) => x - y));
  const cb = new Array(n).fill(0);
  for (let s = 0; s < n; s++) {
    const stack = [];
    const pred = Array.from({ length: n }, () => []);
    const sigma = new Array(n).fill(0);
    const dist = new Array(n).fill(-1);
    sigma[s] = 1;
    dist[s] = 0;
    const queue = [s];
    for (let qi = 0; qi < queue.length; qi++) {
      const v = queue[qi];
      stack.push(v);
      for (const w of adj[v]) {
        if (dist[w] < 0) {
          dist[w] = dist[v] + 1;
          queue.push(w);
        }
        if (dist[w] === dist[v] + 1) {
          sigma[w] += sigma[v];
          pred[w].push(v);
        }
      }
    }
    const delta = new Array(n).fill(0);
    for (let si = stack.length - 1; si >= 0; si--) {
      const w = stack[si];
      for (const v of pred[w]) delta[v] += sigma[v] / sigma[w] * (1 + delta[w]);
      if (w !== s) cb[w] += delta[w];
    }
  }
  const norm22 = (n - 1) * (n - 2) / 2;
  ids.forEach((id, i2) => out2.set(id, cb[i2] / 2 / norm22));
  return out2;
}
function applyCentrality(graph) {
  const notes = [];
  const nM = graph.modules.length;
  if (nM > 0) {
    const mIds = graph.modules.map((m) => m.id);
    const mPr = pagerankOf(mIds, graph.moduleEdges);
    for (const m of graph.modules) m.pagerank = Number(((mPr.get(m.id) ?? 0) * nM).toFixed(4));
    if (nM > BETWEENNESS_MAX_NODES) {
      notes.push(`betweenness skipped (${nM} modules > ${BETWEENNESS_MAX_NODES})`);
    } else {
      const bt = betweennessOf(mIds, graph.moduleEdges);
      for (const m of graph.modules) m.betweenness = Number((bt.get(m.id) ?? 0).toFixed(6));
    }
  }
  const nF = graph.files.length;
  if (nF > 0) {
    const fIds = graph.files.map((f) => f.id);
    const fPr = pagerankOf(fIds, graph.fileEdges);
    for (const f of graph.files) f.pagerank = Number(((fPr.get(f.id) ?? 0) * nF).toFixed(4));
  }
  return notes;
}
var DAMPING;
var MAX_ITERS;
var CONVERGENCE;
var BETWEENNESS_MAX_NODES;
var init_centrality = __esm({
  "src/centrality.ts"() {
    "use strict";
    DAMPING = 0.85;
    MAX_ITERS = 100;
    CONVERGENCE = 1e-10;
    BETWEENNESS_MAX_NODES = 3e3;
  }
});
function communityOf(graph, slug) {
  return graph.modules.find((m) => m.slug === slug)?.community;
}
function buildAdjacency(slugs, edges) {
  const n = slugs.length;
  const idx = new Map(slugs.map((s, i2) => [s, i2]));
  const adj = Array.from({ length: n }, () => /* @__PURE__ */ new Map());
  for (const e of edges) {
    if (e.dangling) continue;
    const a = idx.get(e.from);
    const b = idx.get(e.to);
    if (a === void 0 || b === void 0 || a === b) continue;
    adj[a].set(b, (adj[a].get(b) ?? 0) + e.weight);
    adj[b].set(a, (adj[b].get(a) ?? 0) + e.weight);
  }
  const k = adj.map((m) => {
    let s = 0;
    for (const w of m.values()) s += w;
    return s;
  });
  const twoM = k.reduce((a, b) => a + b, 0);
  return { n, adj, k, twoM };
}
function canonicalize(comm) {
  const remap = /* @__PURE__ */ new Map();
  const out2 = new Array(comm.length);
  for (let i2 = 0; i2 < comm.length; i2++) {
    let id = remap.get(comm[i2]);
    if (id === void 0) {
      id = remap.size;
      remap.set(comm[i2], id);
    }
    out2[i2] = id;
  }
  return { comm: out2, count: remap.size };
}
function localMove(g) {
  const { n, adj, k, twoM } = g;
  const comm = Array.from({ length: n }, (_, i2) => i2);
  if (twoM === 0) return canonicalize(comm);
  const commTot = k.slice();
  let moved = true;
  let sweeps = 0;
  while (moved && sweeps < MAX_SWEEPS) {
    moved = false;
    sweeps++;
    for (let i2 = 0; i2 < n; i2++) {
      const cOld = comm[i2];
      commTot[cOld] -= k[i2];
      const nb = /* @__PURE__ */ new Map();
      for (const [j, wij] of adj[i2]) {
        if (j === i2) continue;
        const cj = comm[j];
        nb.set(cj, (nb.get(cj) ?? 0) + wij);
      }
      let bestC = cOld;
      let bestScore = (nb.get(cOld) ?? 0) - GAMMA * k[i2] * commTot[cOld] / twoM;
      for (const c2 of [...nb.keys()].sort((a, b) => a - b)) {
        if (c2 === cOld) continue;
        const score = nb.get(c2) - GAMMA * k[i2] * commTot[c2] / twoM;
        if (score > bestScore + EPS) {
          bestScore = score;
          bestC = c2;
        }
      }
      commTot[bestC] += k[i2];
      if (bestC !== cOld) {
        comm[i2] = bestC;
        moved = true;
      }
    }
  }
  return canonicalize(comm);
}
function aggregate(g, comm, count) {
  const adj = Array.from({ length: count }, () => /* @__PURE__ */ new Map());
  for (let i2 = 0; i2 < g.n; i2++) {
    const ci = comm[i2];
    for (const [j, wij] of g.adj[i2]) {
      const cj = comm[j];
      adj[ci].set(cj, (adj[ci].get(cj) ?? 0) + wij);
    }
  }
  const k = adj.map((m) => {
    let s = 0;
    for (const w of m.values()) s += w;
    return s;
  });
  const twoM = k.reduce((a, b) => a + b, 0);
  return { n: count, adj, k, twoM };
}
function louvain(g) {
  if (g.n === 0) return [];
  let level = g;
  const mapping = Array.from({ length: g.n }, (_, i2) => i2);
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const { comm, count } = localMove(level);
    for (let i2 = 0; i2 < mapping.length; i2++) mapping[i2] = comm[mapping[i2]];
    if (count === level.n) break;
    level = aggregate(level, comm, count);
  }
  return canonicalize(mapping).comm;
}
function groupByLabel(labels) {
  const groups = [];
  for (let i2 = 0; i2 < labels.length; i2++) {
    (groups[labels[i2]] ??= []).push(i2);
  }
  return groups.filter((g) => g && g.length > 0);
}
function louvainInduced(g, members) {
  const m = members.length;
  const local = /* @__PURE__ */ new Map();
  members.forEach((b, li) => local.set(b, li));
  const adj = Array.from({ length: m }, () => /* @__PURE__ */ new Map());
  for (let li = 0; li < m; li++) {
    for (const [nb, w] of g.adj[members[li]]) {
      const lj = local.get(nb);
      if (lj === void 0) continue;
      adj[li].set(lj, w);
    }
  }
  const k = adj.map((mp) => {
    let s = 0;
    for (const w of mp.values()) s += w;
    return s;
  });
  const twoM = k.reduce((a, b) => a + b, 0);
  const labels = louvain({ n: m, adj, k, twoM });
  return groupByLabel(labels).map((grp) => grp.map((li) => members[li]));
}
function splitOversized(groups, g, n) {
  const out2 = [];
  for (const grp of groups) {
    if (grp.length > OVERSIZE_FRACTION * n && grp.length >= OVERSIZE_MIN) {
      const sub = louvainInduced(g, grp);
      if (sub.length > 1) {
        out2.push(...sub);
        continue;
      }
    }
    out2.push(grp);
  }
  return out2;
}
function compareCommunities(a, b) {
  if (a.length !== b.length) return b.length - a.length;
  for (let i2 = 0; i2 < a.length; i2++) {
    const c2 = byStr(a[i2], b[i2]);
    if (c2) return c2;
  }
  return 0;
}
function assignIds(ordered, previous) {
  const n = ordered.length;
  const ids = new Array(n).fill(-1);
  if (!previous || Object.keys(previous).length === 0) {
    for (let i2 = 0; i2 < n; i2++) ids[i2] = i2;
    return ids;
  }
  const prevSets = Object.entries(previous).map(([id, members]) => ({
    id: Number(id),
    set: new Set(members)
  }));
  const pairs = [];
  ordered.forEach((comm, ni) => {
    for (const prev of prevSets) {
      let inter = 0;
      for (const s of comm) if (prev.set.has(s)) inter++;
      if (inter > 0) pairs.push({ ni, prevId: prev.id, inter });
    }
  });
  pairs.sort((a, b) => b.inter - a.inter || a.ni - b.ni || a.prevId - b.prevId);
  const matched = /* @__PURE__ */ new Map();
  const usedPrev = /* @__PURE__ */ new Set();
  for (const p of pairs) {
    if (matched.has(p.ni) || usedPrev.has(p.prevId)) continue;
    matched.set(p.ni, p.prevId);
    usedPrev.add(p.prevId);
  }
  const taken = /* @__PURE__ */ new Set();
  for (let ni = 0; ni < n; ni++) {
    const pid = matched.get(ni);
    if (pid !== void 0 && pid >= 0 && pid < n && !taken.has(pid)) {
      ids[ni] = pid;
      taken.add(pid);
    }
  }
  const free = [];
  for (let id = 0; id < n; id++) if (!taken.has(id)) free.push(id);
  let fi = 0;
  for (let ni = 0; ni < n; ni++) if (ids[ni] === -1) ids[ni] = free[fi++];
  return ids;
}
function detectCommunities(modules, edges, previous) {
  const out2 = /* @__PURE__ */ new Map();
  if (modules.length === 0) return out2;
  const slugs = modules.map((m) => m.slug).sort(byStr);
  const g = buildAdjacency(slugs, edges);
  const labels = louvain(g);
  const split = splitOversized(groupByLabel(labels), g, slugs.length);
  const communities = split.map((grp) => grp.map((i2) => slugs[i2]).sort(byStr));
  communities.sort(compareCommunities);
  const ids = assignIds(communities, previous);
  communities.forEach((comm, ni) => {
    for (const s of comm) out2.set(s, ids[ni]);
  });
  return out2;
}
var GAMMA;
var MAX_SWEEPS;
var MAX_PASSES;
var EPS;
var OVERSIZE_FRACTION;
var OVERSIZE_MIN;
var init_community = __esm({
  "src/community.ts"() {
    "use strict";
    init_sort();
    GAMMA = 1;
    MAX_SWEEPS = 20;
    MAX_PASSES = 10;
    EPS = 1e-12;
    OVERSIZE_FRACTION = 0.25;
    OVERSIZE_MIN = 10;
  }
});
function isTestPath(rel) {
  if (TEST_DIR.test(rel)) return true;
  if (isTestFile(rel)) return true;
  const base = rel.split("/").pop();
  return BASENAME_PATTERNS.some((p) => p.test(base));
}
function computeTestMap(graph) {
  const testFiles = /* @__PURE__ */ new Set();
  const moduleOf = /* @__PURE__ */ new Map();
  for (const f of graph.files) {
    moduleOf.set(f.rel, f.module);
    if (f.fileKind === "code" && isTestPath(f.rel)) testFiles.add(f.rel);
  }
  const byFile = /* @__PURE__ */ new Map();
  const byModule = /* @__PURE__ */ new Map();
  for (const e of graph.fileEdges) {
    if (e.dangling) continue;
    if (e.kind !== "import" && e.kind !== "use" && e.kind !== "call") continue;
    if (!testFiles.has(e.from) || testFiles.has(e.to)) continue;
    let set = byFile.get(e.to);
    if (!set) byFile.set(e.to, set = /* @__PURE__ */ new Set());
    set.add(e.from);
    const slug = moduleOf.get(e.to);
    if (slug !== void 0) {
      let mset = byModule.get(slug);
      if (!mset) byModule.set(slug, mset = /* @__PURE__ */ new Set());
      mset.add(e.from);
    }
  }
  const sortSets = (m) => {
    const out2 = /* @__PURE__ */ new Map();
    for (const key of [...m.keys()].sort(byStr)) out2.set(key, [...m.get(key)].sort(byStr));
    return out2;
  };
  return { testFiles, testedByFile: sortSets(byFile), testedByModule: sortSets(byModule) };
}
function testsForModule(graph, slug) {
  const m = graph.modules.find((x) => x.slug === slug);
  if (m?.testedBy) return m.testedBy;
  return computeTestMap(graph).testedByModule.get(slug) ?? [];
}
function untestedModules(graph) {
  const tm = computeTestMap(graph);
  const codeMembers = /* @__PURE__ */ new Map();
  for (const f of graph.files) {
    if (f.fileKind !== "code" || tm.testFiles.has(f.rel)) continue;
    codeMembers.set(f.module, (codeMembers.get(f.module) ?? 0) + 1);
  }
  return graph.modules.filter(
    (m) => m.tier <= 1 && m.symbols > 0 && (codeMembers.get(m.slug) ?? 0) > 0 && !tm.testedByModule.has(m.slug)
  );
}
var BASENAME_PATTERNS;
var TEST_DIR;
var init_tests_map = __esm({
  "src/tests-map.ts"() {
    "use strict";
    init_modules();
    init_sort();
    BASENAME_PATTERNS = [
      /^test_.*\.py$/i,
      /_test\.py$/i,
      /_test\.go$/,
      /(Test|Tests|IT)\.java$/,
      /(Test|Tests)\.kt$/,
      /_spec\.rb$/,
      /_test\.rb$/,
      /Test\.php$/,
      /(Test|Tests)\.cs$/,
      /_test\.exs$/
    ];
    TEST_DIR = /(^|\/)(tests?|__tests?__|spec|specs|e2e)(\/|$)/i;
  }
});
function computeSurprises(graph) {
  const commOf = /* @__PURE__ */ new Map();
  const tierOf2 = /* @__PURE__ */ new Map();
  for (const m of graph.modules) {
    if (m.community !== void 0) commOf.set(m.slug, m.community);
    tierOf2.set(m.slug, m.tier);
  }
  const pairCount = /* @__PURE__ */ new Map();
  const pairKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const candidates = [];
  for (const e of graph.moduleEdges) {
    if (e.dangling) continue;
    const ca = commOf.get(e.from);
    const cb = commOf.get(e.to);
    if (ca === void 0 || cb === void 0 || ca === cb) continue;
    pairCount.set(pairKey(ca, cb), (pairCount.get(pairKey(ca, cb)) ?? 0) + 1);
    if (!DEP_KINDS.has(e.kind)) continue;
    if (tierOf2.get(e.to) === 0) continue;
    candidates.push({ edge: e, comms: [ca, cb] });
  }
  return candidates.filter((c2) => pairCount.get(pairKey(c2.comms[0], c2.comms[1])) <= MAX_PAIR_EDGES).map((c2) => ({
    from: c2.edge.from,
    to: c2.edge.to,
    kind: c2.edge.kind,
    weight: c2.edge.weight,
    communities: c2.comms,
    pairEdges: pairCount.get(pairKey(c2.comms[0], c2.comms[1]))
  })).sort((a, b) => a.pairEdges - b.pairEdges || byStr(a.from, b.from) || byStr(a.to, b.to)).slice(0, SURPRISE_CAP);
}
function isSurprising(graph, from, to) {
  const list = graph.surprises ?? computeSurprises(graph);
  return list.some((s) => s.from === from && s.to === to);
}
var SURPRISE_CAP;
var MAX_PAIR_EDGES;
var DEP_KINDS;
var init_surprise = __esm({
  "src/surprise.ts"() {
    "use strict";
    init_sort();
    SURPRISE_CAP = 24;
    MAX_PAIR_EDGES = 2;
    DEP_KINDS = /* @__PURE__ */ new Set(["import", "call", "use"]);
  }
});
function computeSymbolRefs(scan2) {
  const unique = uniqueSymbolDefs(scan2);
  const refs = /* @__PURE__ */ new Map();
  if (!unique.size) return refs;
  const add = (name2, file) => {
    let set = refs.get(name2);
    if (!set) refs.set(name2, set = /* @__PURE__ */ new Set());
    set.add(file);
  };
  for (const f of scan2.files) {
    if (f.kind === "code" && f.idents) {
      for (const id of f.idents) {
        const target = unique.get(id);
        if (target && target !== f.rel) add(id, f.rel);
      }
    } else if (f.kind === "doc") {
      const content = scan2.docText.get(f.rel);
      if (!content) continue;
      for (const tok of content.split(/[^A-Za-z0-9_]+/)) {
        const target = unique.get(tok);
        if (target && target !== f.rel) add(tok, f.rel);
      }
    }
  }
  return refs;
}
function buildSymbolIndex(scan2, refs = /* @__PURE__ */ new Map()) {
  const defsByName = /* @__PURE__ */ new Map();
  for (const f of scan2.files) {
    for (const s of f.symbols) {
      let arr = defsByName.get(s.name);
      if (!arr) defsByName.set(s.name, arr = []);
      arr.push({
        file: s.file,
        line: s.line,
        ...s.endLine !== void 0 ? { endLine: s.endLine } : {},
        kind: s.kind,
        exported: s.exported,
        lang: s.lang,
        ...s.parent ? { parent: s.parent } : {}
      });
    }
  }
  const defs = {};
  for (const name2 of [...defsByName.keys()].sort(byStr)) {
    defs[name2] = defsByName.get(name2).slice().sort((a, b) => byStr(a.file, b.file) || a.line - b.line || byStr(a.kind, b.kind));
  }
  const refsOut = {};
  for (const name2 of [...refs.keys()].sort(byStr)) {
    const files = [...refs.get(name2)].sort(byStr);
    if (files.length) refsOut[name2] = files;
  }
  return { schemaVersion: SCHEMA_VERSION, defs, refs: refsOut };
}
function renderSymbolsJson(index) {
  return JSON.stringify(index, null, 2) + "\n";
}
var init_symbols_json = __esm({
  "src/render/symbols-json.ts"() {
    "use strict";
    init_types();
    init_sort();
    init_graph();
  }
});
function sortObject(obj) {
  const out2 = {};
  for (const k of Object.keys(obj).sort(byStr)) out2[k] = obj[k];
  return out2;
}
function renderGraphJson(graph) {
  const ordered = { ...graph, languages: sortObject(graph.languages) };
  return JSON.stringify(ordered, null, 2) + "\n";
}
var init_graph_json = __esm({
  "src/render/graph-json.ts"() {
    "use strict";
    init_sort();
  }
});
function buildIndexArtifacts(repo, opts = {}) {
  const scan2 = scanRepo(repo, opts);
  const ctx = buildResolveContext(scan2);
  const { modules, moduleOf } = buildModules(scan2);
  const graph = buildGraph(scan2, ctx, modules, moduleOf, opts.meta);
  const communities = detectCommunities(graph.modules, graph.moduleEdges, opts.previousCommunities);
  for (const m of graph.modules) {
    const id = communities.get(m.slug);
    if (id !== void 0) m.community = id;
  }
  applyCentrality(graph);
  const testMap = computeTestMap(graph);
  for (const f of graph.files) {
    if (testMap.testFiles.has(f.rel)) f.testFile = true;
  }
  for (const m of graph.modules) {
    const t = testMap.testedByModule.get(m.slug);
    if (t?.length) m.testedBy = t;
  }
  const surprises = computeSurprises(graph);
  if (surprises.length) graph.surprises = surprises;
  const symbols = buildSymbolIndex(scan2, computeSymbolRefs(scan2));
  return { scan: scan2, graph, symbols };
}
var init_pipeline = __esm({
  "src/pipeline.ts"() {
    "use strict";
    init_scan();
    init_resolve();
    init_modules();
    init_graph();
    init_community();
    init_centrality();
    init_tests_map();
    init_surprise();
    init_symbols_json();
  }
});
function sortHits(hits) {
  return hits.sort((a, b) => byStr(a.file, b.file) || a.line - b.line);
}
function rgBackend(root, pattern, opts) {
  const args2 = [
    "--no-heading",
    "--line-number",
    "--null",
    // path\0line:text — a `:12:` inside a filename can't corrupt parsing
    "--color=never",
    "--no-messages",
    "--hidden",
    "--no-require-git",
    "--no-ignore-global",
    "--no-ignore-exclude",
    "--no-ignore-parent",
    "--no-ignore-dot",
    "--max-filesize",
    "1M"
  ];
  for (const d of IGNORE_DIRS) args2.push("--glob", `!**/${d}/**`);
  for (const l of LOCKFILES) args2.push("--iglob", `!**/${l}`);
  for (const ext of BINARY_EXT) args2.push("--iglob", `!**/*${ext}`);
  args2.push("--glob", "!*.min.js", "--glob", "!*.min.css");
  if (opts.ignoreCase) args2.push("--ignore-case");
  for (const g of opts.globs ?? []) args2.push("--glob", g.startsWith("/") ? g : `/${g}`);
  args2.push("--regexp", pattern, "./");
  const res = sh2("rg", args2, { cwd: root });
  if (res.missing || !res.ok && res.status !== 1) return void 0;
  const hits = [];
  for (const line2 of res.stdout.split("\n")) {
    if (!line2) continue;
    const nul = line2.indexOf("\0");
    if (nul === -1) continue;
    const file = line2.slice(0, nul).replace(/^\.\//, "");
    const rest = line2.slice(nul + 1);
    const colon = rest.indexOf(":");
    if (colon === -1) continue;
    hits.push({ file, line: Number(rest.slice(0, colon)), text: rest.slice(colon + 1) });
  }
  return hits;
}
function jsBackend(root, re, opts) {
  const filter = compileGlobs(opts.globs?.map((g) => g.replace(/^\//, "")));
  const hits = [];
  for (const f of walk(root).files) {
    if (filter && !filter(f.rel)) continue;
    const content = readText(f.abs);
    if (!content) continue;
    const lines = content.split("\n");
    for (let i2 = 0; i2 < lines.length; i2++) {
      if (re.test(lines[i2])) hits.push({ file: f.rel, line: i2 + 1, text: lines[i2] });
    }
  }
  return hits;
}
function grepRepo(root, pattern, opts = {}) {
  const re = new RegExp(pattern, opts.ignoreCase ? "i" : "");
  const max = opts.maxHits ?? DEFAULT_MAX_HITS;
  let hits;
  if (!opts.noRipgrep && have2("rg")) hits = rgBackend(root, pattern, opts);
  hits ??= jsBackend(root, re, opts);
  return sortHits(hits).slice(0, max);
}
var DEFAULT_MAX_HITS;
var init_grep = __esm({
  "src/grep.ts"() {
    "use strict";
    init_walk();
    init_glob();
    init_util();
    init_sort();
    DEFAULT_MAX_HITS = 200;
  }
});
var mcp_exports = {};
__export(mcp_exports, {
  runMcpServer: () => runMcpServer
});
function str(v) {
  return typeof v === "string" && v ? v : void 0;
}
function strArray(v) {
  return Array.isArray(v) && v.every((x) => typeof x === "string") && v.length ? v : void 0;
}
function callTool(name2, args2) {
  const repo = str(args2.repo);
  if (!repo) throw new Error("`repo` is required (absolute path to the repository root)");
  const scanOpts = { scope: str(args2.scope), include: strArray(args2.include), exclude: strArray(args2.exclude) };
  if (name2 === "scan_summary") {
    const scan2 = scanRepo(repo, scanOpts);
    return JSON.stringify(
      { engineVersion: ENGINE_VERSION, commit: scan2.commit, fileCount: scan2.files.length, languages: scan2.languages, capped: scan2.capped },
      null,
      2
    );
  }
  if (name2 === "graph") {
    return renderGraphJson(buildIndexArtifacts(repo, scanOpts).graph);
  }
  if (name2 === "symbols") {
    const { symbols } = buildIndexArtifacts(repo, scanOpts);
    const lookup = str(args2.name);
    if (lookup) {
      return JSON.stringify({ name: lookup, defs: symbols.defs[lookup] ?? [], refs: symbols.refs[lookup] ?? [] }, null, 2);
    }
    return JSON.stringify(symbols, null, 2);
  }
  if (name2 === "callers") {
    const index = buildCallerIndex(scanRepo(repo, scanOpts));
    const lookup = str(args2.name);
    if (lookup) {
      const entry = index.get(lookup);
      return JSON.stringify(entry ?? { error: `no tracked callers for "${lookup}"` }, null, 2);
    }
    const obj = {};
    for (const [k, v] of index) obj[k] = v;
    return JSON.stringify(obj, null, 2);
  }
  if (name2 === "workspaces") {
    const info2 = detectWorkspaces(repo);
    return JSON.stringify({ packages: info2.packages, cycle: info2.cycle ?? null, topoOrder: info2.topoOrder }, null, 2);
  }
  if (name2 === "churn") {
    const { churn, ok } = gitChurn(repo, { since: str(args2.since) });
    const sorted = {};
    for (const k of [...churn.keys()].sort()) sorted[k] = churn.get(k);
    return JSON.stringify({ ok, churn: sorted }, null, 2);
  }
  if (name2 === "grep") {
    const pattern = str(args2.pattern);
    if (!pattern) throw new Error("`pattern` is required");
    const hits = grepRepo(repo, pattern, {
      globs: strArray(args2.globs),
      ignoreCase: args2.ignoreCase === true,
      maxHits: typeof args2.maxHits === "number" ? args2.maxHits : void 0
    });
    return JSON.stringify(hits, null, 2);
  }
  throw new Error(`unknown tool: ${name2}`);
}
async function runMcpServer() {
  await ensureGrammars(allGrammarKeys());
  const send = (msg) => {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
  };
  const rl = createInterface({ input: process.stdin, terminal: false });
  for await (const line2 of rl) {
    const trimmed = line2.trim();
    if (!trimmed) continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      send({ id: null, error: { code: -32700, message: "parse error" } });
      continue;
    }
    const requests = Array.isArray(parsed) ? parsed : [parsed];
    for (const req of requests) handle2(req);
  }
  function handle2(req) {
    if (req.id === void 0 || req.id === null) return;
    try {
      if (req.method === "initialize") {
        send({
          id: req.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "codeindex", version: ENGINE_VERSION }
          }
        });
      } else if (req.method === "ping") {
        send({ id: req.id, result: {} });
      } else if (req.method === "tools/list") {
        send({ id: req.id, result: { tools: TOOLS } });
      } else if (req.method === "tools/call") {
        const params = req.params ?? {};
        const name2 = str(params.name) ?? "";
        const args2 = params.arguments ?? {};
        try {
          const text = callTool(name2, args2);
          send({ id: req.id, result: { content: [{ type: "text", text }] } });
        } catch (e) {
          send({
            id: req.id,
            result: { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true }
          });
        }
      } else {
        send({ id: req.id, error: { code: -32601, message: `method not found: ${req.method}` } });
      }
    } catch (e) {
      send({ id: req.id, error: { code: -32603, message: e instanceof Error ? e.message : String(e) } });
    }
  }
}
var repoProp;
var scopeProps;
var TOOLS;
var init_mcp = __esm({
  "src/mcp.ts"() {
    "use strict";
    init_types();
    init_loader();
    init_pipeline();
    init_graph_json();
    init_scan();
    init_callers();
    init_workspaces();
    init_git();
    init_grep();
    repoProp = { repo: { type: "string", description: "Absolute path to the repository root" } };
    scopeProps = {
      scope: { type: "string", description: "Restrict to one directory (repo-relative)" },
      include: { type: "array", items: { type: "string" }, description: "Include globs" },
      exclude: { type: "array", items: { type: "string" }, description: "Exclude globs" }
    };
    TOOLS = [
      {
        name: "scan_summary",
        description: "Deterministically scan a repository: file count, per-language file histogram, HEAD commit, and whether the walk was capped. Fast first look at any codebase.",
        inputSchema: { type: "object", properties: { ...repoProp, ...scopeProps }, required: ["repo"] }
      },
      {
        name: "graph",
        description: "Build the full typed cross-file link-graph (import/call/use/doc-link/mention edges, module grouping, PageRank centrality, Louvain communities, tests-map). Returns graph.json. Large on big repos \u2014 prefer scan_summary/symbols/callers for targeted questions.",
        inputSchema: { type: "object", properties: { ...repoProp, ...scopeProps }, required: ["repo"] }
      },
      {
        name: "symbols",
        description: "Where is a symbol defined and which files reference it? Returns the definition sites (file, line, kind, exported) and referencing files. Omit `name` for the full symbol index.",
        inputSchema: {
          type: "object",
          properties: { ...repoProp, name: { type: "string", description: "Symbol name to look up" } },
          required: ["repo"]
        }
      },
      {
        name: "callers",
        description: "Who calls a function? Per-symbol caller index: each defined symbol with the exact (file, line) call sites that bind to it. Omit `name` for the full index.",
        inputSchema: {
          type: "object",
          properties: { ...repoProp, name: { type: "string", description: "Symbol name to look up" } },
          required: ["repo"]
        }
      },
      {
        name: "workspaces",
        description: "Detect monorepo packages (npm/pnpm/yarn/lerna/nx/cargo/go.work/maven) with the workspace dependency graph, one cycle if present, and a topological build order.",
        inputSchema: { type: "object", properties: { ...repoProp }, required: ["repo"] }
      },
      {
        name: "churn",
        description: "Per-file git commit counts (whole history, or since a ref) \u2014 the churn half of hotspot analysis.",
        inputSchema: {
          type: "object",
          properties: { ...repoProp, since: { type: "string", description: "Only count commits after this ref" } },
          required: ["repo"]
        }
      },
      {
        name: "grep",
        description: "Search file contents (ripgrep when available, deterministic JS fallback otherwise). Returns sorted (file, line, text) hits.",
        inputSchema: {
          type: "object",
          properties: {
            ...repoProp,
            pattern: { type: "string", description: "Regular expression to search for" },
            globs: { type: "array", items: { type: "string" }, description: "Restrict to matching paths" },
            ignoreCase: { type: "boolean" },
            maxHits: { type: "number" }
          },
          required: ["repo", "pattern"]
        }
      }
    ];
  }
});
init_types();
init_walk();
init_scan();
init_glob();
init_ignore();
init_classify();
var CODE_EXTS = /* @__PURE__ */ new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".vue",
  ".svelte",
  ".astro",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".kts",
  ".php",
  ".c",
  ".cc",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".swift",
  ".scala",
  ".clj",
  ".ex",
  ".exs",
  ".dart",
  ".lua",
  ".sh",
  ".bash",
  ".zig",
  ".elm"
]);
var STYLE_EXTS = /* @__PURE__ */ new Set([".css", ".scss", ".sass", ".less", ".styl", ".pcss"]);
var DOC_EXTS = /* @__PURE__ */ new Set([".md", ".mdx", ".rst", ".adoc", ".txt"]);
var DATA_EXTS = /* @__PURE__ */ new Set([".json", ".yaml", ".yml", ".toml", ".csv", ".xml", ".env"]);
var ASSET_EXTS = /* @__PURE__ */ new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".bmp",
  ".tiff",
  ".svg",
  ".pdf",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".mp3",
  ".mp4",
  ".mov",
  ".avi",
  ".webm"
]);
var I18N_DIRS = ["locales", "locale", "i18n", "lang", "langs", "translations", "messages"];
var I18N_EXTS = /* @__PURE__ */ new Set([".json", ".yaml", ".yml", ".po", ".properties"]);
var TEST_DIRS = ["__tests__", "test", "tests", "spec", "e2e", "__mocks__"];
var SCHEMA_DIRS = ["migrations", "entities", "models"];
var CONFIG_BASES = /* @__PURE__ */ new Set([
  "package.json",
  "tsconfig.json",
  "dockerfile",
  "makefile",
  "pyproject.toml",
  "cargo.toml",
  "go.mod",
  "requirements.txt",
  "gemfile",
  "composer.json",
  "pubspec.yaml"
]);
function categorize(rel, ext) {
  const lower = rel.toLowerCase();
  const base = basename22(lower);
  const segments = lower.split("/");
  const inDir = (names) => names.some((n) => segments.includes(n));
  if (inDir(I18N_DIRS) && I18N_EXTS.has(ext)) return "i18n";
  if (ext === ".prisma" || ext === ".sql" || ext === ".graphql" || ext === ".gql" || base.startsWith("schema.") || base === "models.py" || inDir(SCHEMA_DIRS)) {
    return "schema";
  }
  if (lower.includes(".test.") || lower.includes(".spec.") || inDir(TEST_DIRS)) return "test";
  if (CONFIG_BASES.has(base) || base.endsWith(".config.js") || base.endsWith(".config.ts") || base.endsWith(".config.mjs") || base.startsWith(".eslintrc") || base.startsWith(".prettierrc") || base.startsWith(".env") || base.startsWith("docker-compose")) {
    return "config";
  }
  if (DOC_EXTS.has(ext)) return "doc";
  if (STYLE_EXTS.has(ext)) return "style";
  if (CODE_EXTS.has(ext)) return "code";
  if (ASSET_EXTS.has(ext)) return "asset";
  if (DATA_EXTS.has(ext)) return "data";
  return "other";
}
init_registry();
init_code();
init_markdown();
init_loader();
init_extract();
init_resolve();
init_modules();
init_graph();
init_calls();
init_callers();
init_workspaces();
init_centrality();
init_community();
init_tests_map();
init_surprise();
init_symbols_json();
init_graph_json();
init_pipeline();
init_git();
init_grep();
init_mcp();
init_hash();
init_sort();
init_util();
init_types();
init_types();
init_loader();
init_pipeline();
init_graph_json();
init_symbols_json();
init_scan();
init_callers();
init_workspaces();
init_git();
init_grep();
var HELP = `codeindex engine v${ENGINE_VERSION} \u2014 deterministic repo indexing

Usage: engine.mjs <command> [flags]

Commands:
  index       Build graph.json + symbols.json (+ incremental cache.json) into
              --out <dir> in ONE pass \u2014 the fast path for repeated runs
  scan        Scan summary: file count, language histogram, capped flag
  graph       Full link-graph (graph.json bytes) to stdout or --out
  symbols     Symbol index (symbols.json bytes) to stdout or --out
  callers     Per-symbol caller index (JSON)
  workspaces  Monorepo packages + dependency graph (JSON)
  churn       Per-file git commit counts (JSON; --since <ref> to bound)
  grep        Search: engine.mjs grep <pattern> --repo <dir> (JSON hits)
  mcp         Run as an MCP server over stdio (tools: scan_summary, graph,
              symbols, callers, workspaces, churn, grep)
  version     Print the engine version

Flags:
  --repo <dir>        Repo root (default: cwd)
  --out <file>        Write output to a file instead of stdout
  --include <glob>    Only include matching paths (repeatable)
  --exclude <glob>    Exclude matching paths (repeatable)
  --scope <dir>       Restrict to one directory (sugar for --include '<dir>/**')
  --no-gitignore      Do not honor .gitignore files (default: honored)
  --max-files <n>     Cap walked files (default 20000)
  --max-bytes <n>     Skip files above this size (default 1 MiB)
  --no-ast            Skip tree-sitter grammars even when present (regex tier)
`;
function parseFlags(args2) {
  const flags2 = { repo: process.cwd(), include: [], exclude: [], gitignore: true, noAst: false };
  for (let i2 = 0; i2 < args2.length; i2++) {
    const a = args2[i2];
    const next = () => {
      const v = args2[++i2];
      if (v === void 0) throw new Error(`missing value for ${a}`);
      return v;
    };
    const num = () => {
      const raw = next();
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`${a} expects a positive number, got "${raw}"`);
      return n;
    };
    if (a === "--repo") flags2.repo = resolve2(next());
    else if (a === "--out") flags2.out = resolve2(next());
    else if (a === "--include") flags2.include.push(next());
    else if (a === "--exclude") flags2.exclude.push(next());
    else if (a === "--scope") flags2.scope = next();
    else if (a === "--no-gitignore") flags2.gitignore = false;
    else if (a === "--max-files") flags2.maxFiles = num();
    else if (a === "--max-bytes") flags2.maxBytes = num();
    else if (a === "--ignore-case") flags2.ignoreCase = true;
    else if (a === "--max-hits") flags2.maxHits = num();
    else if (a === "--no-ast") flags2.noAst = true;
    else if (a === "--since") flags2.since = next();
    else if (!a.startsWith("--") && flags2.positional === void 0) flags2.positional = a;
    else throw new Error(`unknown flag: ${a}`);
  }
  return flags2;
}
function emit(content, out2) {
  if (out2) writeFileSync3(out2, content);
  else process.stdout.write(content);
}
function scanOptions(flags2) {
  return {
    include: flags2.include.length ? flags2.include : void 0,
    exclude: flags2.exclude.length ? flags2.exclude : void 0,
    scope: flags2.scope,
    gitignore: flags2.gitignore,
    maxFiles: flags2.maxFiles,
    maxBytes: flags2.maxBytes
  };
}
async function runCli(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    process.stdout.write(HELP);
    return;
  }
  if (cmd === "version" || cmd === "--version") {
    process.stdout.write(ENGINE_VERSION + "\n");
    return;
  }
  if (cmd === "mcp") {
    const { runMcpServer: runMcpServer2 } = await Promise.resolve().then(() => (init_mcp(), mcp_exports));
    await runMcpServer2();
    return;
  }
  const flags2 = parseFlags(rest);
  if (!existsSync32(flags2.repo)) throw new Error(`--repo path does not exist: ${flags2.repo}`);
  if (!flags2.noAst) await ensureGrammars(allGrammarKeys());
  if (cmd === "index") {
    if (!flags2.out) throw new Error("index needs --out <dir>");
    const outDir = flags2.out;
    mkdirSync4(outDir, { recursive: true });
    const cachePath = join6(outDir, "cache.json");
    let cache;
    try {
      const parsed = JSON.parse(readFileSync32(cachePath, "utf8"));
      if (parsed.schemaVersion === SCHEMA_VERSION && parsed.extractorVersion === EXTRACTOR_VERSION) {
        cache = new Map(Object.entries(parsed.files));
      }
    } catch {
    }
    const { scan: scan2, graph, symbols } = buildIndexArtifacts(flags2.repo, { ...scanOptions(flags2), cache, out: outDir });
    writeFileSync3(join6(outDir, "graph.json"), renderGraphJson(graph));
    writeFileSync3(join6(outDir, "symbols.json"), renderSymbolsJson(symbols));
    const files = {};
    for (const f of scan2.files) {
      const entry = { hash: f.hash, record: f, size: f.size };
      const mtime = scan2.mtimes.get(f.rel);
      if (mtime !== void 0) entry.mtimeMs = mtime;
      files[f.rel] = entry;
    }
    writeFileSync3(
      cachePath,
      JSON.stringify({ schemaVersion: SCHEMA_VERSION, extractorVersion: EXTRACTOR_VERSION, files }) + "\n"
    );
    process.stderr.write(`codeindex: ${scan2.files.length} files \u2192 ${outDir}/graph.json + symbols.json${scan2.capped ? " (capped)" : ""}
`);
  } else if (cmd === "scan") {
    const { scan: scan2 } = buildIndexArtifacts(flags2.repo, scanOptions(flags2));
    const summary = {
      engineVersion: ENGINE_VERSION,
      commit: scan2.commit,
      fileCount: scan2.files.length,
      languages: scan2.languages,
      capped: scan2.capped
    };
    emit(JSON.stringify(summary, null, 2) + "\n", flags2.out);
  } else if (cmd === "graph") {
    const { graph } = buildIndexArtifacts(flags2.repo, scanOptions(flags2));
    emit(renderGraphJson(graph), flags2.out);
  } else if (cmd === "symbols") {
    const { symbols } = buildIndexArtifacts(flags2.repo, scanOptions(flags2));
    emit(renderSymbolsJson(symbols), flags2.out);
  } else if (cmd === "callers") {
    const scan2 = scanRepo(flags2.repo, scanOptions(flags2));
    const index = buildCallerIndex(scan2);
    const obj = {};
    for (const [name2, entry] of index) obj[name2] = entry;
    emit(JSON.stringify(obj, null, 2) + "\n", flags2.out);
  } else if (cmd === "workspaces") {
    const info2 = detectWorkspaces(flags2.repo);
    emit(
      JSON.stringify(
        { packages: info2.packages, cycle: info2.cycle ?? null, topoOrder: info2.topoOrder },
        null,
        2
      ) + "\n",
      flags2.out
    );
  } else if (cmd === "churn") {
    const { churn, ok } = gitChurn(flags2.repo, { since: flags2.since });
    const sorted = {};
    for (const k of [...churn.keys()].sort()) sorted[k] = churn.get(k);
    emit(JSON.stringify({ ok, churn: sorted }, null, 2) + "\n", flags2.out);
  } else if (cmd === "grep") {
    if (!flags2.positional) throw new Error("grep needs a pattern: cli.mjs grep <pattern> --repo <dir>");
    const globs = [...flags2.include, ...flags2.exclude.map((g) => `!${g}`)];
    const hits = grepRepo(flags2.repo, flags2.positional, {
      globs: globs.length ? globs : void 0,
      ignoreCase: flags2.ignoreCase,
      maxHits: flags2.maxHits
    });
    emit(JSON.stringify(hits, null, 2) + "\n", flags2.out);
  } else {
    process.stderr.write(`unknown command: ${cmd}

${HELP}`);
    process.exitCode = 2;
  }
}

// src/walk.ts
function walk2(root, opts = {}) {
  return walk(root, opts).files;
}

// src/providers/github.ts
function toItems(raw, kind) {
  return (raw ?? []).filter((it) => it && typeof it === "object").map((it) => {
    const body2 = String(it.body ?? "").replace(/\r/g, "").trim().slice(0, 1200);
    const labels = (it.labels ?? []).map((l) => typeof l === "string" ? l : l.name).filter(Boolean).join(", ");
    const state = it.draft ? "draft" : it.state;
    return {
      source: kind,
      title: `#${it.number} ${it.title} [${state}]`,
      ref: `${kind}#${it.number}`,
      location: it.html_url,
      score: Number(it.score ?? 0),
      snippet: `state: ${state}` + (labels ? ` \xB7 labels: ${labels}` : "") + ` \xB7 comments: ${it.comments ?? 0} \xB7 updated: ${it.updated_at ?? "?"}

` + (body2 || "(no description)"),
      url: it.html_url,
      meta: { number: it.number, state, isPR: !!it.pull_request }
    };
  });
}
function apiBase(host) {
  return /(^|\.)github\.com$/i.test(host) ? "https://api.github.com" : `https://${host}/api/v3`;
}
function ghUsable(host) {
  return have("gh") && /(^|\.)github\.com$/i.test(host);
}
var canonCache = /* @__PURE__ */ new Map();
async function canonicalRepo(ref) {
  const fallback = { owner: ref.owner, repo: ref.repo };
  if (!/github/i.test(ref.host)) return fallback;
  const key = `${ref.host}/${ref.owner}/${ref.repo}`;
  const cached = canonCache.get(key);
  if (cached) return cached;
  let resolved = fallback;
  const parse = (full) => {
    const i2 = full.indexOf("/");
    return i2 > 0 ? { owner: full.slice(0, i2), repo: full.slice(i2 + 1) } : fallback;
  };
  if (ghUsable(ref.host)) {
    const r = sh("gh", ["api", `repos/${ref.owner}/${ref.repo}`, "--jq", ".full_name"]);
    if (r.ok && r.stdout.includes("/")) resolved = parse(r.stdout.trim());
  } else {
    const r = await httpGet(`${apiBase(ref.host)}/repos/${ref.owner}/${ref.repo}`, { accept: "application/vnd.github+json" });
    if (r.ok) {
      try {
        const full = JSON.parse(r.body)?.full_name;
        if (typeof full === "string" && full.includes("/")) resolved = parse(full);
      } catch {
      }
    }
  }
  canonCache.set(key, resolved);
  return resolved;
}
async function query(ref, terms, kind, perSource) {
  const q = `repo:${ref.owner}/${ref.repo} type:${kind} ${terms.join(" ")}`.trim();
  if (ghUsable(ref.host)) {
    const res = sh("gh", ["api", "-X", "GET", "search/issues", "-f", `q=${q}`, "-f", `per_page=${perSource}`, "-f", "sort=updated", "-f", "order=desc"]);
    if (res.ok) {
      try {
        return { items: toItems(JSON.parse(res.stdout).items, kind) };
      } catch {
      }
    }
  }
  const url = `${apiBase(ref.host)}/search/issues?q=${encodeURIComponent(q)}&per_page=${perSource}&sort=updated&order=desc`;
  const r = await httpGet(url, { accept: "application/vnd.github+json" });
  if (!r.ok) {
    const hint = r.status === 422 ? `query rejected (422) for repo:${ref.owner}/${ref.repo} \u2014 the repo may be moved/renamed/private, or the query had no valid terms` : `status ${r.status}; run \`gh auth login\` for higher-rate access`;
    return { items: [], error: `GitHub ${kind} search unavailable (${hint}).` };
  }
  try {
    return { items: toItems(JSON.parse(r.body).items, kind) };
  } catch {
    return { items: [], error: `GitHub ${kind} search returned an unparseable response.` };
  }
}
var github = {
  name: "github",
  matches: (host) => /(^|\.)github\.com$/i.test(host) || /github/i.test(host),
  async search(ref0, question, kind, perSource) {
    if (!ref0.owner || !ref0.repo) {
      return { items: [], notes: ["No owner/repo resolved; cannot query GitHub issues/PRs."] };
    }
    const canon = await canonicalRepo(ref0);
    const ref = { ...ref0, owner: canon.owner, repo: canon.repo };
    const ranked = rankedKeywords(question);
    if (ranked.length === 0) return { items: [], notes: [`No keywords to search ${kind}s.`] };
    let lastError;
    for (const terms of uniqueAttempts([ranked.slice(0, 3), ranked.slice(0, 2)])) {
      const { items, error } = await query(ref, terms, kind, perSource * 2);
      if (error) lastError = error;
      if (items.length) return { items: rerank(items, ranked).slice(0, perSource), notes: [] };
    }
    const seen = /* @__PURE__ */ new Map();
    for (const t of ranked.slice(0, 4)) {
      const { items, error } = await query(ref, [t], kind, perSource * 2);
      if (error) lastError = error;
      for (const it of items) if (!seen.has(it.ref)) seen.set(it.ref, it);
    }
    const merged = rerank([...seen.values()], ranked).slice(0, perSource);
    if (merged.length) return { items: merged, notes: [] };
    return { items: [], notes: lastError ? [lastError] : [`No ${kind}s matched the question.`] };
  }
};
function rerank(items, ranked) {
  const terms = ranked.map((t) => t.toLowerCase());
  const coverage = (it) => {
    const hay = `${it.title} ${it.snippet}`.toLowerCase();
    let c2 = 0;
    for (const t of terms) if (hay.includes(t)) c2++;
    return c2;
  };
  return items.map((it) => ({ it, c: coverage(it), s: it.score })).sort((a, b) => b.c - a.c || b.s - a.s).map((x) => x.it);
}
function uniqueAttempts(lists) {
  const seen = /* @__PURE__ */ new Set();
  const out2 = [];
  for (const l of lists) {
    const key = l.join("\0");
    if (l.length && !seen.has(key)) {
      seen.add(key);
      out2.push(l);
    }
  }
  return out2;
}

// src/providers/gitlab.ts
var gitlab = {
  name: "gitlab",
  matches: (host) => /gitlab/i.test(host),
  async search(ref, question, kind, perSource) {
    if (!ref.owner || !ref.repo) {
      return { items: [], notes: ["No project path resolved; cannot query GitLab issues/MRs."] };
    }
    const kw = rankedKeywords(question).slice(0, 4);
    if (kw.length === 0) {
      return { items: [], notes: [`No keywords to search GitLab ${kind === "issue" ? "issues" : "merge requests"}.`] };
    }
    const proj = encodeURIComponent(`${ref.owner}/${ref.repo}`);
    const path = kind === "issue" ? "issues" : "merge_requests";
    const search = encodeURIComponent(kw.join(" "));
    const url = `https://${ref.host}/api/v4/projects/${proj}/${path}?search=${search}&per_page=${perSource}&order_by=updated_at&sort=desc`;
    const r = await httpGet(url, { accept: "application/json" });
    if (!r.ok) {
      return { items: [], notes: [`GitLab ${kind} search unavailable (status ${r.status}).`] };
    }
    try {
      const arr = JSON.parse(r.body);
      if (!Array.isArray(arr)) return { items: [], notes: [`GitLab ${kind} search returned no array.`] };
      const marker = kind === "issue" ? "#" : "!";
      const items = arr.filter((it) => it && typeof it === "object").map((it) => {
        const num = it.iid ?? it.id;
        const body2 = String(it.description ?? "").replace(/\r/g, "").trim().slice(0, 1200);
        return {
          source: kind,
          title: `${marker}${num} ${it.title} [${it.state}]`,
          ref: `${kind}#${num}`,
          location: it.web_url,
          score: 0,
          snippet: `state: ${it.state} \xB7 updated: ${it.updated_at ?? "?"}

${body2 || "(no description)"}`,
          url: it.web_url,
          meta: { iid: num, state: it.state }
        };
      });
      return { items, notes: [] };
    } catch {
      return { items: [], notes: [`GitLab ${kind} search returned an unparseable response.`] };
    }
  }
};

// src/providers/generic.ts
var generic = {
  name: "generic",
  matches: () => true,
  async search(ref, _question, kind) {
    return {
      items: [],
      notes: [`No public ${kind} API for host "${ref.host}". The code was cloned and indexed; issues/PRs are not retrievable for this host.`]
    };
  }
};

// src/providers/registry.ts
var PROVIDERS = [github, gitlab];
function providerFor(host) {
  return PROVIDERS.find((p) => p.matches(host)) ?? generic;
}

// src/research/oss.ts
var NON_REPO_OWNERS = /* @__PURE__ */ new Set([
  "topics",
  "search",
  "collections",
  "trending",
  "explore",
  "marketplace",
  "sponsors",
  "features",
  "about",
  "pricing",
  "login",
  "join",
  "signup",
  "settings",
  "notifications",
  "issues",
  "pulls",
  "orgs",
  "apps",
  "blog",
  "site",
  "enterprise",
  "customer-stories",
  "security",
  "readme",
  "events",
  "dashboard",
  "groups",
  "users",
  "help",
  "projects",
  "-"
]);
function canonicalRepoUrl(url) {
  const m = /^(https?:\/\/(?:github|gitlab)\.com\/([A-Za-z0-9._-]+)\/[A-Za-z0-9._-]+)/i.exec(url);
  if (!m || NON_REPO_OWNERS.has(m[2].toLowerCase())) return void 0;
  return m[1].replace(/\.git$/, "");
}
function normalizeSeed(raw) {
  const s = raw.trim();
  if (!s) return void 0;
  if (/^https?:\/\/github\.com\//i.test(s)) return canonicalRepoUrl(s);
  const ref = resolveRepo(s);
  return ref.isLocal || ref.owner && ref.repo ? s : void 0;
}
function languageHistogram(files) {
  const counts = /* @__PURE__ */ new Map();
  for (const f of files) {
    const ext = f.ext.replace(/^\./, "");
    if (!ext) continue;
    counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
async function ossAngle(ctx) {
  const notes = [];
  let seeds = [...new Set(ctx.brief.ossSeeds.map(normalizeSeed).filter((x) => !!x))];
  if (seeds.length === 0) {
    const q2 = `${ctx.query || ctx.brief.idea} open source github`;
    const d = await discover(q2, ctx.webEngine, ctx.perSource);
    notes.push(`OSS discovery via ${d.via} for "${q2}".`, ...d.notes);
    seeds = [...new Set(d.urls.map(canonicalRepoUrl).filter((x) => !!x))];
  }
  seeds = seeds.slice(0, 3);
  if (seeds.length === 0) {
    return [{ source: "oss", items: [], notes: [...notes, "No comparable OSS projects found."] }];
  }
  const ossItems = [];
  const issueItems = [];
  const prItems = [];
  const q = ctx.query || ctx.brief.idea;
  for (const seed of seeds) {
    const ref = resolveRepo(seed);
    let dir;
    try {
      dir = ensureClone(ref, { refresh: ctx.refresh });
    } catch (e) {
      notes.push(`Could not clone ${ref.raw}: ${e.message}`);
    }
    const repoLabel = ref.owner && ref.repo ? `${ref.owner}/${ref.repo}` : ref.slug;
    if (dir) {
      const files = walk2(dir);
      const langs = languageHistogram(files).slice(0, 6).map(([e, c2]) => `${e}:${c2}`).join(", ");
      let snippet = `Languages: ${langs || "n/a"} \xB7 files: ${files.length}.`;
      const readme = files.find((f) => /^readme(\.|$)/i.test(f.rel)) ?? files.find((f) => /(^|\/)readme\./i.test(f.rel));
      if (readme) {
        const text = readText(readme.abs);
        const ex = excerptsFromText(text, ref.webUrl ?? ref.raw, repoLabel, "oss", q, 1);
        if (ex[0]) snippet += `

${ex[0].snippet}`;
      }
      ossItems.push({
        source: "oss",
        title: `${repoLabel} \u2014 prior art`,
        ref: repoLabel,
        location: ref.webUrl,
        score: files.length,
        snippet,
        url: ref.webUrl
      });
    }
    if (ref.owner && ref.repo) {
      const provider = providerFor(ref.host);
      const iss = await provider.search(ref, q, "issue", ctx.perSource);
      issueItems.push(...iss.items);
      notes.push(...iss.notes);
      const prs = await provider.search(ref, q, "pr", ctx.perSource);
      prItems.push(...prs.items);
      notes.push(...prs.notes);
    }
  }
  return [
    { source: "oss", items: ossItems, notes },
    { source: "issue", items: issueItems, notes: [] },
    { source: "pr", items: prItems, notes: [] }
  ];
}

// src/research/stackoverflow.ts
function soTagFor(tech) {
  return tech.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9.+-]/g, "").replace(/^-+|-+$/g, "");
}
async function soQuery(q, perSource, tag) {
  const pat = process.env.STACK_PAT ? `&access_token=${process.env.STACK_PAT}` : "";
  const tagged = tag ? `&tagged=${encodeURIComponent(tag)}` : "";
  const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${q}&site=stackoverflow&filter=withbody&pagesize=${perSource}${tagged}${pat}`;
  const r = await httpGet(url, { accept: "application/json" });
  return { ok: r.ok, status: r.status, body: r.body, url };
}
async function stackoverflow(question, perSource, opts = {}) {
  const kws = rankedKeywords(question).slice(0, 5).join(" ");
  if (!kws) return { source: "so", items: [], notes: ["No keywords to search StackOverflow."] };
  const q = encodeURIComponent(kws);
  const notes = [];
  let r = await soQuery(q, perSource, opts.tag);
  if (!r.ok) {
    return { source: "so", items: [], notes: [`StackOverflow search unavailable (status ${r.status}).`] };
  }
  let data;
  try {
    data = JSON.parse(r.body);
  } catch {
    return { source: "so", items: [], notes: ["StackOverflow search returned an unparseable response."] };
  }
  if (opts.tag && (data.items ?? []).length === 0) {
    r = await soQuery(q, perSource, void 0);
    if (r.ok) {
      try {
        data = JSON.parse(r.body);
        notes.push(`No tagged:${opts.tag} results \u2014 retried without the tag.`);
      } catch {
      }
    }
  }
  const wantKws = new Set(keywords(question).map((k) => k.toLowerCase()));
  const items = [];
  let filtered = 0;
  for (const raw of data.items ?? []) {
    const it = raw;
    const title = htmlToText(String(it.title ?? "(question)")).slice(0, 160);
    const tags = Array.isArray(it.tags) ? it.tags : [];
    if (wantKws.size) {
      const hay = new Set(keywords(`${title} ${tags.join(" ")}`).map((k) => k.toLowerCase()));
      const overlaps = [...wantKws].some((k) => hay.has(k)) || tags.some((t) => wantKws.has(t.toLowerCase()));
      if (!overlaps) {
        filtered++;
        continue;
      }
    }
    const body2 = htmlToText(String(it.body ?? "")).slice(0, 1200);
    const accepted = it.is_answered ? "answered" : "unanswered";
    items.push({
      source: "so",
      title,
      ref: `so:${it.question_id}`,
      location: it.link,
      score: Number(it.score ?? 0),
      snippet: `score: ${it.score ?? 0} \xB7 ${accepted} \xB7 answers: ${it.answer_count ?? 0}` + (tags.length ? ` \xB7 tags: ${tags.slice(0, 6).join(", ")}` : "") + `

${body2 || "(no body)"}`,
      url: it.link,
      meta: { questionId: it.question_id, isAnswered: it.is_answered, answerCount: it.answer_count }
    });
  }
  if (filtered) notes.push(`Filtered ${filtered} off-topic StackOverflow result(s) (no keyword overlap with the query).`);
  if (data.quota_remaining !== void 0 && data.quota_remaining < 20) notes.push(`StackExchange anonymous quota low (${data.quota_remaining} left).`);
  if (items.length === 0) notes.push("No StackOverflow questions matched.");
  return { source: "so", items, notes };
}

// src/research/tech.ts
async function techAngle(ctx) {
  const allTechs = ctx.brief.candidateTech;
  const techs = allTechs.slice(0, 3);
  const ideaKw = ctx.query || ctx.brief.idea;
  const docItems = [];
  const docNotes = [];
  if (allTechs.length > techs.length) {
    docNotes.push(
      `Only the first ${techs.length} of ${allTechs.length} candidate technologies were grounded; skipped: ${allTechs.slice(techs.length).join(", ")}. Drill them with \`construct tech --out <run> --q "<tech>"\`.`
    );
  }
  if (ctx.docsUrls?.length) {
    const direct = await webFetchUrls(ctx.docsUrls, ideaKw, ctx.perSource, "docs", true);
    docItems.push(...direct.items);
    docNotes.push(`Grounded ${ctx.docsUrls.length} docs URL(s) passed via --docs-url.`, ...direct.notes);
  }
  for (const tech of techs) {
    const q = `${tech} official documentation`;
    const { urls, via, notes } = await discover(q, ctx.webEngine, ctx.perSource);
    docNotes.push(`Docs discovery for "${tech}" via ${via}.`, ...notes);
    if (!urls.length) continue;
    const fetched = await webFetchUrls(urls.slice(0, 1), `${tech} ${ideaKw}`, ctx.perSource, "docs");
    docItems.push(...fetched.items);
    docNotes.push(...fetched.notes);
  }
  if (techs.length === 0 && !ctx.docsUrls?.length) docNotes.push("No candidate technologies in the brief \u2014 nothing to ground feasibility against.");
  const topKw = rankedKeywords(ideaKw)[0] ?? "";
  const soItems = [];
  const soNotes = [];
  const seen = /* @__PURE__ */ new Set();
  const per = Math.max(2, Math.ceil(ctx.perSource / Math.max(1, techs.length)));
  for (const tech of techs) {
    const q = `${tech} ${topKw}`.trim();
    const r = await stackoverflow(q, per, { tag: soTagFor(tech) });
    for (const it of r.items) {
      if (!seen.has(it.ref)) {
        seen.add(it.ref);
        soItems.push(it);
      }
    }
    soNotes.push(...r.notes);
  }
  if (techs.length === 0) soNotes.push("No candidate technologies to search StackOverflow for.");
  return [
    { source: "docs", items: docItems, notes: docNotes },
    { source: "so", items: soItems, notes: soNotes }
  ];
}

// src/research/semantic.ts
import { existsSync as existsSync5 } from "fs";
import { join as join7, dirname as dirname2 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
var OLLAMA = (process.env.CONSTRUCT_OLLAMA || "http://localhost:11434").replace(/\/$/, "");
var EMBED_MODEL = process.env.CONSTRUCT_EMBED_MODEL || "nomic-embed-text";
function cosine(a, b) {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i2 = 0; i2 < a.length; i2++) {
    dot += a[i2] * b[i2];
    na += a[i2] * a[i2];
    nb += b[i2] * b[i2];
  }
  if (na === 0 || nb === 0) return 0;
  const r = dot / (Math.sqrt(na) * Math.sqrt(nb));
  return Number.isFinite(r) ? r : 0;
}
async function reachable(base, path = "/") {
  const r = await httpGet(base + path, { timeoutMs: REACHABLE_TIMEOUT_MS });
  return r.ok;
}
async function embed(text) {
  const r = await httpJson("POST", `${OLLAMA}/api/embeddings`, { model: EMBED_MODEL, prompt: text.slice(0, 4e3) }, { timeoutMs: EMBED_TIMEOUT_MS });
  const v = r.ok ? r.data?.embedding : void 0;
  return Array.isArray(v) && v.length ? v : null;
}
async function semanticRescore(results, query2) {
  const unchanged = (why) => ({
    available: false,
    results,
    notes: [`Semantic mode unavailable (${why}); kept lexical ranking.`]
  });
  if (!await reachable(OLLAMA, "/api/tags")) {
    return unchanged(`Ollama not reachable at ${OLLAMA} \u2014 run \`construct semantic up\``);
  }
  const qv = await embed(query2);
  if (!qv) return unchanged(`could not embed the query (is the '${EMBED_MODEL}' model pulled?)`);
  const out2 = [];
  let failures = 0;
  for (const r of results) {
    const items = [];
    for (const it of r.items) {
      const v = await embed(`${it.title}
${it.snippet}`);
      if (v) {
        items.push({ ...it, score: Number(cosine(qv, v).toFixed(4)), meta: { ...it.meta ?? {}, semantic: true } });
      } else {
        failures++;
        items.push({ ...it, score: -1, meta: { ...it.meta ?? {}, semantic: false } });
      }
    }
    out2.push({ ...r, items });
  }
  const notes = [`Semantic rescoring via Ollama + ${EMBED_MODEL} (local).`];
  if (failures) notes.push(`${failures} item(s) could not be embedded; ranked last.`);
  return { available: true, results: out2, notes };
}
function composeFile() {
  const here = dirname2(fileURLToPath2(import.meta.url));
  for (const cand of [join7(here, "..", "docker-compose.yml"), join7(here, "docker-compose.yml"), join7(here, "..", "..", "docker-compose.yml")]) {
    if (existsSync5(cand)) return cand;
  }
  return null;
}
function semanticControl(action, composeFilePath = composeFile()) {
  if (!["up", "down", "status"].includes(action)) {
    return { message: `construct semantic: unknown action "${action}" (use: up | down | status)`, code: 1 };
  }
  if (!have("docker")) {
    return { message: "construct semantic: docker not found. Install Docker, then retry. See references/semantic-setup.md.", code: 1 };
  }
  if (!composeFilePath) {
    return {
      message: "construct semantic: docker-compose.yml not found next to the bundle \u2014 reinstall the skill (`npx skills add maxgfr/construct`), or run from the repo. See references/semantic-setup.md.",
      code: 1
    };
  }
  const file = composeFilePath;
  if (action === "down") {
    const r = sh("docker", ["compose", "-f", file, "--profile", "all", "down"], { timeoutMs: COMPOSE_DOWN_TIMEOUT_MS });
    return { message: r.ok ? "construct semantic: stack stopped." : `construct semantic: down failed.
${r.stderr}`, code: r.ok ? 0 : 1 };
  }
  if (action === "status") {
    const r = sh("docker", ["compose", "-f", file, "ps"], { timeoutMs: COMPOSE_PS_TIMEOUT_MS });
    return { message: r.ok ? r.stdout || "construct semantic: no services running." : `construct semantic: status failed.
${r.stderr}`, code: 0 };
  }
  const up = sh("docker", ["compose", "-f", file, "--profile", "all", "up", "-d"], { timeoutMs: COMPOSE_UP_TIMEOUT_MS });
  if (!up.ok) return { message: `construct semantic: up failed.
${up.stderr}`, code: 1 };
  const pull = sh("docker", ["compose", "-f", file, "exec", "-T", "ollama", "ollama", "pull", EMBED_MODEL], { timeoutMs: OLLAMA_PULL_TIMEOUT_MS });
  const lines = [
    "construct semantic: stack is up (Qdrant :6333 \xB7 Ollama :11434 \xB7 SearXNG :8888).",
    pull.ok ? `  model:  ${EMBED_MODEL} ready` : `  model:  pull '${EMBED_MODEL}' yourself: docker compose -f ${file} exec ollama ollama pull ${EMBED_MODEL}`,
    "  use:    construct research --out <run> --angles market,oss,tech,semantic --semantic"
  ];
  return { message: lines.join("\n"), code: 0 };
}

// src/research/dossier.ts
import { mkdirSync as mkdirSync5, writeFileSync as writeFileSync4 } from "fs";
import { join as join8 } from "path";
var SOURCE_ORDER = ["market", "oss", "docs", "so", "issue", "pr"];
var SOURCE_LABEL = {
  market: "Market & competitors",
  oss: "Open-source prior art",
  docs: "Technology documentation",
  so: "StackOverflow",
  issue: "Issues (prior art)",
  pr: "Pull / Merge Requests (prior art)"
};
function rank(s) {
  const i2 = SOURCE_ORDER.indexOf(s);
  return i2 < 0 ? 99 : i2;
}
function assignIds2(results) {
  const flat = results.flatMap((r) => r.items);
  flat.sort((a, b) => rank(a.source) - rank(b.source) || b.score - a.score || a.ref.localeCompare(b.ref));
  return flat.map((it, i2) => ({ id: `E${i2 + 1}`, ...it }));
}
function renderEvidenceMarkdown(evidence, meta) {
  const out2 = [];
  out2.push(`# Evidence dossier`);
  out2.push("");
  out2.push(`**Idea:** ${meta.idea}`);
  if (meta.query) out2.push(`**Query:** ${meta.query}`);
  out2.push(`**Angles:** ${meta.angles.join(", ")} \xB7 **semantic:** ${meta.semantic ? "on" : "off"} \xB7 **built:** ${meta.builtAt}`);
  out2.push("");
  out2.push(
    `> Ground the SRD's requirements and decisions in this evidence. Cite items by id, e.g. \`[E1]\`. Grounding is advisory \u2014 \`construct check\` reports coverage but never fails on it. Still: prefer a cited claim to a guessed one.`
  );
  out2.push("");
  if (evidence.length === 0) {
    out2.push(`_No evidence was retrieved. Broaden the query, add angles, or check connectivity._`);
  }
  for (const source of SOURCE_ORDER) {
    const items = evidence.filter((e) => e.source === source);
    if (items.length === 0) continue;
    out2.push(`## ${SOURCE_LABEL[source]}`);
    out2.push("");
    for (const it of items) {
      out2.push(`### [${it.id}] ${it.title}`);
      const meta1 = [`ref: \`${it.ref}\``, it.location ? `loc: \`${it.location}\`` : "", `score: ${it.score}`].filter(Boolean).join(" \xB7 ");
      out2.push(meta1);
      if (it.url) out2.push(`url: ${it.url}`);
      out2.push("");
      out2.push("```");
      out2.push(it.snippet);
      out2.push("```");
      out2.push("");
    }
  }
  if (meta.notes.length) {
    out2.push(`## Retrieval notes`);
    out2.push("");
    for (const n of meta.notes) out2.push(`- ${n}`);
    out2.push("");
  }
  return out2.join("\n");
}
function writeDossier(dir, evidence, meta) {
  mkdirSync5(dir, { recursive: true });
  const evidenceJson = join8(dir, "evidence.json");
  const evidenceMd = join8(dir, "EVIDENCE.md");
  const metaJson = join8(dir, "meta.json");
  writeFileSync4(evidenceJson, JSON.stringify(evidence, null, 2));
  writeFileSync4(evidenceMd, renderEvidenceMarkdown(evidence, meta));
  writeFileSync4(metaJson, JSON.stringify(meta, null, 2));
  return { dir, evidenceJson, evidenceMd, metaJson };
}

// src/research/registry.ts
var HANDLERS = {
  market: marketAngle,
  oss: ossAngle,
  tech: techAngle
};
var ANGLE_SOURCE = {
  market: "market",
  oss: "oss",
  tech: "docs"
};
async function runAngles(ctx) {
  const active = ctx.angles.filter((a) => a !== "semantic");
  const settled = await Promise.all(
    active.map(async (a) => {
      try {
        return await HANDLERS[a](ctx);
      } catch (e) {
        return [{ source: ANGLE_SOURCE[a], items: [], notes: [`${a} angle failed: ${e.message}`] }];
      }
    })
  );
  let results = settled.flat();
  const notes = [];
  if (ctx.semantic || ctx.angles.includes("semantic")) {
    const q = ctx.query || ctx.brief.idea;
    const s = await semanticRescore(results, q);
    results = s.results;
    notes.push(...s.notes);
  }
  return { results, notes };
}
async function runResearch(ctx, builtAt) {
  const { results, notes } = await runAngles(ctx);
  const capped = results.map((r) => ({
    ...r,
    items: [...r.items].sort((a, b) => b.score - a.score).slice(0, ctx.perSource)
  }));
  const evidence = assignIds2(capped);
  const presentSources = [...new Set(evidence.map((e) => e.source))];
  const meta = {
    idea: ctx.brief.idea,
    angles: ctx.angles,
    query: ctx.query || void 0,
    sources: presentSources,
    semantic: ctx.semantic || ctx.angles.includes("semantic"),
    evidenceCount: evidence.length,
    builtAt,
    notes: [...capped.flatMap((r) => r.notes), ...notes]
  };
  const dir = join9(ctx.runDir, "evidence");
  const paths = writeDossier(dir, evidence, meta);
  return { dir, evidence, meta, paths };
}

// src/render.ts
import { existsSync as existsSync7, mkdirSync as mkdirSync6, readFileSync as readFileSync5, writeFileSync as writeFileSync6, rmSync as rmSync2 } from "fs";
import { join as join12, dirname as dirname3 } from "path";

// src/srd.ts
import { join as join10 } from "path";
function srdManifestPath(runDir) {
  return join10(runDir, "SRD.json");
}
function pad3(n) {
  return String(n).padStart(3, "0");
}
function pad4(n) {
  return String(n).padStart(4, "0");
}
var GROUND_REQUIREMENT = ["market", "oss", "docs", "so", "issue", "pr"];
var GROUND_QUALITY = ["oss", "docs", "so", "issue", "pr"];
function matchEvidence(text, evidence, n, onlySources) {
  const kws = keywords(text).map((k) => k.toLowerCase());
  if (kws.length === 0) return [];
  const need = Math.min(2, kws.length);
  const ratioFloor = 0.34;
  const scored = evidence.filter((e) => !onlySources || onlySources.includes(e.source)).map((e) => {
    const hay = new Set(keywords(`${e.title} ${e.snippet}`).map((k) => k.toLowerCase()));
    let cov = 0;
    for (const kw of kws) if (hay.has(kw)) cov++;
    return { id: e.id, key: e.url || `${e.source}:${e.ref}`, cov, ratio: cov / kws.length, score: e.score };
  }).filter((x) => x.cov >= need && x.ratio >= ratioFloor).sort((a, b) => b.cov - a.cov || b.ratio - a.ratio || b.score - a.score || a.id.localeCompare(b.id));
  const seen = /* @__PURE__ */ new Set();
  const out2 = [];
  for (const x of scored) {
    if (seen.has(x.key)) continue;
    seen.add(x.key);
    out2.push(x.id);
    if (out2.length >= n) break;
  }
  return out2;
}
function mentionsEntity(name2, e) {
  const phrase = name2.trim().toLowerCase().replace(/\s+/g, " ");
  if (!phrase) return false;
  const hay = `${e.title} ${e.snippet}`.toLowerCase().replace(/\s+/g, " ");
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(hay);
}
var NFR_SIGNALS = {
  privacy: /privac|gdpr|personal data|consent|self[- ]?host|own (your|the) data|no account/i,
  accessibility: /accessib|a11y|screen reader|wcag|keyboard/i,
  security: /auth|login|password|secret|token|encrypt|credential|account/i,
  performance: /fast|latenc|speed|sub-?second|under \d+ ?(s|sec|second|ms|minute)/i,
  reliability: /reliab|availab|recover|double-?book|never|busy|conflict|sync/i,
  observability: /log|metric|trace|monitor|audit/i,
  usability: /usab|onboard|guest|no account|widget|embed|reminder/i,
  cost: /cost|budget|cheap|self[- ]?host/i,
  i18n: /locale|i18n|timezone|language|translat/i
};
var INTEGRATION_RE = /\b(?:calendar|caldav|google|ical|ics|sync|webhook|email|smtp|sms|widget|iframe|embed|oauth|payment|api)s?\b/i;
var PERSIST_RE = /persist|store|database|datastore|save|record|booking|event|schedul|inventory|history/i;
var NFR_TEMPLATES = {
  performance: {
    statement: "The system responds to primary user actions without perceptible delay under expected load.",
    metric: "p95 latency < 300 ms for core interactions at expected concurrency."
  },
  security: {
    statement: "User data and credentials are protected in transit and at rest, with least-privilege access.",
    metric: "All endpoints authenticated/authorized; secrets never logged; dependencies scanned in CI."
  },
  reliability: {
    statement: "The system degrades gracefully and recovers from transient failures without data loss.",
    metric: "Monthly availability \u2265 99.9%; no data loss on a single-node failure."
  },
  usability: {
    statement: "A new user can complete the primary task without external help.",
    metric: "\u2265 80% task-completion rate in unmoderated usability testing."
  },
  observability: {
    statement: "Operators can diagnose failures from logs, metrics and traces without reproducing locally.",
    metric: "Structured logs + metrics on every request; alert on error-rate and latency SLO breach."
  },
  cost: {
    statement: "Running cost scales sub-linearly with usage and stays within the stated budget.",
    metric: "Cost per active user tracked; infra cost within the budget constraint."
  },
  scalability: {
    statement: "The system scales horizontally to handle growth without re-architecture.",
    metric: "Throughput scales near-linearly to 10\xD7 the launch load."
  },
  accessibility: {
    statement: "The interface is usable with assistive technology and meets recognised accessibility guidelines.",
    metric: "WCAG 2.1 AA conformance on primary flows."
  },
  privacy: {
    statement: "Personal data is collected lawfully, minimised, and removable on request.",
    metric: "Data-retention policy enforced; export/delete available for user data."
  },
  i18n: {
    statement: "The product supports multiple locales without code changes.",
    metric: "All user-facing copy externalised; locale switch covers core flows."
  },
  maintainability: {
    statement: "The codebase is testable, documented, and changeable by a new contributor.",
    metric: "Test coverage gate in CI; onboarding to first PR within a day."
  }
};
function nfrFor(category) {
  const key = category.toLowerCase().trim();
  return NFR_TEMPLATES[key] ?? {
    statement: `The system meets the "${category}" quality expectation defined for this product.`,
    metric: `A measurable target for "${category}" is agreed and tracked.`
  };
}
function priorityOf(p) {
  return p === "must" || p === "should" || p === "could" ? p : "should";
}
var FEATURE_VERBS = /* @__PURE__ */ new Set([
  "create",
  "add",
  "manage",
  "book",
  "view",
  "send",
  "track",
  "sync",
  "edit",
  "delete",
  "list",
  "share",
  "export",
  "import",
  "search",
  "save",
  "read",
  "tag",
  "organize",
  "organise",
  "schedule",
  "upload",
  "download",
  "browse",
  "filter",
  "sort",
  "archive",
  "publish",
  "invite",
  "assign",
  "stream"
]);
var NON_ENTITY_WORDS = /* @__PURE__ */ new Set(["search", "login", "signup", "support", "setup", "offline", "online", "mobile", "desktop", "full", "text", "user", "users"]);
var ADJECTIVAL_PREFIXES = /* @__PURE__ */ new Set([
  "multi",
  "auto",
  "self",
  "cross",
  "pre",
  "post",
  "non",
  "anti",
  "semi",
  "meta",
  "mini",
  "micro",
  "macro",
  "mono",
  "dual",
  "poly",
  "omni",
  "pseudo",
  "quasi",
  "ultra",
  "hyper",
  "super",
  "sub",
  "inter",
  "intra",
  "extra"
]);
function singularize(w) {
  if (/ies$/.test(w)) return w.slice(0, -3) + "y";
  if (/(?:ches|shes|xes|zes|ses)$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w) && !/(?:ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}
function titleCase(w) {
  return w ? w[0].toUpperCase() + w.slice(1) : w;
}
function entityTokens(title, exclude) {
  const words = keywords(title).map((w) => w.toLowerCase());
  const verbLed = words.length > 0 && FEATURE_VERBS.has(words[0]);
  const rest = verbLed ? words.slice(1) : words;
  const tokens = rest.filter((w) => w.length >= 3 && !FEATURE_VERBS.has(w) && !NON_ENTITY_WORDS.has(w) && !ADJECTIVAL_PREFIXES.has(w) && !/(?:ed|ing)$/.test(w)).map(singularize).filter((w) => !exclude.has(w));
  return { tokens, verbLed };
}
function inferEntities(brief, functional) {
  const exclude = new Set(
    [...brief.competitors, ...brief.candidateTech, brief.product.name ?? ""].flatMap((s) => keywords(s).map((w) => singularize(w.toLowerCase())))
  );
  const perFr = functional.map((fr) => ({ fr, ...entityTokens(fr.title, exclude) }));
  const freq = /* @__PURE__ */ new Map();
  for (const p of perFr) for (const t of new Set(p.tokens)) freq.set(t, (freq.get(t) ?? 0) + 1);
  const chosen = /* @__PURE__ */ new Set();
  for (const [t, n] of freq) if (n >= 2) chosen.add(t);
  for (const p of perFr) {
    if (p.verbLed && p.fr.priority === "must" && p.tokens[0]) chosen.add(p.tokens[0]);
  }
  const names = [...chosen].sort((a, b) => freq.get(b) - freq.get(a) || a.localeCompare(b)).slice(0, 8);
  const entities = names.map((n) => {
    const name2 = titleCase(n);
    const refs = perFr.filter((p) => p.tokens.includes(n)).map((p) => p.fr.id);
    return {
      name: name2,
      attributes: [
        { name: "id", type: "identifier" },
        { name: "createdAt", type: "timestamp" }
      ],
      referencedByFRs: refs
    };
  });
  for (const fr of functional) {
    fr.entities = entities.filter((e) => e.referencedByFRs.includes(fr.id)).map((e) => e.name);
  }
  return entities;
}
var BOUNDARY_DEFS = [
  // Word boundaries matter: a bare /ical|ics/ substring-matches "historical"
  // and "metrics", /stripe/ matches "pinstripe", /embed/ matches "Embedded" and
  // /google/ matches "googled" — each hallucinating an integration into an
  // unrelated product. Every token is bounded (optional plural) for that reason.
  { re: /\b(?:calendar|caldav|ical|ics)\b/i, label: "calendar systems (CalDAV/iCal)", name: "Calendar Integration", kind: "api" },
  { re: /\bgoogles?\b/i, label: "Google APIs", name: "Google API Integration", kind: "api" },
  { re: /\b(?:email|smtp)s?\b/i, label: "an email/SMTP provider", name: "Email Delivery", kind: "api" },
  { re: /\b(?:sms|twilio)s?\b/i, label: "an SMS provider", name: "SMS Delivery", kind: "api" },
  { re: /\b(?:widget|iframe|embed)s?\b/i, label: "external host sites (embed/iframe)", name: "Embeddable Widget", kind: "ui" },
  { re: /\b(?:payment|stripe|billing)s?\b/i, label: "a payments provider", name: "Payments Integration", kind: "api" },
  { re: /\bwebhooks?\b/i, label: "outbound webhooks", name: "Outbound Webhooks", kind: "event" },
  { re: /\b(?:browser extension|chrome extension|firefox add-?on)s?\b/i, label: "a browser extension", name: "Browser Extension", kind: "ui" }
];
function boundaryHaystack(brief) {
  return `${brief.idea} ${brief.candidateTech.join(" ")} ${brief.featureWishlist.map((f) => `${f.title} ${f.notes ?? ""}`).join(" ")}`;
}
function detectBoundaries(brief) {
  const haystack = boundaryHaystack(brief);
  return BOUNDARY_DEFS.filter((b) => b.re.test(haystack));
}
function inferInterfaces(brief, functional) {
  const out2 = [];
  for (const b of detectBoundaries(brief)) {
    const related = functional.filter((fr) => b.re.test(`${fr.title} ${fr.description}`)).map((fr) => fr.id);
    out2.push({
      name: b.name,
      kind: b.kind,
      summary: `Boundary with ${b.label}. Define the contract (operations, data, failure modes) during authoring.`,
      relatedFRs: related
    });
  }
  if (brief.product.users?.length) {
    out2.push({
      name: "Web App",
      kind: "ui",
      summary: `The primary user-facing surface through which ${brief.product.users.join(", ")} use the product.`,
      relatedFRs: functional.map((f) => f.id)
    });
  }
  for (const fr of functional) {
    fr.interfaces = out2.filter((i2) => i2.relatedFRs.includes(fr.id)).map((i2) => i2.name);
  }
  return out2;
}
function buildSRD(brief, evidence, opts) {
  const level = opts.level;
  const productName = brief.product.name || titleFromIdea(brief.idea);
  const compliance = brief.constraints.compliance ?? [];
  const selfHost = /self[- ]?host|privacy|gdpr|own (your|the) data/i.test(`${brief.idea} ${brief.product.valueProp ?? ""}`) || compliance.length > 0;
  const timeGoal = timeTokenFromGoals(brief.goals);
  const categories = [];
  for (const c2 of REQUIRED_NFR[level]) if (!categories.includes(c2)) categories.push(c2);
  for (const c2 of brief.nfrPriorities) {
    const k = c2.toLowerCase().trim();
    if (k && !categories.includes(k)) categories.push(k);
  }
  const nonFunctional = categories.map((cat, i2) => {
    const t = nfrFor(cat);
    const metric = specialiseMetric(cat, t.metric, { compliance, selfHost, timeGoal, budget: brief.constraints.budget });
    const statement = specialiseStatement(cat, t.statement, { compliance, selfHost });
    return {
      id: `NFR-${pad3(i2 + 1)}`,
      category: cat,
      statement,
      metric,
      // Ground over the *specialised* text + distinctive brief facts (CalDAV,
      // GDPR…), restricted to authoritative sources (no marketing pages).
      rationaleEvidence: matchEvidence(`${cat} ${statement} ${brief.candidateTech.join(" ")} ${compliance.join(" ")}`, evidence, 1, GROUND_QUALITY)
    };
  });
  const coreNfrIds = nonFunctional.filter((n) => REQUIRED_NFR.light.includes(n.category.toLowerCase())).map((n) => n.id);
  const adrs = [];
  const stack = brief.candidateTech.length ? brief.candidateTech.join(", ") : "a stack to be selected";
  adrs.push({
    id: "",
    title: "Primary technology stack",
    status: brief.candidateTech.length ? "accepted" : "proposed",
    context: `Building "${productName}" requires a stack that fits the team (${brief.constraints.team || "to be defined"}) and timeline (${brief.constraints.timeline || "to be defined"}).`,
    decision: `Adopt ${stack} as the primary stack for the initial build.`,
    consequences: `The team commits to ${stack}; hiring, tooling and operational knowledge align to it. Revisit if a hard requirement is unmet.`,
    alternatives: brief.candidateTech.length ? "No explicit alternative stack was provided in the brief; evaluate one comparable option before locking this in." : "Alternative stacks were considered but not selected.",
    evidence: matchEvidence(`${stack} architecture stack`, evidence, 2, ["docs", "oss", "so"])
  });
  if (selfHost) {
    adrs.push({
      id: "",
      title: "Self-hosting and data-ownership model",
      status: "accepted",
      context: `"${productName}" is positioned as privacy-first / self-hostable${compliance.length ? ` and must satisfy: ${compliance.join(", ")}` : ""}.`,
      decision: "Ship as a self-hostable deployment where the host owns all data; no user data is sent to a third-party service by default.",
      consequences: "Data residency and compliance become the host's responsibility (a feature, not a liability); the product must run with no mandatory external dependencies and document its data flows.",
      alternatives: "A hosted multi-tenant SaaS was considered but rejected as it conflicts with the privacy/data-ownership value proposition.",
      evidence: matchEvidence(`self-host privacy data ownership ${compliance.join(" ")}`, evidence, 2, GROUND_QUALITY)
    });
  }
  const integrates = brief.featureWishlist.some((f) => INTEGRATION_RE.test(`${f.title} ${f.notes ?? ""}`)) || INTEGRATION_RE.test(brief.idea);
  if (level === "complex" && (PERSIST_RE.test(briefText(brief)) || integrates)) {
    adrs.push({
      id: "",
      title: "Data persistence and integration approach",
      status: "proposed",
      context: `"${productName}" must persist state and integrate with external services (${brief.candidateTech.filter((t) => INTEGRATION_RE.test(t)).join(", ") || "calendar/email and similar"}) reliably.`,
      decision: "Use a single primary datastore with explicit, versioned integration boundaries for each external service.",
      consequences: "A clear data-ownership model; integrations are testable in isolation behind an adapter. Cross-service consistency must be designed explicitly.",
      alternatives: "A polyglot-persistence or event-sourced approach was considered; deferred until scale demands it.",
      evidence: matchEvidence(`${brief.candidateTech.join(" ")} database persistence integration`, evidence, 2, ["docs", "oss", "so"])
    });
  }
  adrs.forEach((a, i2) => a.id = pad4(i2 + 1));
  const stackAdrId = adrs[0].id;
  const dataAdr = adrs.find((a) => /persistence|integration/i.test(a.title));
  const privacyAdr = adrs.find((a) => /self-hosting|data-ownership/i.test(a.title));
  const functional = brief.featureWishlist.map((f, i2) => {
    const priority = priorityOf(f.priority);
    const text = `${f.title} ${f.notes ?? ""}`;
    const touchesIntegration = INTEGRATION_RE.test(text);
    const outcome = concreteOutcome(f.title, f.notes);
    const acceptance = [
      {
        given: `${productName} is available to a user`,
        when: `they ${lowerFirst(f.title)}`,
        then: outcome
      },
      ...level === "complex" ? [failurePath(f.title, touchesIntegration)] : []
    ];
    const nfrs = [...coreNfrIds];
    for (const n of nonFunctional) {
      if (coreNfrIds.includes(n.id)) continue;
      const sig = NFR_SIGNALS[n.category.toLowerCase()];
      if (sig?.test(text)) nfrs.push(n.id);
    }
    return {
      id: `FR-${pad3(i2 + 1)}`,
      title: f.title,
      description: f.notes?.trim() || `The product lets a user ${lowerFirst(f.title)}.`,
      priority,
      acceptance,
      rationaleEvidence: matchEvidence(text, evidence, 2, GROUND_REQUIREMENT),
      entities: [],
      interfaces: [],
      nfrs,
      unresolved: false,
      ...f.module ? { module: f.module } : {}
    };
  });
  const modules = brief.modules?.length ? brief.modules.map((m) => ({
    id: m.id,
    name: m.name,
    ...m.description ? { description: m.description } : {},
    frIds: functional.filter((f) => f.module === m.id).map((f) => f.id),
    dependsOn: m.dependsOn ?? []
  })) : void 0;
  const dataModel = inferEntities(brief, functional);
  const interfaces = inferInterfaces(brief, functional);
  const evById = new Map(evidence.map((e) => [e.id, e]));
  const competitors = brief.competitors.map((name2) => {
    const ev = matchEvidence(
      name2,
      evidence.filter((e) => mentionsEntity(name2, e)),
      2,
      ["market"]
    );
    return { name: name2, note: noteFrom(ev, evById) || `Comparable product / alternative to "${productName}".`, evidence: ev };
  });
  const ossByKey = /* @__PURE__ */ new Map();
  const keyOf2 = (s) => {
    try {
      return resolveRepo(s).slug;
    } catch {
      return s.toLowerCase();
    }
  };
  for (const seed of brief.ossSeeds) {
    const ref = resolveRepo(seed);
    const label = ref.owner && ref.repo ? `${ref.owner}/${ref.repo}` : seed;
    const ev = matchEvidence(`${ref.owner ?? ""} ${ref.repo ?? ""}`.trim() || seed, evidence, 2, ["oss", "issue", "pr"]);
    ossByKey.set(keyOf2(seed), {
      name: label,
      url: ref.webUrl ?? (/^https?:/.test(seed) ? seed : void 0),
      note: noteFrom(ev, evById) || "Seed OSS project mined for prior art.",
      evidence: ev
    });
  }
  for (const e of evidence.filter((x) => x.source === "oss")) {
    const k = keyOf2(e.ref);
    if (ossByKey.has(k)) {
      if (!ossByKey.get(k).evidence.includes(e.id)) ossByKey.get(k).evidence.push(e.id);
      continue;
    }
    ossByKey.set(k, {
      name: e.title.replace(/ —.*$/, ""),
      url: e.url,
      note: firstSentence(e.snippet) || "Comparable open-source project (prior art).",
      evidence: [e.id]
    });
  }
  const oss = [...ossByKey.values()];
  const buildPlan = buildMilestones(functional, brief, evidence, evById);
  const design = opts.design ? buildDesignSystem(brief, functional) : void 0;
  const traceability = functional.map((fr) => {
    const text = `${fr.title} ${fr.description}`;
    const adrIds = [stackAdrId];
    if (dataAdr && (PERSIST_RE.test(text) || INTEGRATION_RE.test(text))) adrIds.push(dataAdr.id);
    if (privacyAdr && NFR_SIGNALS.privacy.test(text)) adrIds.push(privacyAdr.id);
    const row = { fr: fr.id, nfrs: fr.nfrs, adrs: adrIds, entities: fr.entities, interfaces: fr.interfaces };
    if (design) {
      row.components = design.components.filter((c2) => c2.relatedFRs.includes(fr.id)).map((c2) => c2.name);
      row.screens = design.screens.filter((s) => s.relatedFRs.includes(fr.id)).map((s) => s.name);
    }
    if (fr.module) row.module = fr.module;
    return row;
  });
  const referenced = /* @__PURE__ */ new Set();
  for (const fr of functional) fr.rationaleEvidence.forEach((id) => referenced.add(id));
  for (const n of nonFunctional) n.rationaleEvidence.forEach((id) => referenced.add(id));
  for (const a of adrs) a.evidence.forEach((id) => referenced.add(id));
  for (const c2 of competitors) c2.evidence.forEach((id) => referenced.add(id));
  for (const o of oss) o.evidence.forEach((id) => referenced.add(id));
  for (const m of buildPlan) (m.risks ?? []).forEach((r) => citationsIn(r).forEach((id) => referenced.add(id)));
  const evidenceIndex = [...referenced].sort((a, b) => evNum(a) - evNum(b));
  return {
    schemaVersion: SRD_SCHEMA_VERSION,
    level,
    generatedAt: opts.generatedAt,
    product: {
      name: productName,
      problem: brief.product.problem || brief.goals[0] || `Address the need described by: ${brief.idea}`,
      valueProp: brief.product.valueProp || `Deliver ${brief.idea} better than existing options.`,
      users: brief.product.users?.length ? brief.product.users : ["primary user"],
      metrics: brief.goals.length ? brief.goals : ["Define a measurable launch success metric."]
    },
    scope: {
      inScope: brief.featureWishlist.filter((f) => priorityOf(f.priority) !== "could").map((f) => f.title),
      outOfScope: brief.nonGoals,
      assumptions: deriveAssumptions(brief)
    },
    functional,
    ...modules ? { modules } : {},
    nonFunctional,
    architecture: { context: contextProse(productName, brief), dataModel, interfaces, adrs },
    competitive: { competitors, oss },
    buildPlan,
    traceability,
    openQuestions: brief.openQuestions,
    evidenceIndex,
    ...design ? { design } : {}
  };
}
function deriveA11yStandard(brief) {
  const explicit = brief.design?.accessibilityTarget?.trim();
  if (explicit) return explicit;
  const hay = `${(brief.constraints.compliance ?? []).join(" ")} ${brief.nfrPriorities.join(" ")}`.toLowerCase();
  if (/\brgaa\b/.test(hay)) return "RGAA 4.1 (aligned to WCAG 2.2 AA)";
  if (/\b508\b|section 508/.test(hay)) return "Section 508 (WCAG 2.0 AA)";
  if (/en\s?301\s?549/.test(hay)) return "EN 301 549 (WCAG 2.1 AA)";
  return "WCAG 2.2 AA";
}
function buildPrinciples(brief) {
  const hay = `${brief.idea} ${brief.product.valueProp ?? ""} ${brief.product.problem ?? ""} ${brief.nfrPriorities.join(" ")} ${brief.featureWishlist.map((f) => `${f.title} ${f.notes ?? ""}`).join(" ")}`;
  const out2 = [];
  if (/self[- ]?host|privac|gdpr|own (your|the) data|no account/i.test(hay)) {
    out2.push("Privacy by default \u2014 the UI never surfaces or transmits data the user did not choose to share.");
  }
  if (/fast|speed|sub-?second|latenc|instant|under \d/i.test(hay)) {
    out2.push("Perceived performance first \u2014 optimistic UI, skeletons over spinners, immediate feedback on every action.");
  }
  out2.push("Accessible to everyone \u2014 every flow works with the keyboard and assistive technology, by construction.");
  out2.push("Consistency over novelty \u2014 reuse tokens and components before inventing new ones.");
  out2.push("Progressive disclosure \u2014 show the essential first; reveal complexity only on demand.");
  out2.push("Clear over clever \u2014 plain language, obvious affordances, honest empty and error states.");
  return out2.slice(0, 5);
}
function seedTokens(brief) {
  const brand = brief.design?.brandConstraints?.trim();
  const byCategory = {
    color: [
      { category: "color", name: "color.bg", value: "#ffffff", note: brand ? `Adjust to brand: ${brand}` : "Primary surface" },
      { category: "color", name: "color.fg", value: "#111827", note: "Primary text" },
      { category: "color", name: "color.primary", value: "#2563eb", note: "Primary action / brand accent" },
      { category: "color", name: "color.danger", value: "#dc2626", note: "Destructive / error" },
      { category: "color", name: "color.muted", value: "#6b7280", note: "Secondary text / borders" }
    ],
    typography: [
      { category: "typography", name: "font.sans", value: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
      { category: "typography", name: "font.mono", value: "ui-monospace, SFMono-Regular, Menlo, monospace" },
      { category: "typography", name: "scale.body", value: "16px / 1.5" },
      { category: "typography", name: "scale.h1", value: "32px / 1.25" },
      { category: "typography", name: "scale.small", value: "13px / 1.4" }
    ],
    spacing: [
      { category: "spacing", name: "space.1", value: "4px" },
      { category: "spacing", name: "space.2", value: "8px" },
      { category: "spacing", name: "space.3", value: "12px" },
      { category: "spacing", name: "space.4", value: "16px" },
      { category: "spacing", name: "space.6", value: "24px" },
      { category: "spacing", name: "space.8", value: "32px" }
    ],
    radius: [
      { category: "radius", name: "radius.sm", value: "4px" },
      { category: "radius", name: "radius.md", value: "8px" },
      { category: "radius", name: "radius.lg", value: "12px" }
    ],
    elevation: [
      { category: "elevation", name: "shadow.sm", value: "0 1px 2px rgba(0,0,0,0.06)" },
      { category: "elevation", name: "shadow.md", value: "0 4px 12px rgba(0,0,0,0.10)" }
    ],
    motion: [
      { category: "motion", name: "motion.fast", value: "120ms ease-out" },
      { category: "motion", name: "motion.base", value: "200ms ease-out" }
    ]
  };
  return DESIGN_TOKEN_CATEGORIES.flatMap((c2) => byCategory[c2]);
}
var COMPONENT_DEFS = [
  { name: "App Shell & Navigation", purpose: "Overall layout, navigation and routing chrome that frames every screen.", re: /.*/ },
  { name: "Button & Actions", purpose: "Primary, secondary and destructive action controls with loading/disabled states.", re: /.*/ },
  {
    name: "Form & Input",
    purpose: "Labelled inputs with inline validation and accessible error messaging.",
    re: /save|add|create|edit|import|tag|organi[sz]e|login|sign|submit|upload|compose|write|configure|invite/i
  },
  {
    name: "List & Collection",
    purpose: "Paginated/virtualised lists of saved items with selection and bulk actions.",
    re: /list|search|browse|organi[sz]e|tag|feed|library|archive|history|result|collection|inbox/i
  },
  { name: "Detail View", purpose: "The focused reading/detail surface for a single item.", re: /read|view|open|detail|article|item|show|preview|document/i },
  { name: "Search & Filter", purpose: "Query input, filters and ranked results with empty/no-match handling.", re: /search|filter|find|query|sort|facet/i },
  { name: "Feedback & Notifications", purpose: "Toasts, banners and inline status for success, error and async progress.", re: /.*/ },
  { name: "Empty & Error States", purpose: "First-run, no-data and failure states that teach the next action.", re: /.*/ }
];
function buildComponents(functional) {
  const out2 = [];
  for (const def of COMPONENT_DEFS) {
    const relatedFRs = functional.filter((fr) => def.re.test(`${fr.title} ${fr.description}`)).map((fr) => fr.id);
    if (relatedFRs.length === 0) continue;
    out2.push({ name: def.name, purpose: def.purpose, states: [...COMPONENT_STATES], relatedFRs, evidence: [] });
  }
  return out2;
}
function buildScreens(functional) {
  const inScope = functional.filter((fr) => fr.priority !== "could");
  const mustIds = functional.filter((fr) => fr.priority === "must").map((fr) => fr.id);
  const screens = [
    { name: "Home / Dashboard", purpose: "The landing surface after sign-in; entry point to the primary tasks.", relatedFRs: mustIds }
  ];
  for (const fr of inScope) {
    screens.push({ name: `${fr.title}`, purpose: `Where a user can ${lowerFirst(fr.title)}.`, relatedFRs: [fr.id] });
  }
  screens.push({ name: "Settings & Account", purpose: "Preferences, data export/delete and account management.", relatedFRs: [] });
  return screens;
}
function buildFlows(functional) {
  const must = functional.filter((fr) => fr.priority === "must");
  const flows = [
    {
      name: "First-run onboarding",
      steps: ["Arrive at an empty, explanatory first-run state", "Complete the minimal setup", "Reach the dashboard ready to act"],
      frIds: must.map((fr) => fr.id)
    }
  ];
  for (const fr of must) {
    flows.push({
      name: `${fr.title} \u2014 happy path`,
      steps: ["Navigate to the relevant screen", `Perform: ${lowerFirst(fr.title)}`, "Receive clear confirmation of the outcome"],
      frIds: [fr.id]
    });
  }
  return flows;
}
function a11yRequirements() {
  const defs = [
    {
      statement: "Every interactive control is fully keyboard operable.",
      given: "a user navigates with the keyboard only",
      when: "they tab through any flow",
      then: "every interactive control is reachable, operable and follows a logical focus order"
    },
    {
      statement: "Focus is always visible.",
      given: "an element receives keyboard focus",
      when: "the user is navigating",
      then: "a visible focus indicator is shown and meets the non-text contrast minimum"
    },
    {
      statement: "Colour contrast meets the target standard.",
      given: "any text or essential UI element",
      when: "it is rendered in any supported theme",
      then: "contrast meets the target (\u2265 4.5:1 for body text, \u2265 3:1 for large text and UI)"
    },
    {
      statement: "Every control and image exposes an accessible name.",
      given: "a form control, icon-only button or meaningful image",
      when: "it is read by assistive technology",
      then: "it exposes a programmatic label/name and images carry meaningful alt text (decorative images are hidden)"
    },
    {
      statement: "Structure and async changes are conveyed semantically.",
      given: "a screen is parsed by a screen reader",
      when: "the user explores it",
      then: "headings, landmarks and roles convey the structure and live regions announce asynchronous changes"
    },
    {
      statement: "Reduced motion and zoom are respected.",
      given: "a user prefers reduced motion or zooms to 200%",
      when: "they use the product",
      then: "non-essential motion is reduced or disabled and content reflows without loss of content or function"
    }
  ];
  return defs.map((d, i2) => ({
    id: `A11Y-${pad3(i2 + 1)}`,
    statement: d.statement,
    acceptance: [{ given: d.given, when: d.when, then: d.then }]
  }));
}
function buildContentVoice(brief) {
  const tone = brief.design?.tone?.trim();
  return [
    tone ? `Voice & tone: ${tone}.` : "Voice & tone: clear, concise and human \u2014 plain language over jargon.",
    "Label actions with the outcome the user gets, not the system operation behind it.",
    "Error messages state what happened, why, and the next step \u2014 never blame the user.",
    "Empty states teach the first useful action; success states confirm exactly what changed."
  ];
}
function buildDesignSystem(brief, functional) {
  return {
    principles: buildPrinciples(brief),
    tokens: seedTokens(brief),
    components: buildComponents(functional),
    screens: buildScreens(functional),
    flows: buildFlows(functional),
    accessibility: { standard: deriveA11yStandard(brief), requirements: a11yRequirements() },
    contentVoice: buildContentVoice(brief)
  };
}
function concreteOutcome(title, notes) {
  const n = (notes ?? "").trim();
  const q = /\b(?:within|at least|at most|no more than|up to|under)\s+\d[^.;,]{0,60}/i.exec(n);
  const m = /\b(?:never|always|so that|so it|must|should|guarantee[sd]?|ensure[sd]?|without)\b\s+([^.;,]{4,})/i.exec(n);
  if (m?.[1]) {
    const clause = m[1].split(/[;,]/)[0].trim().replace(/\s+/g, " ");
    if (clause.length > 3 && (/\d/.test(clause) || !q)) return `the action succeeds and ${lowerFirst(clause)}`;
  }
  const t = /\bin under [^.;,]+/i.exec(n);
  if (t) return `the action completes ${t[0].trim().replace(/\s+/g, " ")}`;
  if (q) return `the outcome honours the stated bound: ${q[0].trim().replace(/\s+/g, " ").toLowerCase()}`;
  return `the result of "${title.toLowerCase()}" is persisted and visible to the user`;
}
function failurePath(title, integration) {
  if (integration) {
    return {
      given: `the external service required by "${title.toLowerCase()}" is unreachable or rejects the request`,
      when: `a user performs the action`,
      then: `the system surfaces a clear, specific error and makes no partial or inconsistent change`
    };
  }
  return {
    given: `a user submits invalid or missing input for "${title.toLowerCase()}"`,
    when: `the action is submitted`,
    then: `the system rejects it with a clear, actionable error and no side effects`
  };
}
function specialiseMetric(cat, base, ctx) {
  const c2 = cat.toLowerCase();
  if ((c2 === "performance" || c2 === "usability") && ctx.timeGoal) {
    return `${base} Honour the product goal: ${ctx.timeGoal}.`;
  }
  if ((c2 === "privacy" || c2 === "security") && ctx.compliance.length) {
    return `${base} Comply with: ${ctx.compliance.join(", ")}.`;
  }
  if (c2 === "cost" && ctx.budget) {
    return `${base} Stay within the stated budget: ${ctx.budget}.`;
  }
  return base;
}
function specialiseStatement(cat, base, ctx) {
  const c2 = cat.toLowerCase();
  if ((c2 === "privacy" || c2 === "security") && ctx.selfHost) {
    return `${base} No personal data leaves the self-hosted instance unless the host configures it.`;
  }
  return base;
}
function buildMilestones(functional, _brief, evidence, evById) {
  const groups = [
    { key: "must", title: "M1 \u2014 Walking skeleton (must-haves)", outcome: "A usable end-to-end slice covering every must-have requirement." },
    { key: "should", title: "M2 \u2014 Rounded product (should-haves)", outcome: "The product is complete enough for real users." },
    { key: "could", title: "M3 \u2014 Enhancements (could-haves)", outcome: "Nice-to-have capabilities that differentiate the product." }
  ];
  const priorPitfalls = evidence.filter((e) => e.source === "issue" || e.source === "pr");
  const out2 = [];
  for (const g of groups) {
    const frs = functional.filter((f) => f.priority === g.key);
    if (frs.length === 0) continue;
    const risks = [];
    const text = frs.map((f) => `${f.title} ${f.description}`).join(" ");
    const matched = matchEvidence(text, priorPitfalls, 2);
    for (const id of matched) {
      const e = evById.get(id);
      if (e) risks.push(`Prior art shows a related pitfall: ${firstSentence(e.title)} [${id}]`);
    }
    out2.push({ title: g.title, outcome: g.outcome, frIds: frs.map((f) => f.id), risks });
  }
  if (out2.length === 0) out2.push({ title: "M1 \u2014 Initial build", outcome: "Deliver the first usable version.", frIds: functional.map((f) => f.id), risks: [] });
  return out2;
}
function deriveAssumptions(brief) {
  const a = [];
  if (brief.constraints.team) a.push(`The team is: ${brief.constraints.team}.`);
  if (brief.constraints.timeline) a.push(`The timeline is: ${brief.constraints.timeline}.`);
  if (brief.constraints.budget) a.push(`The budget is: ${brief.constraints.budget}.`);
  if (brief.constraints.compliance?.length) a.push(`Compliance applies: ${brief.constraints.compliance.join(", ")}.`);
  if (a.length === 0) a.push("No hard constraints were captured; revisit budget, timeline and team before committing.");
  return a;
}
function contextProse(name2, brief) {
  const actors = brief.product.users?.length ? brief.product.users : ["users"];
  const boundaries = detectBoundaries(brief).map((b) => b.label);
  const stack = brief.candidateTech.length ? ` Built on ${brief.candidateTech.join(", ")}.` : "";
  const ext = boundaries.length ? ` It integrates with: ${boundaries.join("; ")}.` : "";
  return `"${name2}" serves ${actors.join(", ")}.${stack}${ext} Each integration boundary is owned by an ADR and detailed in INTERFACES.md during authoring.`;
}
function noteFrom(ids, evById) {
  for (const id of ids) {
    const e = evById.get(id);
    const s = e ? firstSentence(e.snippet) : "";
    if (s) return s;
  }
  return void 0;
}
function firstSentence(s) {
  const clean = s.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const m = /^(.{1,200}?[.!?])(\s|$)/.exec(clean);
  return (m ? m[1] : clean.slice(0, 160)).trim();
}
function timeTokenFromGoals(goals) {
  for (const g of goals) {
    const m = /\b(?:in |under |within )?(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?)\b/i.exec(g);
    if (m) return `complete the primary task in under ${m[1]} ${m[2].toLowerCase()}`;
  }
  return void 0;
}
function briefText(brief) {
  return `${brief.idea} ${brief.product.problem ?? ""} ${brief.featureWishlist.map((f) => `${f.title} ${f.notes ?? ""}`).join(" ")}`;
}
function citationsIn(s) {
  const out2 = [];
  const re = /\[(E\d+)\]/g;
  let m;
  while (m = re.exec(s)) out2.push(m[1]);
  return out2;
}
function titleFromIdea(idea) {
  const first = idea.split(/[.,;:]/)[0]?.trim() || idea.trim();
  return first.length > 40 ? first.slice(0, 40).trim() : first || "The Product";
}
function lowerFirst(s) {
  const t = s.trim();
  return t ? t[0].toLowerCase() + t.slice(1) : t;
}
function evNum(id) {
  const m = /^E(\d+)$/.exec(id);
  return m ? Number(m[1]) : 1e9;
}

// src/plan.ts
import { existsSync as existsSync6, readFileSync as readFileSync4, writeFileSync as writeFileSync5 } from "fs";
import { join as join11 } from "path";
function buildPlanPath(runDir) {
  return join11(runDir, "BUILD-PLAN.json");
}
function milestoneLabel(title) {
  return title.split("\u2014")[0].trim() || title.trim();
}
function pad32(n) {
  return String(n).padStart(3, "0");
}
function derivePlan(srd) {
  const frById = new Map(srd.functional.map((f) => [f.id, f]));
  const ordered = [];
  const seen = /* @__PURE__ */ new Set();
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
  const tasks = [
    {
      id: "T-000",
      title: "Project skeleton \u2014 repo layout, test harness, CI",
      milestone: ordered[0]?.milestone ?? "M1",
      frIds: [],
      acceptance: [],
      dependsOn: [],
      artifacts: [],
      tests: [],
      verify: { commands: [] },
      status: "todo"
    }
  ];
  ordered.forEach(({ frId, milestone }, i2) => {
    const fr = frById.get(frId);
    const dependsOn = ["T-000"];
    if (fr.entities.length) {
      for (let j = 0; j < i2; j++) {
        const prev = ordered[j];
        if (prev.milestone === milestone) continue;
        const prevFr = frById.get(prev.frId);
        if (prevFr.entities.some((e) => fr.entities.includes(e))) {
          dependsOn.push(`T-${pad32(j + 1)}`);
          break;
        }
      }
    }
    tasks.push({
      id: `T-${pad32(i2 + 1)}`,
      title: `${fr.id} \u2014 ${fr.title}`,
      milestone,
      ...fr.module ? { module: fr.module } : {},
      frIds: [fr.id],
      acceptance: fr.acceptance.map((_, idx) => ({ frId: fr.id, index: idx })),
      dependsOn,
      artifacts: [],
      tests: [],
      verify: { commands: [] },
      status: "todo"
    });
  });
  if (srd.design) {
    tasks.push({
      id: `T-${pad32(ordered.length + 1)}`,
      title: "Design foundation \u2014 design tokens, base components, accessibility baseline",
      milestone: ordered[0]?.milestone ?? "M1",
      frIds: [],
      acceptance: [],
      dependsOn: ["T-000"],
      artifacts: [],
      tests: [],
      verify: { commands: [] },
      status: "todo"
    });
  }
  return {
    schemaVersion: BUILD_PLAN_SCHEMA_VERSION,
    product: srd.product.name,
    generatedAt: srd.generatedAt,
    conventions: { frTagPattern: "FR-\\d{3}", testCommand: null, appDir: null },
    tasks
  };
}
var STATUSES2 = ["todo", "in-progress", "done"];
function taskKey(t) {
  return t.frIds.length ? `fr:${t.title.replace(/^FR-\d+\s*—\s*/, "").trim().toLowerCase()}` : `title:${t.title.trim().toLowerCase()}`;
}
function mergePlan(prev, next) {
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
      status: STATUSES2.includes(old.status) ? old.status : t.status
    };
  });
  return {
    ...next,
    conventions: {
      frTagPattern: next.conventions.frTagPattern,
      testCommand: prev.conventions?.testCommand ?? null,
      appDir: prev.conventions?.appDir ?? null
    },
    tasks
  };
}
function readyFrontier(plan) {
  const done = new Set(plan.tasks.filter((t) => t.status === "done").map((t) => t.id));
  const tasks = plan.tasks.map((t) => ({
    id: t.id,
    milestone: t.milestone,
    status: t.status,
    dependsOn: t.dependsOn,
    ready: t.status !== "done" && t.dependsOn.every((d) => done.has(d))
  }));
  return {
    product: plan.product,
    done: done.size,
    total: plan.tasks.length,
    tasks,
    frontier: tasks.filter((t) => t.ready).map((t) => t.id),
    blocked: tasks.filter((t) => t.status !== "done" && !t.ready).map((t) => ({ id: t.id, waitingOn: t.dependsOn.filter((d) => !done.has(d)) }))
  };
}
function loadPlan(runDir) {
  const path = buildPlanPath(runDir);
  if (!existsSync6(path)) return null;
  try {
    const data = JSON.parse(readFileSync4(path, "utf8"));
    return data && typeof data === "object" && Array.isArray(data.tasks) ? data : null;
  } catch {
    return null;
  }
}
function writePlan(runDir, plan) {
  const path = buildPlanPath(runDir);
  writeFileSync5(path, JSON.stringify(plan, null, 2) + "\n");
  return path;
}

// src/render.ts
function writeFile(out2, rel, content, files) {
  const abs = join12(out2, rel);
  mkdirSync6(dirname3(abs), { recursive: true });
  writeFileSync6(abs, content.endsWith("\n") ? content : content + "\n");
  files.push(rel);
}
function renderSRD(brief, evidence, opts) {
  const wantDesign = opts.level === "complex" && !opts.noDesign;
  const srd = buildSRD(brief, evidence, { level: opts.level, generatedAt: opts.generatedAt, design: wantDesign });
  return emitSRD(srd, { out: opts.out, merge: opts.merge, prd: opts.prd, noPrd: opts.noPrd });
}
function renderFromSRD(runDir, opts) {
  const manifest = srdManifestPath(runDir);
  if (!existsSync7(manifest)) {
    throw new Error(`No SRD.json in ${runDir} \u2014 render the SRD first (construct render), then edit it and re-run with --from-srd.`);
  }
  let srd;
  try {
    srd = JSON.parse(readFileSync5(manifest, "utf8"));
  } catch (e) {
    throw new Error(`SRD.json is unreadable: ${e.message}`);
  }
  if (!Array.isArray(srd.functional) || !Array.isArray(srd.nonFunctional) || !srd.architecture || !Array.isArray(srd.architecture.adrs)) {
    throw new Error(`SRD.json in ${runDir} is not a valid SRD manifest (missing functional/nonFunctional/architecture).`);
  }
  return emitSRD(srd, { out: runDir, merge: opts.merge, prd: opts.prd, noPrd: opts.noPrd });
}
function syncTraceability(srd) {
  const priorAdrs = new Map((srd.traceability ?? []).map((r) => [r.fr, r.adrs]));
  const fallbackAdrs = srd.architecture.adrs.length ? [srd.architecture.adrs[0].id] : [];
  const design = srd.design;
  srd.traceability = srd.functional.map((fr) => {
    const row = {
      fr: fr.id,
      nfrs: fr.nfrs,
      adrs: priorAdrs.get(fr.id) ?? fallbackAdrs,
      entities: fr.entities,
      interfaces: fr.interfaces
    };
    if (design) {
      row.components = design.components.filter((c2) => c2.relatedFRs.includes(fr.id)).map((c2) => c2.name);
      row.screens = design.screens.filter((s) => s.relatedFRs.includes(fr.id)).map((s) => s.name);
    }
    if (fr.module) row.module = fr.module;
    return row;
  });
}
function emitSRD(srd, opts) {
  const files = [];
  const out2 = opts.out;
  if (!opts.prd && !opts.noPrd && existsSync7(join12(out2, "requirements", "prd"))) {
    throw new Error("requirements/prd exists from a previous --prd render \u2014 re-run with --prd to regenerate it, or --no-prd to delete it deliberately.");
  }
  syncTraceability(srd);
  rmSync2(join12(out2, "architecture", "decisions"), { recursive: true, force: true });
  rmSync2(join12(out2, "design"), { recursive: true, force: true });
  rmSync2(join12(out2, "prd"), { recursive: true, force: true });
  writeFile(out2, "00-overview/VISION.md", renderVision(srd), files);
  writeFile(out2, "00-overview/SCOPE.md", renderScope(srd), files);
  writeFile(out2, "requirements/FUNCTIONAL.md", renderFunctional(srd), files);
  rmSync2(join12(out2, "requirements", "prd"), { recursive: true, force: true });
  if (opts.prd) {
    for (const fr of srd.functional) {
      writeFile(out2, `requirements/prd/PRD-${fr.id}-${slugTitle(fr.title)}.md`, renderFeaturePRD(fr, srd), files);
    }
    writeFile(out2, "requirements/prd/README.md", renderPRDIndex(srd), files);
  }
  writeFile(out2, "requirements/NON-FUNCTIONAL.md", renderNonFunctional(srd), files);
  writeFile(out2, "architecture/SYSTEM-CONTEXT.md", renderSystemContext(srd), files);
  writeFile(out2, "architecture/DATA-MODEL.md", renderDataModel(srd), files);
  writeFile(out2, "architecture/INTERFACES.md", renderInterfaces(srd), files);
  for (const adr of srd.architecture.adrs) {
    writeFile(out2, `architecture/decisions/${adr.id}-${slugTitle(adr.title)}.md`, renderADR(adr), files);
  }
  writeFile(out2, "competitive/LANDSCAPE.md", renderLandscape(srd), files);
  writeFile(out2, "BUILD-PLAN.md", renderBuildPlan(srd), files);
  writePlan(out2, mergePlan(loadPlan(out2), derivePlan(srd)));
  files.push("BUILD-PLAN.json");
  writeFile(out2, "TRACEABILITY.md", renderTraceability(srd), files);
  if (srd.modules?.length) {
    for (const m of srd.modules) {
      writeFile(out2, `prd/${m.id}/PRD.md`, renderModulePRD(srd, m), files);
    }
    writeFile(out2, "prd/README.md", renderModulePrdIndex(srd), files);
  }
  if (srd.design) {
    writeFile(out2, "design/PRINCIPLES.md", renderDesignPrinciples(srd.design), files);
    writeFile(out2, "design/DESIGN-TOKENS.md", renderDesignTokens(srd.design), files);
    writeFile(out2, "design/design-tokens.json", renderDesignTokensJson(srd.design), files);
    writeFile(out2, "design/COMPONENTS.md", renderComponents(srd.design), files);
    writeFile(out2, "design/SCREENS.md", renderScreens(srd.design), files);
    writeFile(out2, "design/ACCESSIBILITY.md", renderAccessibility(srd.design), files);
  }
  writeFileSync6(srdManifestPath(out2), JSON.stringify(srd, null, 2) + "\n");
  files.push("SRD.json");
  if (opts.merge) {
    writeFile(out2, "SRD.md", renderMergeBundle(srd), files);
  } else {
    rmSync2(join12(out2, "SRD.md"), { force: true });
  }
  return { dir: out2, files, srd };
}

// src/check.ts
import { existsSync as existsSync9, readFileSync as readFileSync7, readdirSync as readdirSync3, statSync as statSync3 } from "fs";
import { join as join14, relative, sep as sep2 } from "path";

// src/review.ts
import { existsSync as existsSync8, readFileSync as readFileSync6, writeFileSync as writeFileSync7 } from "fs";
import { join as join13 } from "path";
var VALID_VERDICTS = ["supported", "partial", "refuted", "unsupported"];
function loadEvidence(path) {
  if (!existsSync8(path)) return [];
  try {
    const data = JSON.parse(readFileSync6(path, "utf8"));
    return Array.isArray(data) ? data.filter(
      (e) => !!e && typeof e === "object" && typeof e.id === "string" && typeof e.source === "string"
    ) : [];
  } catch {
    return [];
  }
}
function srdClaims(srd) {
  const out2 = [];
  for (const f of srd.functional) {
    const ac = f.acceptance.map((a) => `${a.given} / ${a.when} / ${a.then}`).join("; ");
    out2.push({ id: f.id, kind: "FR", text: `${f.title}: ${f.description}${ac ? " \u2014 " + ac : ""}`, ev: f.rationaleEvidence });
  }
  for (const n of srd.nonFunctional) {
    out2.push({ id: n.id, kind: "NFR", text: `${n.category}: ${n.statement}${n.metric ? ` (${n.metric})` : ""}`, ev: n.rationaleEvidence });
  }
  for (const a of srd.architecture.adrs) {
    out2.push({ id: `ADR-${a.id}`, kind: "ADR", text: `${a.title}: ${a.decision}`, ev: a.evidence });
  }
  srd.competitive.competitors.forEach((c2, i2) => out2.push({ id: `COMP-${i2 + 1}`, kind: "competitor", text: `${c2.name}: ${c2.note}`, ev: c2.evidence }));
  srd.competitive.oss.forEach((o, i2) => out2.push({ id: `OSS-${i2 + 1}`, kind: "oss", text: `${o.name}: ${o.note}`, ev: o.evidence }));
  return out2;
}
function claimDigest(snippet, claim, cap = 600) {
  if (snippet.length <= cap) return snippet;
  const kws = keywords(claim).map((k) => k.toLowerCase());
  if (!kws.length) return snippet.slice(0, cap);
  const step = 150;
  let best = 0;
  let bestCov = -1;
  for (let start2 = 0; start2 === 0 || start2 + cap / 2 < snippet.length; start2 += step) {
    const w = snippet.slice(start2, start2 + cap).toLowerCase();
    let cov = 0;
    for (const kw of kws) if (w.includes(kw)) cov++;
    if (cov >= bestCov) {
      bestCov = cov;
      best = start2;
    }
  }
  return (best > 0 ? "\u2026 " : "") + snippet.slice(best, best + cap).trim();
}
function runReview(runDir, opts = {}) {
  const manifest = srdManifestPath(runDir);
  if (!existsSync8(manifest)) throw new Error(`No SRD.json in ${runDir} \u2014 render the SRD first (construct render).`);
  let srd;
  try {
    srd = JSON.parse(readFileSync6(manifest, "utf8"));
  } catch (e) {
    throw new Error(`SRD.json is unreadable: ${e.message}`);
  }
  const evidence = loadEvidence(join13(runDir, "evidence", "evidence.json"));
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const pairs = [];
  for (const c2 of srdClaims(srd)) {
    for (const id of [...new Set(c2.ev)]) {
      const e = byId.get(id);
      if (!e) continue;
      const digest = claimDigest(e.snippet || e.title || e.ref, c2.text);
      pairs.push({
        claimId: c2.id,
        kind: c2.kind,
        claim: c2.text.trim().slice(0, 400),
        evidenceId: id,
        source: e.source,
        // A low-signal snippet (no keyword-matched excerpt — likely boilerplate)
        // is flagged so the judge adjudicates it skeptically instead of granting
        // "supported" on the URL alone.
        digest: e.meta?.lowSignal ? `[low-signal snippet \u2014 no keyword-matched excerpt; adjudicate skeptically] ${digest}` : digest,
        score: e.score
      });
    }
  }
  const max = opts.maxReview === void 0 ? Number.POSITIVE_INFINITY : Math.max(1, Math.floor(opts.maxReview));
  const sorted = pairs.length > max ? pairs.slice().sort((a, b) => b.score - a.score || a.claimId.localeCompare(b.claimId) || a.evidenceId.localeCompare(b.evidenceId)) : pairs;
  const kept = sorted.slice(0, Math.min(sorted.length, max));
  const dropped = sorted.slice(kept.length);
  const worklist = { run: runDir, pairs: kept.map(({ score, ...rest }) => rest) };
  const todo = {
    run: runDir,
    pairs: worklist.pairs.map((p) => ({ ...p, verdict: null, note: "" }))
  };
  writeFileSync7(join13(runDir, "VERIFY.todo.json"), JSON.stringify(todo, null, 2));
  writeFileSync7(join13(runDir, "VERIFY.md"), renderWorklistMd(worklist, pairs.length, dropped));
  return worklist;
}
function renderWorklistMd(wl, total, dropped) {
  const out2 = [];
  out2.push(`# Claim-support review worklist`);
  out2.push("");
  out2.push(
    `For each pair, open the cited evidence and judge whether it **supports** the claim. In \`VERIFY.todo.json\`, set each \`verdict\` to one of supported \xB7 partial \xB7 refuted \xB7 unsupported, add a short \`note\`, save it (e.g. as \`verdicts.json\`), then run \`construct review --apply verdicts.json --out <run>\`.`
  );
  if (dropped.length) {
    out2.push("");
    out2.push(`> **DROPPED (--max-review): ${dropped.length} of ${total} pair(s) are NOT in this worklist and will NOT be adjudicated.**`);
    out2.push(`> Their claims can pass \`check --semantic\` without their evidence ever being judged.`);
    out2.push(`> Re-run \`construct review\` without --max-review to review everything. Dropped:`);
    for (const d of dropped) out2.push(`> - ${d.claimId} \xB7 ${d.evidenceId} (${d.source})`);
  }
  out2.push("");
  for (const p of wl.pairs) {
    out2.push(`## ${p.claimId} \xB7 ${p.evidenceId} (${p.source})`);
    out2.push(`**Claim (${p.kind}):** ${p.claim}`);
    out2.push(`**Cited evidence:** ${p.digest}`);
    out2.push(`**Verdict:** _____ \xB7 **Note:** _____`);
    out2.push("");
  }
  return out2.join("\n");
}
function applyVerdicts(runDir, verdictsPath) {
  if (!existsSync8(verdictsPath)) throw new Error(`verdicts file not found: ${verdictsPath}`);
  let raw;
  try {
    raw = JSON.parse(readFileSync6(verdictsPath, "utf8"));
  } catch (e) {
    throw new Error(`verdicts file is not valid JSON (${verdictsPath}): ${e.message}`);
  }
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray(raw.pairs) ? raw.pairs : null;
  if (list === null) {
    throw new Error(`verdicts file must be a JSON array of verdicts or an object with a "pairs" array (${verdictsPath}).`);
  }
  const verdicts = [];
  const seen = /* @__PURE__ */ new Set();
  const key = (claimId, evidenceId) => `${claimId}::${evidenceId}`;
  for (const v of list) {
    if (!v || typeof v.claimId !== "string" || typeof v.evidenceId !== "string") continue;
    const verdict = VALID_VERDICTS.includes(v.verdict) ? v.verdict : void 0;
    verdicts.push({
      claimId: v.claimId,
      kind: v.kind,
      claim: typeof v.claim === "string" ? v.claim : "",
      evidenceId: v.evidenceId,
      source: v.source,
      digest: typeof v.digest === "string" ? v.digest : "",
      verdict,
      note: typeof v.note === "string" ? v.note : ""
    });
    seen.add(key(v.claimId, v.evidenceId));
  }
  const todoPath = join13(runDir, "VERIFY.todo.json");
  if (existsSync8(todoPath)) {
    try {
      const todo = JSON.parse(readFileSync6(todoPath, "utf8"));
      for (const p of todo.pairs ?? []) {
        if (!p || typeof p.claimId !== "string" || typeof p.evidenceId !== "string") continue;
        if (seen.has(key(p.claimId, p.evidenceId))) continue;
        verdicts.push({
          claimId: p.claimId,
          kind: p.kind,
          claim: p.claim ?? "",
          evidenceId: p.evidenceId,
          source: p.source,
          digest: p.digest ?? "",
          verdict: void 0,
          note: ""
        });
        seen.add(key(p.claimId, p.evidenceId));
      }
    } catch {
    }
  }
  const result = reduceVerdicts(verdicts);
  writeFileSync7(join13(runDir, "VERIFY.json"), JSON.stringify({ ...result, verdicts }, null, 2));
  return result;
}
function reduceVerdicts(verdicts) {
  const counts = { supported: 0, partial: 0, refuted: 0, unsupported: 0 };
  for (const v of verdicts) if (v.verdict && counts[v.verdict] !== void 0) counts[v.verdict]++;
  const byClaim = /* @__PURE__ */ new Map();
  for (const v of verdicts) {
    const group = byClaim.get(v.claimId) ?? [];
    group.push(v);
    byClaim.set(v.claimId, group);
  }
  const failures = [];
  const unadjudicated = [];
  for (const [claimId, group] of byClaim) {
    const adjudicated = group.filter((g) => !!g.verdict);
    if (adjudicated.length < group.length) unadjudicated.push(claimId);
    const refuted = adjudicated.find((g) => g.verdict === "refuted");
    const hasSupport = adjudicated.some((g) => g.verdict === "supported" || g.verdict === "partial");
    if (refuted) {
      failures.push({ claimId, evidenceId: refuted.evidenceId, verdict: "refuted", note: refuted.note });
    } else if (adjudicated.length === group.length && adjudicated.length > 0 && !hasSupport) {
      const u = adjudicated.find((g) => g.verdict === "unsupported") ?? adjudicated[0];
      failures.push({ claimId, evidenceId: u.evidenceId, verdict: u.verdict, note: u.note });
    }
  }
  return {
    ok: failures.length === 0,
    pairs: verdicts.length,
    adjudicated: verdicts.filter((v) => !!v.verdict).length,
    supported: counts.supported,
    partial: counts.partial,
    refuted: counts.refuted,
    unsupported: counts.unsupported,
    failures,
    unadjudicated
  };
}
function formatReviewReport(r) {
  const lines = [];
  lines.push(`construct review: ${r.adjudicated}/${r.pairs} pair(s) adjudicated`);
  lines.push(`  supported: ${r.supported} \xB7 partial: ${r.partial} \xB7 refuted: ${r.refuted} \xB7 unsupported: ${r.unsupported}`);
  for (const f of r.failures.slice(0, 12)) {
    lines.push(`  \u2717 ${f.claimId} (${f.evidenceId}): ${f.verdict}${f.note ? " \u2014 " + f.note : ""}`);
  }
  if (r.unadjudicated.length) {
    lines.push(`  \u26A0 ${r.unadjudicated.length} claim(s) not fully adjudicated: ${r.unadjudicated.join(", ")}`);
  }
  lines.push(
    !r.ok ? `  \u2717 some claims are refuted or unsupported` : r.unadjudicated.length ? `  \u2713 no refuted or unsupported claims (${r.unadjudicated.length} still unadjudicated \u2014 see above)` : `  \u2713 every grounded claim is backed by its cited evidence`
  );
  return lines.join("\n");
}

// src/check.ts
var DESIGN_REQUIRED_FILES = [
  "design/PRINCIPLES.md",
  "design/DESIGN-TOKENS.md",
  "design/design-tokens.json",
  "design/COMPONENTS.md",
  "design/SCREENS.md",
  "design/ACCESSIBILITY.md"
];
var REQUIRED_FILES = [
  "00-overview/VISION.md",
  "00-overview/SCOPE.md",
  "requirements/FUNCTIONAL.md",
  "requirements/NON-FUNCTIONAL.md",
  "TRACEABILITY.md",
  "SRD.json"
];
var DECISION_RE = /^> 🧠 \*\*Decide:\*\*/m;
var PLACEHOLDER_RE = /\bTODO\b|\bTBD\b|\bFIXME\b/;
function mdFiles(runDir) {
  const out2 = [];
  const stack = [runDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync3(dir);
    } catch {
      continue;
    }
    for (const name2 of entries) {
      const abs = join14(dir, name2);
      let st;
      try {
        st = statSync3(abs);
      } catch {
        continue;
      }
      const rel = relative(runDir, abs).split(sep2).join("/");
      if (st.isDirectory()) {
        if (rel === "evidence" || name2 === ".construct") continue;
        stack.push(abs);
      } else if (name2.endsWith(".md")) {
        out2.push(rel);
      }
    }
  }
  return out2.sort();
}
function countProposedIdeas(runDir) {
  const p = join14(runDir, "brainstorm.json");
  if (!existsSync9(p)) return 0;
  try {
    const data = JSON.parse(readFileSync7(p, "utf8"));
    return Array.isArray(data.ideas) ? data.ideas.filter((i2) => i2 && i2.status === "proposed").length : 0;
  } catch {
    return 0;
  }
}
function loadEvidence2(runDir) {
  const path = join14(runDir, "evidence", "evidence.json");
  if (!existsSync9(path)) {
    return { evidence: [], note: `No evidence/evidence.json \u2014 grounding coverage is 0 (run \`construct research\` to ground the SRD).` };
  }
  try {
    const data = JSON.parse(readFileSync7(path, "utf8"));
    const evidence = Array.isArray(data) ? data.filter(
      (e) => !!e && typeof e === "object" && typeof e.id === "string" && typeof e.source === "string"
    ) : [];
    return { evidence };
  } catch (e) {
    return { evidence: [], note: `evidence.json unreadable: ${e.message}` };
  }
}
function computeCoverage(srd, evidence) {
  const ids = new Set(evidence.map((e) => e.id));
  const referenced = /* @__PURE__ */ new Set();
  const note = (arr) => arr.forEach((id) => referenced.add(id));
  srd.functional.forEach((f) => note(f.rationaleEvidence));
  srd.nonFunctional.forEach((n) => note(n.rationaleEvidence));
  srd.architecture.adrs.forEach((a) => note(a.evidence));
  srd.competitive.competitors.forEach((c2) => note(c2.evidence));
  srd.competitive.oss.forEach((o) => note(o.evidence));
  srd.buildPlan.forEach(
    (m) => (m.risks ?? []).forEach((r) => {
      const re = /\[(E\d+)\]/g;
      let mm;
      while (mm = re.exec(r)) referenced.add(mm[1]);
    })
  );
  const grounded = (arr) => arr.some((id) => ids.has(id));
  const frGrounded = srd.functional.filter((f) => grounded(f.rationaleEvidence)).length;
  const nfrGrounded = srd.nonFunctional.filter((n) => grounded(n.rationaleEvidence)).length;
  const adrGrounded = srd.architecture.adrs.filter((a) => grounded(a.evidence)).length;
  const citations = [...referenced].sort();
  const dangling = citations.filter((id) => !ids.has(id));
  const resolved = citations.filter((id) => ids.has(id));
  const uncited = evidence.map((e) => e.id).filter((id) => !referenced.has(id));
  return {
    frTotal: srd.functional.length,
    frGrounded,
    nfrTotal: srd.nonFunctional.length,
    nfrGrounded,
    adrTotal: srd.architecture.adrs.length,
    adrGrounded,
    dangling,
    uncited,
    citations,
    resolved
  };
}
var TEMPLATED_THEN_RE = /is persisted and visible to the user$/;
var TEMPLATED_METRIC_RE = /^A measurable target for "/;
function uncoveredPairs(runDir, verdicts) {
  const key = (c2, e) => `${c2}::${e}`;
  const label = /* @__PURE__ */ new Map();
  const adjudicated = /* @__PURE__ */ new Set();
  for (const v of verdicts) {
    if (!v || typeof v.claimId !== "string" || typeof v.evidenceId !== "string") continue;
    const k = key(v.claimId, v.evidenceId);
    label.set(k, `${v.claimId}\xB7${v.evidenceId}`);
    if (v.verdict) adjudicated.add(k);
  }
  const todoPath = join14(runDir, "VERIFY.todo.json");
  if (existsSync9(todoPath)) {
    try {
      const todo = JSON.parse(readFileSync7(todoPath, "utf8"));
      for (const p of todo.pairs ?? []) {
        if (!p || typeof p.claimId !== "string" || typeof p.evidenceId !== "string") continue;
        label.set(key(p.claimId, p.evidenceId), `${p.claimId}\xB7${p.evidenceId}`);
      }
    } catch {
    }
  }
  const missing = [];
  for (const [k, l] of label) if (!adjudicated.has(k)) missing.push(l);
  return missing.sort();
}
function applySemantic(runDir, result, allowUnverified) {
  const p = join14(runDir, "VERIFY.json");
  const skip = (reason, hint) => {
    if (allowUnverified) {
      result.structural.warnings.push(`--semantic: ${reason} \u2014 ${hint}; semantic gate skipped (--allow-unverified).`);
    } else {
      result.semanticError = `${reason} \u2014 ${hint}, or pass --allow-unverified to degrade this to a warning.`;
      result.ok = false;
    }
  };
  if (!existsSync9(p)) {
    skip("no VERIFY.json", "run `construct review` then `review --apply <verdicts.json>` first");
    return;
  }
  let sem;
  try {
    sem = JSON.parse(readFileSync7(p, "utf8"));
  } catch (e) {
    skip(`VERIFY.json is unreadable (${e.message})`, "re-run `review --apply <verdicts.json>` to regenerate it");
    return;
  }
  if (!Array.isArray(sem.verdicts)) {
    skip("VERIFY.json carries no verdicts[] (legacy or hand-edited)", "re-run `review --apply <verdicts.json>` to regenerate it");
    return;
  }
  const uncovered = uncoveredPairs(runDir, sem.verdicts);
  if (uncovered.length && !allowUnverified) {
    const shown = uncovered.slice(0, 5).join(", ");
    const more = uncovered.length > 5 ? ` (+${uncovered.length - 5} more)` : "";
    result.semanticError = `${uncovered.length} review pair(s) lack an adjudicated verdict in VERIFY.json: ${shown}${more} \u2014 a worklist pair was dropped from the ledger or was never judged. Adjudicate every pair and re-run \`construct review --apply <verdicts.json>\`, or pass --allow-unverified to degrade this to a warning.`;
    result.ok = false;
    return;
  }
  const reduced = reduceVerdicts(sem.verdicts);
  if (reduced.ok !== sem.ok) {
    result.structural.warnings.push("VERIFY.json's persisted summary disagreed with its verdicts \u2014 recomputed at check time.");
  }
  result.semantic = { ...reduced, verdicts: sem.verdicts };
  if (!reduced.ok) result.ok = false;
  if (uncovered.length) {
    result.structural.warnings.push(
      `--semantic: ${uncovered.length} review pair(s) lack an adjudicated verdict (a worklist pair was dropped or never judged); coverage gate skipped (--allow-unverified).`
    );
  }
}
function checkDesign(runDir, srd, errors, warnings) {
  const ds = srd.design;
  if (!ds) return;
  for (const f of DESIGN_REQUIRED_FILES) {
    if (!existsSync9(join14(runDir, f))) errors.push(`Missing required design file: ${f} (re-render at --level complex).`);
  }
  const frIds = new Set(srd.functional.map((f) => f.id));
  if (ds.components.length === 0) errors.push("Design system has no components \u2014 a complex SRD's design must name its UI components.");
  for (const c2 of ds.components) {
    for (const id of c2.relatedFRs) if (!frIds.has(id)) errors.push(`Component "${c2.name}" references unknown requirement "${id}".`);
  }
  for (const s of ds.screens) {
    for (const id of s.relatedFRs) if (!frIds.has(id)) errors.push(`Screen "${s.name}" references unknown requirement "${id}".`);
  }
  for (const fl of ds.flows) {
    for (const id of fl.frIds) if (!frIds.has(id)) errors.push(`User flow "${fl.name}" references unknown requirement "${id}".`);
  }
  const tokenCats = new Set(ds.tokens.map((t) => t.category.toLowerCase()));
  for (const cat of DESIGN_TOKEN_CATEGORIES) {
    if (!tokenCats.has(cat)) errors.push(`Design tokens are missing the required category: ${cat}.`);
  }
  if (!ds.accessibility.standard.trim()) errors.push("Design system has no accessibility target standard.");
  if (ds.accessibility.requirements.length === 0) errors.push("Design system has no accessibility requirements.");
  for (const r of ds.accessibility.requirements) {
    if (!r.acceptance.length) errors.push(`Accessibility requirement ${r.id} has no acceptance criteria.`);
  }
  const tokenDoc = join14(runDir, "design", "DESIGN-TOKENS.md");
  if (existsSync9(tokenDoc) && readFileSync7(tokenDoc, "utf8").includes(DESIGN_TOKENS_SEEDED_BANNER)) {
    warnings.push("Design tokens are still seeded defaults \u2014 replace them with the product's real brand values (see references/design-system-authoring.md).");
  }
}
function checkModules(runDir, srd, errors, warnings) {
  const mods = srd.modules;
  if (!mods?.length) return;
  const moduleIds = new Set(mods.map((m) => m.id));
  if (!existsSync9(join14(runDir, "prd", "README.md"))) {
    errors.push(`Missing required module-PRD index: prd/README.md (re-render).`);
  }
  for (const m of mods) {
    if (!existsSync9(join14(runDir, "prd", m.id, "PRD.md"))) {
      errors.push(`Missing required module PRD: prd/${m.id}/PRD.md (re-render).`);
    }
    for (const dep of m.dependsOn) {
      if (!moduleIds.has(dep)) errors.push(`module "${m.id}" depends on unknown module "${dep}".`);
    }
    if (!srd.functional.some((f) => f.module === m.id)) {
      warnings.push(`module "${m.id}" has no requirements \u2014 its PRD is empty (assign features or drop the module).`);
    }
  }
  for (const fr of srd.functional) {
    if (!fr.module) errors.push(`${fr.id} has no module \u2014 modules mode is all-or-nothing (assign every feature to a module).`);
    else if (!moduleIds.has(fr.module)) errors.push(`${fr.id} references unknown module "${fr.module}".`);
  }
}
function checkRun(runDir, opts = {}) {
  const errors = [];
  const warnings = [];
  const emptyCoverage = {
    frTotal: 0,
    frGrounded: 0,
    nfrTotal: 0,
    nfrGrounded: 0,
    adrTotal: 0,
    adrGrounded: 0,
    dangling: [],
    uncited: [],
    citations: [],
    resolved: []
  };
  for (const f of REQUIRED_FILES) {
    if (!existsSync9(join14(runDir, f))) errors.push(`Missing required file: ${f} (run \`construct render --out ${runDir}\`).`);
  }
  const manifest = srdManifestPath(runDir);
  if (!existsSync9(manifest)) {
    errors.push(`No SRD.json in ${runDir} \u2014 render the SRD first.`);
    return { ok: false, structural: { ok: false, errors, warnings }, coverage: emptyCoverage };
  }
  let srd;
  try {
    srd = JSON.parse(readFileSync7(manifest, "utf8"));
  } catch (e) {
    errors.push(`SRD.json is unreadable: ${e.message}`);
    return { ok: false, structural: { ok: false, errors, warnings }, coverage: emptyCoverage };
  }
  for (const rel of mdFiles(runDir)) {
    const text = readFileSync7(join14(runDir, rel), "utf8");
    if (DECISION_RE.test(text)) errors.push(`Unresolved decision (\u{1F9E0}) in ${rel} \u2014 resolve it before the SRD is complete.`);
    else if (PLACEHOLDER_RE.test(text)) warnings.push(`Possible leftover placeholder (TODO/TBD/FIXME) in ${rel} \u2014 confirm it is intentional.`);
  }
  if (srd.openQuestions.length) {
    errors.push(`${srd.openQuestions.length} open decision(s) unresolved in the brief \u2014 resolve them (into ADRs/requirements) before the SRD is complete.`);
  }
  const entityNames = new Set(srd.architecture.dataModel.map((e) => e.name));
  const interfaceNames = new Set(srd.architecture.interfaces.map((i2) => i2.name));
  const nfrIds = new Set(srd.nonFunctional.map((n) => n.id));
  for (const fr of srd.functional) {
    if (!fr.acceptance.length) errors.push(`${fr.id} has no acceptance criteria.`);
    for (const e of fr.entities) if (!entityNames.has(e)) errors.push(`${fr.id} references unknown entity "${e}".`);
    for (const i2 of fr.interfaces) if (!interfaceNames.has(i2)) errors.push(`${fr.id} references unknown interface "${i2}".`);
    for (const n of fr.nfrs) if (!nfrIds.has(n)) errors.push(`${fr.id} references unknown NFR "${n}".`);
  }
  if (srd.functional.length === 0) {
    errors.push("No functional requirements \u2014 an SRD must specify at least one. Capture features in the brief (featureWishlist) and re-render.");
  }
  const noTrace = srd.functional.filter((fr) => fr.entities.length === 0 && fr.interfaces.length === 0).length;
  if (noTrace) {
    warnings.push(
      `${noTrace} functional requirement(s) have no data/interface traceability \u2014 fill DATA-MODEL.md / INTERFACES.md and set FR.entities/interfaces.`
    );
  }
  if (srd.level === "complex" && srd.architecture.dataModel.length === 0) {
    warnings.push("Data model is empty \u2014 a complex SRD should name its core entities.");
  }
  const presentCats = new Set(srd.nonFunctional.map((n) => n.category.toLowerCase()));
  for (const cat of REQUIRED_NFR[srd.level]) {
    if (!presentCats.has(cat)) errors.push(`Missing required NFR category for level "${srd.level}": ${cat}.`);
  }
  for (const a of srd.architecture.adrs) {
    if (!a.context.trim() || !a.decision.trim() || !a.consequences.trim()) {
      errors.push(`ADR ${a.id} ("${a.title}") is missing context/decision/consequences.`);
    }
    if (a.status !== "proposed" && a.status !== "accepted") {
      errors.push(`ADR ${a.id} has invalid status "${a.status}".`);
    }
  }
  checkDesign(runDir, srd, errors, warnings);
  checkModules(runDir, srd, errors, warnings);
  const templatedThen = srd.functional.reduce((n, fr) => n + fr.acceptance.filter((a) => TEMPLATED_THEN_RE.test(a.then)).length, 0);
  if (templatedThen) {
    const msg = `${templatedThen} acceptance criteria are still renderer-templated \u2014 sharpen them into observable, bounded outcomes (see references/acceptance-criteria.md).`;
    if (srd.level === "complex") errors.push(msg);
    else warnings.push(msg);
  }
  const templatedMetrics = srd.nonFunctional.filter((n) => n.metric && TEMPLATED_METRIC_RE.test(n.metric)).length;
  if (templatedMetrics) {
    warnings.push(`${templatedMetrics} NFR metric(s) are still generic placeholders \u2014 set measurable targets (see references/acceptance-criteria.md).`);
  }
  const proposedIdeas = countProposedIdeas(runDir);
  if (proposedIdeas > 0) {
    warnings.push(`brainstorm: ${proposedIdeas} idea(s) still 'proposed' \u2014 adjudicate (kept/parked/rejected) and run \`construct brainstorm --merge\`.`);
  }
  const { evidence, note } = loadEvidence2(runDir);
  if (note) warnings.push(note);
  const coverage = computeCoverage(srd, evidence);
  if (coverage.dangling.length) {
    warnings.push(`Grounding: ${coverage.dangling.length} citation(s) do not resolve to evidence.json: ${coverage.dangling.join(", ")}.`);
  }
  const structuralOk = errors.length === 0;
  let grounding;
  if (opts.minGrounding !== void 0) {
    const total = coverage.frTotal + coverage.nfrTotal + coverage.adrTotal;
    const grounded = coverage.frGrounded + coverage.nfrGrounded + coverage.adrGrounded;
    const actualPct = total === 0 ? 0 : Math.round(grounded / total * 100);
    grounding = { threshold: opts.minGrounding, actualPct, ok: actualPct >= opts.minGrounding };
  }
  const ok = structuralOk && (grounding?.ok ?? true);
  const result = { ok, structural: { ok: structuralOk, errors, warnings }, coverage, grounding };
  if (opts.semantic) {
    applySemantic(runDir, result, opts.allowUnverified ?? false);
  } else if (coverage.resolved.length > 0) {
    const citedClaims = coverage.frGrounded + coverage.nfrGrounded + coverage.adrGrounded;
    result.semanticSkipped = { citedClaims, verifyExists: existsSync9(join14(runDir, "VERIFY.json")) };
  }
  return result;
}
function pct(part, total) {
  if (total === 0) return "n/a";
  return `${Math.round(part / total * 100)}%`;
}
function formatCheckReport(r, runDir) {
  const lines = [];
  lines.push(`construct check: ${runDir}`);
  lines.push(``);
  lines.push(`Structural gate (hard):`);
  for (const e of r.structural.errors) lines.push(`  \u2717 ${e}`);
  for (const w of r.structural.warnings) lines.push(`  \u26A0 ${w}`);
  lines.push(r.structural.ok ? `  \u2713 SRD is structurally complete` : `  \u2717 SRD is NOT structurally complete`);
  lines.push(``);
  const c2 = r.coverage;
  const advisory = r.grounding ? "advisory detail" : "advisory \u2014 does not fail the build";
  lines.push(`Grounding coverage (${advisory}):`);
  lines.push(`  functional:     ${c2.frGrounded}/${c2.frTotal} grounded (${pct(c2.frGrounded, c2.frTotal)})`);
  lines.push(`  non-functional: ${c2.nfrGrounded}/${c2.nfrTotal} grounded (${pct(c2.nfrGrounded, c2.nfrTotal)})`);
  lines.push(`  decisions:      ${c2.adrGrounded}/${c2.adrTotal} grounded (${pct(c2.adrGrounded, c2.adrTotal)})`);
  lines.push(`  citations: ${c2.citations.length} \xB7 resolved: ${c2.resolved.length} \xB7 dangling: ${c2.dangling.length} \xB7 uncited evidence: ${c2.uncited.length}`);
  if (r.grounding) {
    const g = r.grounding;
    lines.push(``);
    lines.push(`Grounding gate (opt-in --min-grounding ${g.threshold}):`);
    lines.push(
      g.ok ? `  \u2713 PASS \u2014 ${g.actualPct}% of groundable claims are grounded (threshold ${g.threshold}%)` : `  \u2717 FAIL \u2014 ${g.actualPct}% of groundable claims are grounded, below the ${g.threshold}% threshold`
    );
  }
  if (r.semanticSkipped) {
    const s = r.semanticSkipped;
    lines.push(``);
    lines.push(`Semantic gate: SKIPPED`);
    lines.push(`  \u26A0 ${s.citedClaims} cited claim(s) were never adversarially verified \u2014 a citation`);
    lines.push(
      s.verifyExists ? `    proves nothing until reviewed. A VERIFY.json exists \u2014 re-run with --semantic to gate on it.` : `    proves nothing until reviewed. Run \`construct review --out <run>\`, adjudicate the`
    );
    if (!s.verifyExists) lines.push(`    worklist, then \`construct check --semantic\`.`);
  }
  if (r.semanticError) {
    lines.push(``);
    lines.push(`Semantic claim-support gate (--semantic):`);
    lines.push(`  \u2717 FAIL \u2014 ${r.semanticError}`);
  }
  if (r.semantic) {
    const s = r.semantic;
    lines.push(``);
    lines.push(`Semantic claim-support gate (--semantic):`);
    lines.push(`  supported ${s.supported} \xB7 partial ${s.partial} \xB7 refuted ${s.refuted} \xB7 unsupported ${s.unsupported}`);
    for (const f of s.failures.slice(0, 8)) lines.push(`  \u2717 ${f.claimId} (${f.evidenceId}): ${f.verdict}`);
    lines.push(
      !s.ok ? `  \u2717 FAIL \u2014 a claim is refuted or unsupported by its cited evidence` : s.unadjudicated?.length ? `  \u2713 PASS \u2014 no refuted/unsupported claims (${s.unadjudicated.length} still unadjudicated)` : `  \u2713 PASS \u2014 every cited claim is supported by its evidence`
    );
  }
  return lines.join("\n");
}

// src/analyze.ts
import { existsSync as existsSync10, readFileSync as readFileSync8 } from "fs";
import { join as join15 } from "path";
function loadEvidence3(runDir) {
  const path = join15(runDir, "evidence", "evidence.json");
  if (!existsSync10(path)) return [];
  try {
    const data = JSON.parse(readFileSync8(path, "utf8"));
    return Array.isArray(data) ? data.filter(
      (e) => !!e && typeof e === "object" && typeof e.id === "string" && typeof e.source === "string"
    ) : [];
  } catch {
    return [];
  }
}
function loadMetaNotes(runDir) {
  const path = join15(runDir, "evidence", "meta.json");
  if (!existsSync10(path)) return [];
  try {
    const meta = JSON.parse(readFileSync8(path, "utf8"));
    return Array.isArray(meta.notes) ? meta.notes.filter((n) => typeof n === "string") : [];
  } catch {
    return [];
  }
}
function featureText(f) {
  return `${f.title} ${f.notes ?? ""}`;
}
function analyzeRun(runDir) {
  const brief = loadBrief(runDir);
  const evidence = loadEvidence3(runDir);
  const notes = loadMetaNotes(runDir);
  const shellQuote = (s) => `'${s.replace(/\r\n|[\r\n]/g, " ").replace(/'/g, `'"'"'`)}'`;
  const drill = (cmd, q) => `construct ${cmd} --out ${runDir} --q ${shellQuote(q)}`;
  const bySource = {};
  for (const e of evidence) bySource[e.source] = (bySource[e.source] ?? 0) + 1;
  if (evidence.length === 0) {
    notes.push("No evidence dossier \u2014 run `construct research` first; everything below will render ungrounded.");
  }
  const lowSignal = evidence.filter((e) => e.meta?.lowSignal).length;
  if (lowSignal) {
    notes.push(`${lowSignal} low-signal snippet(s) in the dossier \u2014 likely boilerplate; re-drill with a sharper --q or a better --docs-url.`);
  }
  const suggestions = [];
  const ungroundedFeatures = brief.featureWishlist.filter((f) => matchEvidence(featureText(f), evidence, 1, GROUND_REQUIREMENT).length === 0).map((f) => ({ title: f.title, priority: f.priority ?? "should" }));
  for (const f of ungroundedFeatures) suggestions.push(drill("web", f.title));
  const unmatchedCompetitors = brief.competitors.filter((name2) => matchEvidence(name2, evidence, 1, ["market"]).length === 0);
  for (const name2 of unmatchedCompetitors) suggestions.push(drill("web", name2));
  const unmatchedTech = brief.candidateTech.filter((t) => matchEvidence(t, evidence, 1, ["docs", "so"]).length === 0);
  for (const t of unmatchedTech) suggestions.push(drill("tech", t));
  const unminedSeeds = brief.ossSeeds.filter((seed) => {
    let q = seed;
    try {
      const ref = resolveRepo(seed);
      if (ref.owner && ref.repo) q = `${ref.owner} ${ref.repo}`;
    } catch {
    }
    return matchEvidence(q, evidence, 1, ["oss", "issue", "pr"]).length === 0;
  });
  for (const seed of unminedSeeds) suggestions.push(`construct oss --out ${runDir} --seeds ${seed}`);
  return {
    evidenceCount: evidence.length,
    bySource,
    notes,
    ungroundedFeatures,
    unmatchedCompetitors,
    unmatchedTech,
    unminedSeeds,
    suggestions
  };
}
function formatGapReport(r, runDir) {
  const lines = [];
  lines.push(`construct analyze: ${runDir}`);
  lines.push(``);
  const sources = Object.entries(r.bySource).sort(([a], [b]) => a.localeCompare(b)).map(([s, n]) => `${s}: ${n}`);
  lines.push(`Evidence: ${r.evidenceCount} item(s)${sources.length ? ` (${sources.join(" \xB7 ")})` : ""}`);
  for (const n of r.notes) lines.push(`  \u26A0 ${n}`);
  lines.push(``);
  lines.push(`Gaps (each will render ungrounded as-is):`);
  const gapCount = r.ungroundedFeatures.length + r.unmatchedCompetitors.length + r.unmatchedTech.length + r.unminedSeeds.length;
  for (const f of r.ungroundedFeatures) lines.push(`  \u2717 feature (${f.priority}): "${f.title}" has no matchable evidence`);
  for (const c2 of r.unmatchedCompetitors) lines.push(`  \u2717 competitor: "${c2}" never surfaced in market evidence`);
  for (const t of r.unmatchedTech) lines.push(`  \u2717 tech: "${t}" has no docs/StackOverflow grounding`);
  for (const s of r.unminedSeeds) lines.push(`  \u2717 oss seed: ${s} yielded no mined evidence`);
  if (gapCount === 0) lines.push(`  \u2713 every feature, competitor, tech choice and OSS seed has matchable evidence`);
  if (r.suggestions.length) {
    lines.push(``);
    lines.push(`Suggested drills (then re-run \`construct research\` to fold findings in):`);
    for (const s of r.suggestions) lines.push(`  $ ${s}`);
  }
  return lines.join("\n");
}

// src/verify.ts
import { existsSync as existsSync11, readFileSync as readFileSync9 } from "fs";
import { isAbsolute, join as join16, resolve as resolve3 } from "path";
var TEST_FILE_RE = /\.(test|spec)\.[^./]+$|_(test|spec)\.[^./]+$|(^|\/)test_[^/]+\.[^./]+$/i;
var TEST_SUFFIX_RE = /(^|\/)[^/]*[A-Z]\w*Tests?\.(java|kt|kts|cs|scala|groovy)$/;
var TEST_DIR_RE = /(^|\/)(tests?|__tests__|spec|specs|e2e)\//i;
function isTestFile2(rel) {
  return TEST_FILE_RE.test(rel) || TEST_SUFFIX_RE.test(rel) || TEST_DIR_RE.test(rel);
}
function detectCycle(plan) {
  const byId = new Map(plan.tasks.map((t) => [t.id, t]));
  const state = /* @__PURE__ */ new Map();
  const visit = (id, path) => {
    const s = state.get(id);
    if (s === "done") return null;
    if (s === "visiting") return [...path, id].join(" \u2192 ");
    state.set(id, "visiting");
    for (const dep of byId.get(id)?.dependsOn ?? []) {
      if (!byId.has(dep)) continue;
      const cyc = visit(dep, [...path, id]);
      if (cyc) return cyc;
    }
    state.set(id, "done");
    return null;
  };
  for (const t of plan.tasks) {
    const cyc = visit(t.id, []);
    if (cyc) return cyc;
  }
  return null;
}
function runCommand(command, cwd) {
  const r = process.platform === "win32" ? sh("cmd", ["/c", command], { cwd, timeoutMs: VERIFY_COMMAND_TIMEOUT_MS }) : sh("sh", ["-c", command], { cwd, timeoutMs: VERIFY_COMMAND_TIMEOUT_MS });
  return { command, ok: r.ok, exitCode: r.status };
}
function verifyRun(runDir, opts = {}) {
  const errors = [];
  const warnings = [];
  const frTestCoverage = [];
  const planPath = buildPlanPath(runDir);
  if (!existsSync11(planPath)) {
    errors.push(`No BUILD-PLAN.json in ${runDir} \u2014 render the SRD first (construct render).`);
    return { ok: false, errors, warnings, frTestCoverage };
  }
  const plan = loadPlan(runDir);
  if (!plan) {
    errors.push(`BUILD-PLAN.json is unreadable or malformed.`);
    return { ok: false, errors, warnings, frTestCoverage };
  }
  if (plan.schemaVersion !== BUILD_PLAN_SCHEMA_VERSION) {
    errors.push(`BUILD-PLAN.json schemaVersion ${plan.schemaVersion} is not supported (expected ${BUILD_PLAN_SCHEMA_VERSION}).`);
    return { ok: false, errors, warnings, frTestCoverage };
  }
  const manifest = srdManifestPath(runDir);
  if (!existsSync11(manifest)) {
    errors.push(`No SRD.json in ${runDir} \u2014 the plan cannot be verified against a missing SRD.`);
    return { ok: false, errors, warnings, frTestCoverage };
  }
  let srd;
  try {
    srd = JSON.parse(readFileSync9(manifest, "utf8"));
  } catch (e) {
    errors.push(`SRD.json is unreadable: ${e.message}`);
    return { ok: false, errors, warnings, frTestCoverage };
  }
  const ids = /* @__PURE__ */ new Set();
  for (const t of plan.tasks) {
    if (ids.has(t.id)) errors.push(`Duplicate task id ${t.id}.`);
    ids.add(t.id);
  }
  const frById = new Map(srd.functional.map((f) => [f.id, f]));
  for (const t of plan.tasks) {
    for (const dep of t.dependsOn) {
      if (!ids.has(dep)) errors.push(`${t.id} depends on unknown task "${dep}".`);
    }
    for (const frId of t.frIds) {
      if (!frById.has(frId)) errors.push(`${t.id} references unknown requirement "${frId}".`);
    }
    for (const a of t.acceptance) {
      const fr = frById.get(a.frId);
      if (!fr) errors.push(`${t.id} acceptance ref points at unknown requirement "${a.frId}".`);
      else if (!Number.isInteger(a.index) || a.index < 0 || a.index >= fr.acceptance.length) {
        errors.push(`${t.id} acceptance ref ${a.frId}[${a.index}] is out of range (FR has ${fr.acceptance.length} criteria).`);
      }
    }
  }
  const plannedFrs = new Set(plan.tasks.flatMap((t) => t.frIds));
  for (const f of srd.functional) {
    if (!plannedFrs.has(f.id)) warnings.push(`${f.id} is in the SRD but no build task implements it \u2014 re-render to refresh the plan.`);
  }
  const cycle = detectCycle(plan);
  if (cycle) errors.push(`Task dependency cycle: ${cycle}.`);
  const rawApp = opts.appDir ?? plan.conventions.appDir ?? void 0;
  const appDir = rawApp ? isAbsolute(rawApp) ? rawApp : resolve3(runDir, rawApp) : void 0;
  const doneTasks = plan.tasks.filter((t) => t.status === "done");
  if (!appDir) {
    if (doneTasks.length) {
      errors.push(`${doneTasks.length} task(s) are done but no app directory is declared \u2014 pass --app <dir> or set conventions.appDir.`);
    } else {
      warnings.push(`No app directory declared yet (conventions.appDir / --app) \u2014 file and test checks skipped.`);
    }
    const ok2 = errors.length === 0;
    return { ok: ok2, errors, warnings, frTestCoverage };
  }
  if (!existsSync11(appDir)) {
    errors.push(`App directory does not exist: ${appDir}.`);
    return { ok: false, errors, warnings, frTestCoverage };
  }
  for (const t of doneTasks) {
    for (const rel of [...t.artifacts, ...t.tests]) {
      if (!existsSync11(join16(appDir, rel))) errors.push(`${t.id} is done but its declared file is missing: ${rel}.`);
    }
    if (t.frIds.length && t.tests.length === 0) {
      warnings.push(`${t.id} is done but declares no tests \u2014 record the test files that exercise ${t.frIds.join(", ")}.`);
    }
  }
  let tagRe = null;
  try {
    tagRe = new RegExp(plan.conventions.frTagPattern, "g");
  } catch {
    errors.push(`conventions.frTagPattern is not a valid regex: ${plan.conventions.frTagPattern}.`);
  }
  if (tagRe) {
    const testFiles = walk2(appDir).filter((f) => isTestFile2(f.rel));
    const refs = /* @__PURE__ */ new Map();
    for (const f of testFiles) {
      const text = readText(f.abs);
      if (!text) continue;
      tagRe.lastIndex = 0;
      const found = /* @__PURE__ */ new Set();
      let m;
      while (m = tagRe.exec(text)) found.add(m[0]);
      for (const id of found) {
        if (!refs.has(id)) refs.set(id, []);
        refs.get(id).push(f.rel);
      }
    }
    const known = new Set(srd.functional.map((f) => f.id));
    const stale = [...refs.keys()].filter((id) => !known.has(id)).sort();
    if (stale.length) {
      warnings.push(`Tests reference FR id(s) absent from the SRD (${stale.join(", ")}) \u2014 ids may have shifted on a re-render; retag the tests.`);
    }
    for (const fr of srd.functional) {
      const files = (refs.get(fr.id) ?? []).sort();
      frTestCoverage.push({ fr: fr.id, priority: fr.priority, testFiles: files });
      const claimed = plan.tasks.some((t) => t.frIds.includes(fr.id) && t.status === "done");
      if (files.length === 0 && claimed) {
        const msg = `${fr.id} (${fr.priority}) is built but no test references it \u2014 name the FR id in a test (pattern: ${plan.conventions.frTagPattern}).`;
        if (opts.strict && fr.priority === "must") errors.push(msg);
        else warnings.push(msg);
      }
    }
  }
  let commandResults;
  if (opts.runTests) {
    commandResults = [];
    if (plan.conventions.testCommand) {
      const r = runCommand(plan.conventions.testCommand, appDir);
      commandResults.push(r);
      if (!r.ok) errors.push(`Test command failed (exit ${r.exitCode}): ${r.command}`);
    } else {
      warnings.push(`--run-tests requested but conventions.testCommand is not set.`);
    }
    for (const t of doneTasks) {
      for (const cmd of t.verify.commands) {
        const r = runCommand(cmd, appDir);
        commandResults.push(r);
        if (!r.ok) errors.push(`${t.id} verify command failed (exit ${r.exitCode}): ${cmd}`);
      }
    }
  }
  const ok = errors.length === 0;
  return { ok, errors, warnings, frTestCoverage, commandResults };
}
function formatVerifyReport(r, runDir) {
  const lines = [];
  lines.push(`construct verify: ${runDir}`);
  lines.push(``);
  lines.push(`Plan & artifacts (hard):`);
  for (const e of r.errors) lines.push(`  \u2717 ${e}`);
  for (const w of r.warnings) lines.push(`  \u26A0 ${w}`);
  lines.push(r.ok ? `  \u2713 build state is consistent with the plan and the SRD` : `  \u2717 build state does NOT match the plan/SRD`);
  if (r.frTestCoverage.length) {
    lines.push(``);
    lines.push(`Requirement \u2192 test coverage:`);
    for (const c2 of r.frTestCoverage) {
      lines.push(`  ${c2.testFiles.length ? "\u2713" : "\xB7"} ${c2.fr} (${c2.priority}): ${c2.testFiles.length ? c2.testFiles.join(", ") : "no test references it"}`);
    }
  }
  if (r.commandResults) {
    lines.push(``);
    lines.push(`Commands (--run-tests):`);
    for (const c2 of r.commandResults) lines.push(`  ${c2.ok ? "\u2713" : "\u2717"} ${c2.command} (exit ${c2.exitCode})`);
  }
  return lines.join("\n");
}

// src/orchestrate.ts
import { existsSync as existsSync12, mkdirSync as mkdirSync7, readFileSync as readFileSync10, writeFileSync as writeFileSync8 } from "fs";
import { join as join18, resolve as resolve4 } from "path";

// src/orchestrate-templates.ts
import { join as join17 } from "path";
var ADR_LENSES = ["feasibility", "operations-cost", "user-value"];
function oneWriterFooter(runAbs, sanctionedWrite) {
  return `
## Return, don't write (the one-writer rule)

Return ONLY the structured output specified above. Subagents NEVER write into the run folder: do not write, edit, or delete any file there, and do not run any engine command that writes it (\`research\`, \`review\`, \`review --apply\`, \`render\`, \`init\`, \`brainstorm --merge\`). Drill commands never write the dossier \u2014 \`web|oss|tech|so\` print evidence to stdout and are safe. The orchestrator is the sole writer: it folds your returned fragments in serially and runs the gates itself. One writer, many readers \u2014 no races, no clobbered evidence.${sanctionedWrite ? `

${sanctionedWrite}` : ""}

Exception for oversized prose: if a justification is too large to return, write ONLY to \`${join17(runAbs, "orchestration", "out")}/<role>-<batch>.md\` (a file namespaced to you alone) and return its path.
`;
}
var RESEARCH_SCHEMA = {
  type: "object",
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["gap", "summary", "urls"],
        properties: {
          gap: { type: "string", description: "the gap label, verbatim from your prompt" },
          summary: { type: "string", description: "<=5 lines: what was found and why it matters to this product" },
          urls: { type: "array", items: { type: "string" }, description: "URLs worth grounding, best first" }
        }
      }
    }
  }
};
var CLAIM_REVIEW_SCHEMA = {
  type: "object",
  required: ["pairs"],
  properties: {
    pairs: {
      type: "array",
      items: {
        type: "object",
        required: ["claimId", "evidenceId", "verdict", "note"],
        properties: {
          claimId: { type: "string", description: "verbatim from the worklist" },
          evidenceId: { type: "string", description: "verbatim from the worklist" },
          verdict: { enum: ["supported", "partial", "refuted", "unsupported"] },
          note: { type: "string", description: "<=200 chars, grounded in the digest/source you read" }
        }
      }
    }
  }
};
var ADR_JUDGE_SCHEMA = {
  type: "object",
  required: ["lens", "score", "rationale"],
  properties: {
    lens: { enum: [...ADR_LENSES] },
    score: { type: "integer", minimum: 1, maximum: 5 },
    rationale: { type: "string", description: "one paragraph, nothing else" }
  }
};
var BUILDER_SCHEMA = {
  type: "object",
  required: ["taskId", "status", "summary", "artifacts", "tests"],
  properties: {
    taskId: { type: "string" },
    status: { enum: ["done", "blocked"] },
    summary: { type: "string", description: "what was built, TDD evidence (RED then GREEN)" },
    worktree: { type: "string", description: "absolute path of your git worktree holding the committed work" },
    artifacts: { type: "array", items: { type: "string" }, description: "app-relative paths implementing the task" },
    tests: { type: "array", items: { type: "string" }, description: "app-relative test files (each names its FR id)" },
    blockers: { type: "array", items: { type: "string" } }
  }
};
var PHASE_SPECS = {
  research: {
    role: "researcher",
    title: "Research fan-out",
    schema: RESEARCH_SCHEMA,
    batchSize: 8,
    description: (n) => `Research the ${n} evidence gap(s) construct analyze found (fan-out; the orchestrator folds URLs into ONE pinned research re-run)`,
    extraExpr: "'GAPS (yours only, each with its drill command):\\n- ' + batch.join('\\n- ')",
    applyHint: (engine, run2) => [
      `node ${engine} research --out ${run2} --angles market,oss,tech --url <u1,u2,...> [--docs-url <d,...>]`,
      `node ${engine} analyze --out ${run2}`
    ]
  },
  "claim-review": {
    role: "claim-reviewer",
    title: "Claim review",
    schema: CLAIM_REVIEW_SCHEMA,
    batchSize: 8,
    description: (n) => `Adversarially verify the ${n} claim\u2194evidence pair(s) of a construct SRD (skeptic fan-out; the orchestrator folds the verdicts and gates)`,
    extraExpr: "'PAIRS=' + batch.join(',')",
    applyHint: (engine, run2) => [`node ${engine} review --apply verdicts.json --out ${run2}`, `node ${engine} check --out ${run2} --semantic`]
  },
  "adr-judges": {
    role: "adr-judge",
    title: "Judge panel",
    schema: ADR_JUDGE_SCHEMA,
    batchSize: 1,
    description: () => "Judge ONE contested ADR through the 3-lens panel (feasibility / operations & cost / user value); majority reduce",
    extraExpr: "'LENS=' + batch[0] + '\\nADR = ' + JSON.stringify(ADR) + '\\nCITED EVIDENCE = ' + JSON.stringify(EVIDENCE)",
    applyHint: (engine, run2) => [`node ${engine} render --out ${run2} --from-srd`]
  },
  build: {
    role: "builder",
    title: "Build frontier",
    schema: BUILDER_SCHEMA,
    batchSize: 1,
    description: (n) => `Build the ${n} ready BUILD-PLAN task(s) of this milestone frontier \u2014 one TDD builder per task, each in its own git worktree`,
    extraExpr: "'TASK=' + batch.join(',')",
    agentOpts: ", isolation: 'worktree'",
    applyHint: (engine, run2) => [`node ${engine} verify --out ${run2}`]
  }
};
function phaseSpec(name2) {
  const spec = PHASE_SPECS[name2];
  if (!spec) throw new Error(`no phase spec for "${name2}"`);
  return spec;
}
function toBatches(ids, batchSize) {
  const out2 = [];
  for (let i2 = 0; i2 < ids.length; i2 += batchSize) out2.push(ids.slice(i2, i2 + batchSize));
  return out2;
}
var FOLD_PREAMBLE = {
  research: [
    "// One-writer rule: this workflow only COLLECTS research fragments (summaries + URLs).",
    "// The main agent folds them in serially with ONE pinned research re-run \u2014 a research run",
    "// REBUILDS the dossier from exactly the angles/URLs it is given, so pass every angle \u2014",
    "// then re-measures the gaps:"
  ],
  "claim-review": [
    "// One-writer rule: this workflow only COLLECTS verdict fragments. The main agent merges",
    "// them into ONE verdicts.json (order-independent, keyed claimId::evidenceId \u2014 an omitted",
    "// pair is reported unadjudicated, never silently passed), then folds and gates:"
  ],
  "adr-judges": [
    "// One-writer rule: this workflow only COLLECTS the 3 lens verdicts. The main agent",
    "// majority-reduces them (pass = >=2 lenses scoring >=3): record one line per lens in the",
    "// ADR's *Alternatives considered*, flip status proposed -> accepted in SRD.json only on a",
    "// pass (on a fail, take the strongest rationale back to the user), then re-emit the tree:"
  ],
  build: [
    "// One-writer rule: builders write code ONLY in their own git worktrees. The main agent",
    "// merges each worktree (serialising tasks that touch app-shared files \u2014 routing, schema,",
    "// the test harness), folds artifacts/tests/status into BUILD-PLAN.json itself, then referees:"
  ]
};
function phaseWorkflowScript(ph, runAbs, engineAbs, units, adr) {
  const spec = phaseSpec(ph.name);
  const scriptPath = join17(runAbs, "orchestration", `${ph.name}.workflow.mjs`);
  const meta = { name: `construct-${ph.name}`, description: spec.description(units.length), phases: [{ title: spec.title }] };
  const adrConsts = adr ? [`const ADR = ${JSON.stringify(adr.adr)}`, `const EVIDENCE = ${JSON.stringify(adr.evidence)}`] : [];
  const tail = FOLD_PREAMBLE[ph.name] ?? [];
  return [
    `export const meta = ${JSON.stringify(meta)}`,
    ``,
    `// NOT a plain Node script: launch via the Workflow tool \u2014 Workflow({ scriptPath: ${JSON.stringify(scriptPath)} }).`,
    `// Emitted by \`construct orchestrate\` from the CURRENT run state. The run is the source`,
    `// of truth: if its worklist changes, re-run \`orchestrate --phase ${ph.name}\` before launching.`,
    ``,
    `// Constants for THIS run (injected at emit time; no Date.now/Math.random in this harness).`,
    `const RUN = ${JSON.stringify(runAbs)}`,
    `const ENGINE = ${JSON.stringify(engineAbs)}`,
    `const WORKLIST = ${JSON.stringify(ph.worklist)}`,
    `const AGENTS = RUN + '/orchestration/agents'`,
    `const BATCHES = ${JSON.stringify(toBatches(units, spec.batchSize))}`,
    ...adrConsts,
    `const SCHEMA = ${JSON.stringify(spec.schema)}`,
    ``,
    `function contract(name, extra) {`,
    `  return 'Read and follow the dispatch contract at ' + AGENTS + '/' + name + '.md VERBATIM.\\n'`,
    `    + 'Constants: RUN=' + RUN + '  ENGINE=' + ENGINE + '  WORKLIST=' + WORKLIST + '.\\n'`,
    `    + 'Invoke the engine only by its ABSOLUTE path: node ' + ENGINE + ' <cmd> \u2014 stdout drills and read-only commands only.'`,
    `    + (extra ? '\\n' + extra : '')`,
    `}`,
    ``,
    `log('construct ${ph.name}: ' + ${JSON.stringify(String(units.length))} + ' unit(s) across ' + BATCHES.length + ' agent(s)')`,
    ``,
    `phase(${JSON.stringify(spec.title)})`,
    `const results = await pipeline(BATCHES, (batch, _item, i) =>`,
    `  agent(contract('${spec.role}', ${spec.extraExpr}), { label: '${ph.name}:' + (i + 1), phase: ${JSON.stringify(spec.title)}, agentType: 'general-purpose', schema: SCHEMA${spec.agentOpts ?? ""} }))`,
    ``,
    ...tail,
    ...spec.applyHint(engineAbs, runAbs).map((c2) => `//   ${c2}`),
    `return { phase: ${JSON.stringify(ph.name)}, worklist: WORKLIST, results: results.filter(Boolean) }`,
    ``
  ].join("\n");
}
function agentContracts(runAbs, engineAbs, idea) {
  const footer = oneWriterFooter(runAbs);
  const builderFooter = oneWriterFooter(
    runAbs,
    "Your ONE sanctioned write surface is your own isolated git worktree \u2014 app code and app tests only. The run folder (BUILD-PLAN.json, SRD.json, evidence/) stays the orchestrator's."
  );
  const inlineIdea = idea.replace(/`/g, "'").replace(/\s*(?:\r\n|[\r\n])\s*/g, " ").trim();
  const product = inlineIdea ? `\`${inlineIdea}\`` : "(no brief.json yet \u2014 the orchestrator will restate the one-liner in your prompt)";
  return {
    researcher: `# Contract: researcher

You research evidence gaps of a construct run \u2014 the features, competitors, candidate tech and OSS seeds that \`analyze\` proved will render UNGROUNDED as-is (references/orchestration.md Pattern 1).

Product one-liner: ${product}

Your prompt lists your gaps (\`GAPS\`), each with its matching drill command. For EACH of your gaps:

1. Run the drill (\`node ${engineAbs} web|oss|tech|so ... [--json]\`) and read the items. Drills print evidence to stdout and never write the dossier \u2014 they are safe to run in parallel.
2. Use your own WebSearch for what the drill misses (competitor pages, docs, issue threads, comparisons).
3. Judge relevance against the product one-liner and the gap \u2014 keep only what would actually ground this claim.

Return (structured output): \`{ "findings": [{ "gap", "summary", "urls" }] }\` \u2014 your GAPS only. Per gap: a \u22645-line summary of what was found and why it matters to this product, and the URLs worth grounding, best first. The orchestrator folds ALL returned URLs into ONE pinned \`research\` re-run (a research run rebuilds the dossier from exactly the angles/URLs it is given), then re-runs \`analyze\`.
${footer}`,
    "claim-reviewer": `# Contract: claim-reviewer

You are an adversarial skeptic verifying that each SRD claim is actually SUPPORTED by the evidence it cites (references/orchestration.md Pattern 4). Assume the citation is decorative until the evidence proves otherwise.

Worklist: \`${join17(runAbs, "VERIFY.todo.json")}\` (\`{ pairs: [...] }\`; each pair has \`claimId\`, \`kind\`, \`claim\`, \`evidenceId\`, \`source\`, \`digest\`). Handle ONLY the pairs whose \`claimId::evidenceId\` key is named in your prompt (\`PAIRS=<key,\u2026>\`). If a PAIRS key is no longer in the worklist, skip it and say so in your note.

For EACH of your pairs:

1. Read the pair's \`claim\` and its \`digest\` (the cited item's snippet). You may open the evidence source URL (see \`${join17(runAbs, "evidence", "EVIDENCE.md")}\`) for more context. A digest flagged \`[low-signal snippet \u2026]\` must be adjudicated skeptically \u2014 never grant \`supported\` on the URL alone.
2. Judge the claim\u2194evidence link:
   - \`supported\` \u2014 the cited evidence directly backs the claim.
   - \`partial\` \u2014 it backs a weaker version of the claim.
   - \`unsupported\` \u2014 it is irrelevant / does not bear on the claim.
   - \`refuted\` \u2014 it contradicts the claim.
   When unsure, choose the HARSHER verdict \u2014 a false pass is worse than a false fail.
3. \`note\` is REQUIRED \u2014 \u2264200 chars grounded in what you actually read (quote or paraphrase the decisive text).

Return (structured output): \`{ "pairs": [{ "claimId", "evidenceId", "verdict", "note" }] }\` \u2014 ids VERBATIM, your PAIRS only. The fold cross-checks the worklist: an invalid verdict token reads as unadjudicated (not as a failure) and an omitted pair is reported unadjudicated \u2014 never silently passed.
${footer}`,
    "adr-judge": `# Contract: adr-judge

You are ONE lens of a 3-judge panel over ONE contested ADR (references/orchestration.md Pattern 3). Your prompt carries your \`LENS\`, the \`ADR\` (title, context, decision, consequences, alternatives) and the \`CITED EVIDENCE\` snippets \u2014 pasted in; you do not need the run folder.

The lenses:

- \`feasibility\` \u2014 can this team build it in this timeline on this stack?
- \`operations-cost\` \u2014 what does it cost to run, observe, upgrade, exit?
- \`user-value\` \u2014 does this decision serve the stated users and value prop?

Judge ONLY through your lens; the other two are someone else's job. If the ADR cites no evidence, judge from its text alone and say so in the rationale \u2014 that grounding gap is itself signal.

Return (structured output): \`{ "lens", "score", "rationale" }\` \u2014 a 1\u20135 integer score and a one-paragraph rationale, nothing else. The orchestrator decides by majority (\u22652 judges scoring \u22653), records one line per lens in the ADR's *Alternatives considered*, and flips \`status: proposed \u2192 accepted\` only on a pass.
${footer}`,
    builder: `# Contract: builder

You build ONE task of \`${join17(runAbs, "BUILD-PLAN.json")}\`, test-first, in your OWN isolated git worktree (references/orchestration.md Pattern 5 + references/build-playbook.md). Your prompt names your task (\`TASK=<id>\`). If your TASK id is no longer in the worklist, skip it and say so in your summary.

1. Read your task in the plan. Its \`acceptance\` entries POINT into \`${join17(runAbs, "SRD.json")}\` (\`functional[frId].acceptance[index]\`) \u2014 the SRD stays the single source of truth for what "done" means.
2. Work ONLY inside your own git worktree (the workflow dispatches you with \`isolation: 'worktree'\`). TDD each acceptance criterion: failing test first, then make it pass \u2014 and **every test names its FR id** (e.g. \`describe("FR-001 \u2026")\`; that is what \`verify\` greps for).
3. Run the app's test command yourself in the worktree. Do NOT run \`verify\` or the milestone gate \u2014 the orchestrator referees after folding the whole frontier.
4. NEVER edit \`BUILD-PLAN.json\`, \`SRD.json\` or anything in the run folder, and never touch files another frontier task owns \u2014 app-shared files (routing, schema, the test harness) are serialised by the orchestrator.

Return (structured output): \`{ "taskId", "status", "summary", "worktree", "artifacts", "tests", "blockers" }\` \u2014 \`status\` is \`done\` or \`blocked\`, \`worktree\` is the absolute path holding your committed work, \`artifacts\`/\`tests\` are app-relative. The orchestrator merges your worktree, folds artifacts/tests/status into BUILD-PLAN.json itself, and runs \`node ${engineAbs} verify --out ${runAbs}\`.
${builderFooter}`
  };
}
function runbookMd(phases, runAbs, engineAbs) {
  const status = phases.map((p) => `| ${p.name} | \`${p.worklist}\` | ${p.ready ? `ready (${p.items} unit(s))` : "not ready"} | \`${p.prerequisite}\` |`).join("\n");
  const engine = `node ${engineAbs}`;
  const agents = join17(runAbs, "orchestration", "agents");
  return `# construct \u2014 sequential RUNBOOK (eco / no-subagent fallback)

Run: \`${runAbs}\` \xB7 Engine: \`${engine}\`

Generated by \`construct orchestrate\` from the CURRENT run state. This sequential path is
correctness-identical to the multi-agent workflows \u2014 same worklists, same contracts, same
gates; only wall-clock differs. Fan-out is an optimization, not a requirement (the
three-tier model of references/orchestration.md).

## Phase status

| Phase | Worklist | Status | Produce it with |
|---|---|---|---|
${status}

## The loop (play every role yourself, one unit at a time)

1. **Interview \u2192 brief** (if not done): \`${engine} init --idea "<one-liner>" --out ${runAbs}\`, then fill \`${join17(runAbs, "brief.json")}\` one question at a time (references/interview-playbook.md).
2. **Research, then dig every gap** \u2014 \`${engine} research --out ${runAbs}\` builds the dossier; \`${engine} analyze --out ${runAbs}\` names each gap + its drill command. For EVERY gap, apply \`${join17(agents, "researcher.md")}\` yourself (run the drill, WebSearch what it misses, keep the URLs worth grounding). Fold in serially with ONE pinned re-run: \`${engine} research --out ${runAbs} --angles market,oss,tech --url <u,...>\` \u2192 re-run \`analyze\`. Loop until clean or the user stops you.
3. **Render**: \`${engine} render --out ${runAbs} --level complex\`, then enrich the SRD (SKILL.md step 4).
4. **Claim-support review** \u2014 \`${engine} review --out ${runAbs}\` writes \`${join17(runAbs, "VERIFY.todo.json")}\`. For EVERY pair, apply \`${join17(agents, "claim-reviewer.md")}\` yourself (verdict + note into a \`verdicts.json\`). Then fold: \`${engine} review --apply verdicts.json --out ${runAbs}\` and gate: \`${engine} check --out ${runAbs} --semantic\` (must exit 0 before presenting).
5. **Judge panel \u2014 only for ONE genuinely contested ADR** \u2014 apply \`${join17(agents, "adr-judge.md")}\` yourself three times (feasibility / operations-cost / user-value) over the pasted ADR + its cited evidence. Majority (\u22652 lenses \u22653) \u2192 one line per lens under *Alternatives considered*, flip \`proposed \u2192 accepted\` in \`${join17(runAbs, "SRD.json")}\`, re-emit: \`${engine} render --out ${runAbs} --from-srd\`.
6. **Build the frontier** \u2014 per ready task (\`${engine} status --out ${runAbs} --json\` \u2192 \`frontier\`), apply \`${join17(agents, "builder.md")}\` yourself (sequentially you may work in the app dir directly \u2014 no worktree needed); fold artifacts/tests/status into \`${join17(runAbs, "BUILD-PLAN.json")}\`, then \`${engine} verify --out ${runAbs}\`. Milestone gate once the frontier is folded: \`${engine} verify --out ${runAbs} --run-tests --strict\`.

The adversarial SRD review (Pattern 2) stays a single fresh-eyes pass by design \u2014 run it
per references/adversarial-review.md; it is deliberately not a fan-out and not emitted here.

With subagents available, prefer the emitted workflows instead: \`orchestrate --out ${runAbs} --phase <p>\` then \`Workflow({ scriptPath: "${join17(runAbs, "orchestration", "<p>.workflow.mjs")}" })\` \u2014 you stay the sole writer either way.
`;
}

// src/orchestrate.ts
var PHASES = ["research", "claim-review", "adr-judges", "build"];
var SMALL_WORKLIST = 3;
function loadSrd(runDir) {
  const manifest = srdManifestPath(runDir);
  if (!existsSync12(manifest)) return null;
  try {
    const srd = JSON.parse(readFileSync10(manifest, "utf8"));
    return srd && typeof srd === "object" ? srd : null;
  } catch {
    return null;
  }
}
function loadDossier(runDir) {
  const path = join18(runDir, "evidence", "evidence.json");
  if (!existsSync12(path)) return [];
  try {
    const data = JSON.parse(readFileSync10(path, "utf8"));
    return Array.isArray(data) ? data.filter(
      (e) => !!e && typeof e === "object" && typeof e.id === "string" && typeof e.source === "string"
    ) : [];
  } catch {
    return [];
  }
}
function researchUnits(runDir, engineAbs) {
  if (!existsSync12(join18(runDir, "brief.json")) || !existsSync12(join18(runDir, "evidence", "evidence.json"))) return null;
  try {
    const r = analyzeRun(runDir);
    const labels = [
      ...r.ungroundedFeatures.map((f) => `feature (${f.priority}): "${f.title}" has no matchable evidence`),
      ...r.unmatchedCompetitors.map((c2) => `competitor: "${c2}" never surfaced in market evidence`),
      ...r.unmatchedTech.map((t) => `tech: "${t}" has no docs/StackOverflow grounding`),
      ...r.unminedSeeds.map((s) => `oss seed: ${s} yielded no mined evidence`)
    ];
    return labels.map((label, i2) => {
      const drill = r.suggestions[i2]?.replace(/^construct /, `node ${engineAbs} `);
      return drill ? `${label} \u2192 drill: ${drill}` : label;
    });
  } catch {
    return null;
  }
}
function listPhases(runDir, engineAbs) {
  const run2 = resolve4(runDir);
  const gaps = researchUnits(run2, engineAbs);
  const todoPath = join18(run2, "VERIFY.todo.json");
  let pairKeys = null;
  if (existsSync12(todoPath)) {
    try {
      const todo = JSON.parse(readFileSync10(todoPath, "utf8"));
      if (todo && Array.isArray(todo.pairs)) {
        pairKeys = todo.pairs.filter((p) => !!p && typeof p.claimId === "string" && typeof p.evidenceId === "string").map((p) => `${p.claimId}::${p.evidenceId}`);
      }
    } catch {
    }
  }
  const srd = loadSrd(run2);
  const adrIds = srd && Array.isArray(srd.architecture?.adrs) ? srd.architecture.adrs.map((a) => a.id) : [];
  const plan = loadPlan(run2);
  const frontier = plan ? readyFrontier(plan).frontier : null;
  const renderCmd = `node ${engineAbs} render --out ${run2} --level complex`;
  return [
    {
      name: "research",
      ready: gaps !== null,
      worklist: join18(run2, "evidence", "evidence.json"),
      items: gaps?.length ?? 0,
      ids: gaps ?? [],
      prerequisite: `node ${engineAbs} research --out ${run2}`
    },
    {
      name: "claim-review",
      ready: pairKeys !== null,
      worklist: todoPath,
      items: pairKeys?.length ?? 0,
      ids: pairKeys ?? [],
      prerequisite: `node ${engineAbs} review --out ${run2}`
    },
    {
      name: "adr-judges",
      ready: adrIds.length > 0,
      worklist: srdManifestPath(run2),
      items: adrIds.length,
      ids: adrIds,
      prerequisite: renderCmd
    },
    {
      name: "build",
      ready: frontier !== null,
      worklist: join18(run2, "BUILD-PLAN.json"),
      items: frontier?.length ?? 0,
      ids: frontier ?? [],
      prerequisite: renderCmd
    }
  ];
}
function adrPanelPayload(runDir, adrId) {
  const srd = loadSrd(runDir);
  const adr = srd?.architecture?.adrs?.find((a) => a.id === adrId);
  if (!adr) return null;
  const byId = new Map(loadDossier(runDir).map((e) => [e.id, e]));
  const evidence = [...new Set(adr.evidence)].map((id) => byId.get(id)).filter((e) => !!e).map((e) => ({ id: e.id, source: e.source, ref: e.ref, digest: (e.snippet || e.title || e.ref).slice(0, 600) }));
  return { adr, evidence };
}
var err2 = (exitCode, errors, phases) => ({ exitCode, written: [], notices: [], errors, phases });
function orchestrateRun(runDir, engineAbs, opts = {}) {
  const run2 = resolve4(runDir);
  if (!existsSync12(run2)) {
    return err2(2, [`run dir not found: ${run2}`], []);
  }
  const phases = listPhases(run2, engineAbs);
  const adrPhase = phases.find((p) => p.name === "adr-judges");
  const notices = [];
  let selected = phases.filter((p) => p.ready && p.name !== "adr-judges");
  let adrPayload;
  if (opts.phase !== void 0) {
    const ph = phases.find((p) => p.name === opts.phase);
    if (!ph) {
      return err2(2, [`unknown phase "${opts.phase}" \u2014 expected one of: ${PHASES.join(", ")}.`], phases);
    }
    if (!ph.ready) {
      return err2(2, [`phase "${ph.name}" is not ready \u2014 its worklist ${ph.worklist} is missing or unreadable. Produce it first: ${ph.prerequisite}`], phases);
    }
    if (ph.name === "adr-judges") {
      const available = `this run's ADRs: ${ph.ids.join(", ")}`;
      if (!opts.adr) {
        return err2(
          2,
          [
            `phase "adr-judges" panels ONE contested ADR \u2014 pass --adr <id> (${available}). Reserve it for a genuinely contested, hard-to-reverse decision (references/orchestration.md Pattern 3).`
          ],
          phases
        );
      }
      if (!ph.ids.includes(opts.adr)) {
        return err2(2, [`ADR "${opts.adr}" not found \u2014 ${available}.`], phases);
      }
      adrPayload = adrPanelPayload(run2, opts.adr) ?? void 0;
      if (!adrPayload) return err2(2, [`ADR "${opts.adr}" could not be loaded from ${ph.worklist}.`], phases);
    }
    selected = [ph];
  } else if (adrPhase.ready) {
    notices.push(
      `phase "adr-judges": not emitted by default (a 3-lens panel over ONE contested ADR) \u2014 emit it explicitly: orchestrate --out ${run2} --phase adr-judges --adr <id> (this run's ADRs: ${adrPhase.ids.join(", ")}).`
    );
  }
  const orchDir = join18(run2, "orchestration");
  const agentsDir = join18(orchDir, "agents");
  mkdirSync7(join18(orchDir, "out"), { recursive: true });
  mkdirSync7(agentsDir, { recursive: true });
  const written = [];
  let idea = "";
  try {
    idea = loadBrief(run2).idea;
  } catch {
  }
  for (const [name2, content] of Object.entries(agentContracts(run2, engineAbs, idea))) {
    const p = join18(agentsDir, `${name2}.md`);
    writeFileSync8(p, content);
    written.push(p);
  }
  if (!opts.eco) {
    for (const ph of selected) {
      const units = ph.name === "adr-judges" ? [...ADR_LENSES] : ph.ids;
      if (units.length === 0) {
        notices.push(`phase "${ph.name}": worklist is empty \u2014 nothing to orchestrate.`);
        continue;
      }
      if (ph.name !== "adr-judges" && units.length <= SMALL_WORKLIST) {
        notices.push(`phase "${ph.name}": only ${units.length} unit(s) \u2014 the sequential --eco path is equivalent and cheaper.`);
      }
      const p = join18(orchDir, `${ph.name}.workflow.mjs`);
      writeFileSync8(p, phaseWorkflowScript(ph, run2, engineAbs, units, adrPayload));
      written.push(p);
    }
  }
  const rb = join18(orchDir, "RUNBOOK.md");
  writeFileSync8(rb, runbookMd(phases, run2, engineAbs));
  written.push(rb);
  return { exitCode: 0, written, notices, errors: [], phases };
}

// src/cli.ts
var HELP2 = `construct v${VERSION}
Turn a product idea into a grounded, buildable SRD suite. Interview \u2192 research
(market / OSS prior-art / tech feasibility / optional local semantic) \u2192 render \u2192
check. Grounding is advisory; structural completeness is enforced.

Usage:
  construct init     --idea "<one-liner>" [--out <dir>]
  construct brainstorm --out <run> [--merge] [--json]
  construct research --out <run> [--angles market,oss,tech,semantic] [--q "<focus>"] [--url <u,...>] [--semantic]
  construct analyze  --out <run> [--json]
  construct web|oss|tech|so --out <run> [--q "<focus>"] [--url <u,...>] [--seeds <u,...>]
  construct render   --out <run> [--level light|complex] [--merge] [--no-design] [--prd|--no-prd]
  construct render   --out <run> --from-srd [--merge] [--prd|--no-prd]
  construct check    --out <run> [--min-grounding <0-100>] [--semantic [--allow-unverified]] [--json]
  construct review   --out <run> [--apply <verdicts.json>] [--max-review N] [--json]
  construct verify   --out <run> [--app <dir>] [--run-tests] [--strict] [--json]
  construct status   --out <run> [--json]
  construct orchestrate --out <run> [--phase research|claim-review|adr-judges|build] [--adr <id>] [--eco] [--list]
  construct semantic up|down|status

Commands:
  init       Scaffold a run folder + brief.json (fill it via the interview).
  brainstorm Divergent ideation BEFORE the interview: scaffold a board of
             candidate ideas (brainstorm.json + BRAINSTORM.md). --merge folds
             kept ideas into brief.json (parked \u2192 \u{1F9E0} openQuestions).
  research   Gather evidence across angles into <run>/evidence (a dossier).
  analyze    Report what is thin (gaps that will render ungrounded) + drill commands.
  web        Drill the market/web angle.       oss   Drill OSS prior-art mining.
  tech       Drill tech docs + StackOverflow.   so    Drill StackOverflow only.
  render     Render the SRD tree + SRD.json from brief.json + the dossier.
             At --level complex this also renders a design-system subtree
             (design/: principles, tokens, components, screens, accessibility);
             --no-design opts out. --prd also emits requirements/prd/ \u2014 one
             standalone PRD per functional requirement + an index.
             --from-srd re-emits the tree from an edited SRD.json WITHOUT
             rebuilding it (the enrich\u2192re-render path; keeps markdown in sync
             with the gated manifest).
  check      Hard structural gate + advisory grounding-coverage report.
             --semantic also folds in the review verdicts (fails on a claim its
             cited evidence does not support).
  review     Emit a claim\u2194evidence worklist for adversarial support-checking,
             then (--apply <verdicts.json>) gate on refuted/unsupported claims.
             Mechanizes the manual adversarial-review of SRD grounding.
  verify     Check a built app against BUILD-PLAN.json + the SRD (static by
             default; --run-tests executes the declared test commands).
  status     Show what exists in a run (brief / evidence / SRD / check).
  orchestrate Emit the run's multi-agent orchestration from its CURRENT state
             into <run>/orchestration/: one launchable workflow script per
             ready fan-out phase (research gaps \xB7 claim-review pairs \xB7 the
             adr-judges 3-lens panel \xB7 build frontier tasks), the dispatch
             contracts (agents/<role>.md) and a sequential RUNBOOK.md fallback.
             Subagents RETURN fragments; you stay the sole writer of the run
             folder (references/orchestration.md). Exits 2 when the named
             phase's worklist does not exist yet \u2014 and says which command
             produces it. Re-run after any worklist change (idempotent).
  semantic   Manage the optional local Docker stack (Qdrant + Ollama + SearXNG).

Options:
  --idea <s>           One-line product idea                     (required for init)
  --out <dir>          The run folder                            (required for most)
  --angles <list>      market,oss,tech,semantic   (default: market,oss,tech)
  --q, --question <s>  Focus the research/drill on a sub-question
  --url <u,...>        For 'web': specific page(s) to fetch + PRINT (drill only \u2014
                       stdout, not persisted; use 'research --url' to ground)
                       For 'research': pin page(s) into the dossier (market angle,
                       persisted evidence \u2014 this is what actually grounds a claim)
  --seeds <u,...>      OSS repo URLs to mine (overrides brief.ossSeeds)
  --docs-url <u,...>   For 'tech': docs page(s) to fetch + PRINT (drill only \u2014
                       stdout, not persisted; use 'research --docs-url' to ground)
                       For 'research': pin docs page(s) into the dossier (tech
                       angle, persisted evidence \u2014 this is what actually grounds)
  --level <l>          light | complex                           (default: light)
  --min-grounding <n>  For 'check': fail unless \u2265 n% of claims are grounded (opt-in)
  --semantic           For 'check': fold in the 'review' claim-support verdicts
                       (fail-closed: no/unreadable VERIFY.json fails the check)
  --allow-unverified   For 'check --semantic': degrade a missing/unreadable
                       VERIFY.json to a warning instead of failing
  --apply <file>       For 'review': consume an adjudicated verdicts file + gate
  --max-review <n>     For 'review': cap the worklist at the n highest-score
                       pairs (default: review ALL cited pairs; dropped pairs
                       are named in VERIFY.md)
  --app <dir>          For 'verify': the built app directory (default: conventions.appDir)
  --phase <name>       For 'orchestrate': emit one phase only \u2014
                       research | claim-review | adr-judges | build
  --adr <id>           For 'orchestrate': the contested ADR the judge panel
                       rules on (required with --phase adr-judges)
  --eco                For 'orchestrate': emit only RUNBOOK.md + agents/*.md \u2014
                       the explicit low-token sequential path
  --list               For 'orchestrate': print the phases + readiness as JSON
  --run-tests          For 'verify': also execute testCommand + per-task verify commands
  --strict             For 'verify': a built must-have FR with no referencing test FAILS
  --web-engine <e>     auto | searxng | ddg | claude             (default: auto)
  --per-source <n>     Max evidence items kept per source        (default: 6)
  --merge              Also emit a single-file SRD.md bundle
  --no-design          For 'render': skip the design-system subtree (complex only)
  --prd                For 'render': also emit one PRD file per FR (requirements/prd/)
  --no-prd             For 'render': deliberately delete an existing requirements/prd/
                       (without it, a render that omits --prd refuses to destroy the tree)
  --semantic           Rescore evidence with the local embedding model
  --refresh            Force re-clone of mined OSS repos
  --json               Machine-readable output
  -h, --help           Show this help
  -v, --version        Show version

Workflow:
  construct init --idea "..." --out ./my-idea     # then fill brief.json (interview)
  construct research --out ./my-idea              # grounds the SRD in real evidence
  construct render --out ./my-idea --level complex # writes the SRD tree
  construct check --out ./my-idea                 # structural gate + coverage report
`;
var COMMANDS = /* @__PURE__ */ new Set([
  "init",
  "brainstorm",
  "research",
  "analyze",
  "web",
  "oss",
  "tech",
  "so",
  "render",
  "check",
  "verify",
  "review",
  "status",
  "orchestrate",
  "semantic"
]);
var VALUE_FLAGS = /* @__PURE__ */ new Set([
  "idea",
  "out",
  "run",
  "angles",
  "q",
  "question",
  "url",
  "seeds",
  "docs-url",
  "level",
  "web-engine",
  "per-source",
  "source",
  "min-grounding",
  "app",
  "apply",
  "max-review",
  "phase",
  "adr"
]);
var BOOL_FLAGS = /* @__PURE__ */ new Set([
  "semantic",
  "merge",
  "json",
  "refresh",
  "run-tests",
  "strict",
  "no-design",
  "prd",
  "no-prd",
  "allow-unverified",
  "from-srd",
  "eco",
  "list"
]);
function fail(message) {
  process.stderr.write(`construct: ${message}
`);
  process.exit(1);
}
function oneOf(name2, value, allowed) {
  if (!allowed.includes(value)) {
    fail(`invalid --${name2} "${value}" (expected: ${allowed.join(", ")})`);
  }
  return value;
}
function parseArgs(argv) {
  if (argv.length === 0) {
    process.stdout.write(HELP2);
    process.exit(0);
  }
  if (argv[0] === "-h" || argv[0] === "--help") {
    process.stdout.write(HELP2);
    process.exit(0);
  }
  if (argv[0] === "-v" || argv[0] === "--version") {
    process.stdout.write(VERSION + "\n");
    process.exit(0);
  }
  const command = argv[0];
  if (!COMMANDS.has(command)) {
    fail(`unknown command: ${command} (run --help for usage)`);
  }
  const values = {};
  const bools = /* @__PURE__ */ new Set();
  const positional = [];
  for (let i2 = 1; i2 < argv.length; i2++) {
    const arg = argv[i2];
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(HELP2);
      process.exit(0);
    }
    if (arg === "-v" || arg === "--version") {
      process.stdout.write(VERSION + "\n");
      process.exit(0);
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const key = eq !== -1 ? arg.slice(2, eq) : arg.slice(2);
      if (BOOL_FLAGS.has(key)) {
        if (eq !== -1) fail(`--${key} is a boolean flag and does not take a value`);
        bools.add(key);
        continue;
      }
      if (!VALUE_FLAGS.has(key)) {
        fail(`unknown flag: --${key} (run --help for the supported options)`);
      }
      let value;
      if (eq !== -1) {
        value = arg.slice(eq + 1);
      } else {
        const next = argv[i2 + 1];
        if (next === void 0 || next.startsWith("--")) {
          fail(`missing value for --${key}`);
        }
        value = next;
        i2++;
      }
      values[key] = value;
      continue;
    }
    positional.push(arg);
  }
  return { command, positional, values, bools };
}
var ALL_ANGLES = ["market", "oss", "tech", "semantic"];
var DEFAULT_ANGLES = ["market", "oss", "tech"];
function parseAngles(s) {
  const out2 = [];
  for (const t of s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)) {
    if (!ALL_ANGLES.includes(t)) fail(`unknown angle "${t}" (use: market,oss,tech,semantic)`);
    if (!out2.includes(t)) out2.push(t);
  }
  if (out2.length === 0) fail("--angles resolved to nothing");
  return out2;
}
function csv(s) {
  return (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
}
function requireOut(p) {
  const out2 = (p.values.out || p.values.run || "").trim();
  if (!out2) fail("missing --out <run>");
  return resolve5(out2);
}
var warnBrief = (w) => void process.stderr.write(`  \u26A0 brief: ${w}
`);
function buildResearchContext(p, runDir, angles) {
  const brief = loadBrief(runDir, warnBrief);
  const perSource = p.values["per-source"] ? Number(p.values["per-source"]) : 6;
  if (!Number.isFinite(perSource) || perSource <= 0) fail("invalid --per-source");
  const webEngine = oneOf("web-engine", p.values["web-engine"] ?? "auto", ["auto", "searxng", "ddg", "claude"]);
  if (p.values.seeds) brief.ossSeeds = csv(p.values.seeds);
  return {
    brief,
    runDir,
    angles,
    query: p.values.q ?? p.values.question ?? "",
    webEngine,
    semantic: p.bools.has("semantic"),
    perSource,
    refresh: p.bools.has("refresh"),
    docsUrls: p.values["docs-url"] ? csv(p.values["docs-url"]) : void 0,
    marketUrls: p.values.url ? csv(p.values.url) : void 0
  };
}
function printDrill(p, results, idea, angles) {
  const evidence = assignIds2(results);
  if (p.bools.has("json")) {
    process.stdout.write(JSON.stringify(evidence, null, 2) + "\n");
    return;
  }
  const meta = {
    idea,
    angles,
    query: p.values.q ?? p.values.question,
    sources: [...new Set(evidence.map((e) => e.source))],
    semantic: false,
    evidenceCount: evidence.length,
    builtAt: (/* @__PURE__ */ new Date()).toISOString(),
    notes: results.flatMap((r) => r.notes)
  };
  process.stdout.write(renderEvidenceMarkdown(evidence, meta) + "\n");
}
async function main() {
  const p = parseArgs(process.argv.slice(2));
  switch (p.command) {
    case "init": {
      const idea = p.values.idea;
      if (!idea) fail('missing --idea "<one-liner>"');
      const out2 = p.values.out ? resolve5(p.values.out) : resolve5(slugify(idea) || "construct-run");
      const brief = initBrief(idea, (/* @__PURE__ */ new Date()).toISOString());
      const path = saveBrief(out2, brief);
      process.stderr.write(
        [
          `construct: scaffolded a run at ${out2}`,
          `  brief:  ${path}`,
          `  next:   fill brief.json via the interview (product, users, goals, features,`,
          `          constraints, candidateTech, competitors, ossSeeds), then:`,
          `          construct research --out ${out2}`
        ].join("\n") + "\n"
      );
      return;
    }
    case "brainstorm": {
      const out2 = requireOut(p);
      const brief = loadBrief(out2, warnBrief);
      if (p.bools.has("merge")) {
        const b2 = loadBrainstorm(out2, warnBrief);
        if (!b2) fail(`no brainstorm.json in ${out2} \u2014 run \`construct brainstorm --out ${out2}\` first to scaffold one.`);
        const r = mergeBrainstorm(brief, b2, (/* @__PURE__ */ new Date()).toISOString(), warnBrief);
        saveBrief(out2, r.brief);
        saveBrainstorm(out2, r.brainstorm);
        writeBrainstormMd(out2, r.brainstorm);
        if (p.bools.has("json")) {
          process.stdout.write(JSON.stringify({ merged: r.merged, parkedFolded: r.parkedFolded, skipped: r.skipped, proposed: r.proposed }, null, 2) + "\n");
          return;
        }
        process.stderr.write(
          [
            `construct: merged brainstorm \u2192 brief.json`,
            `  merged:   ${r.merged} kept idea(s) folded into the brief`,
            `  parked:   ${r.parkedFolded} parked idea(s) \u2192 openQuestions (\u{1F9E0} \u2014 resolve before check passes)`,
            `  skipped:  ${r.skipped} kept idea(s) not merged (no target / conflict \u2014 see warnings)`,
            `  proposed: ${r.proposed} idea(s) still awaiting a decision`,
            `  next:     construct research --out ${out2}`
          ].join("\n") + "\n"
        );
        return;
      }
      let b = loadBrainstorm(out2, warnBrief);
      if (!b) {
        b = initBrainstorm(brief.idea, (/* @__PURE__ */ new Date()).toISOString());
        saveBrainstorm(out2, b);
      }
      writeBrainstormMd(out2, b);
      if (p.bools.has("json")) {
        process.stdout.write(JSON.stringify(b, null, 2) + "\n");
        return;
      }
      const c2 = brainstormCounts(b);
      process.stderr.write(
        [
          `construct: brainstorm board at ${join19(out2, "BRAINSTORM.md")}`,
          `  ideas:  ${b.ideas.length} (${c2.kept} kept \xB7 ${c2.parked} parked \xB7 ${c2.proposed} proposed \xB7 ${c2.rejected} rejected)`,
          `  next:   generate ideas WITH the user (references/brainstorm-playbook.md), mark statuses in`,
          `          brainstorm.json, then: construct brainstorm --out ${out2} --merge`
        ].join("\n") + "\n"
      );
      return;
    }
    case "research": {
      const out2 = requireOut(p);
      const angles = p.values.angles ? parseAngles(p.values.angles) : DEFAULT_ANGLES;
      const ctx = buildResearchContext(p, out2, angles);
      const v = validateBrief(ctx.brief);
      for (const w of v.warnings) process.stderr.write(`  \u26A0 ${w}
`);
      const r = await runResearch(ctx, (/* @__PURE__ */ new Date()).toISOString());
      if (p.bools.has("json")) {
        process.stdout.write(JSON.stringify({ dir: r.dir, meta: r.meta }, null, 2) + "\n");
        return;
      }
      const bySource = r.meta.sources.map((s) => `${s}: ${r.evidence.filter((e) => e.source === s).length}`);
      process.stderr.write(
        [
          `construct: ${r.evidence.length} evidence item(s) for "${ctx.brief.idea}"`,
          `  angles:   ${angles.join(", ")}`,
          `  sources:  ${bySource.join(" \xB7 ") || "(none)"}`,
          ...r.meta.notes.length ? [`  notes:    ${r.meta.notes.length} (see EVIDENCE.md)`] : [],
          `  dossier:  ${r.paths.evidenceMd}`,
          `  next:     construct render --out ${out2} [--level complex]`
        ].join("\n") + "\n"
      );
      return;
    }
    case "web":
    case "oss":
    case "tech":
    case "so": {
      const out2 = requireOut(p);
      const ctx = buildResearchContext(p, out2, [p.command === "web" ? "market" : p.command]);
      let results;
      if (p.command === "web") {
        if (p.values.url) {
          const urls = csv(p.values.url);
          const q = ctx.query || urls.join(" ");
          const source = oneOf("source", p.values.source ?? "market", ALL_SOURCE_KINDS);
          const { items, notes } = await webFetchUrls(urls, q, ctx.perSource, source, true);
          results = [{ source, items, notes }];
        } else {
          results = await marketAngle(ctx);
        }
      } else if (p.command === "oss") {
        results = await ossAngle(ctx);
      } else if (p.command === "tech") {
        results = await techAngle(ctx);
      } else {
        results = [await stackoverflow(ctx.query || ctx.brief.idea, ctx.perSource)];
      }
      printDrill(p, results, ctx.brief.idea, ctx.angles);
      return;
    }
    case "render": {
      const out2 = requireOut(p);
      if (p.bools.has("from-srd")) {
        if (p.values.level) process.stderr.write("construct: --level is ignored with --from-srd (the manifest's level is authoritative).\n");
        if (p.bools.has("no-design"))
          process.stderr.write("construct: --no-design is ignored with --from-srd (re-run a full render to change the design subtree).\n");
        const r2 = renderFromSRD(out2, { merge: p.bools.has("merge"), prd: p.bools.has("prd"), noPrd: p.bools.has("no-prd") });
        process.stderr.write(
          [
            `construct: re-emitted the SRD tree from ${join19(out2, "SRD.json")}`,
            `  files:    ${r2.files.length} (${r2.srd.functional.length} FR \xB7 ${r2.srd.nonFunctional.length} NFR \xB7 ${r2.srd.architecture.adrs.length} ADR)`,
            `  next:     construct check --out ${out2}`
          ].join("\n") + "\n"
        );
        return;
      }
      const brief = loadBrief(out2, warnBrief);
      const v = validateBrief(brief);
      if (!v.ok) fail(`brief is incomplete:
${v.errors.map((e) => "  - " + e).join("\n")}`);
      const level = oneOf("level", p.values.level ?? "light", ["light", "complex"]);
      const evidence = loadEvidence4(out2);
      const r = renderSRD(brief, evidence, {
        level,
        out: out2,
        merge: p.bools.has("merge"),
        noDesign: p.bools.has("no-design"),
        prd: p.bools.has("prd"),
        noPrd: p.bools.has("no-prd"),
        generatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      const design = r.srd.design;
      process.stderr.write(
        [
          `construct: rendered the ${level} SRD for "${brief.idea}"`,
          `  files:    ${r.files.length} (${r.srd.functional.length} FR \xB7 ${r.srd.nonFunctional.length} NFR \xB7 ${r.srd.architecture.adrs.length} ADR)`,
          ...design ? [`  design:   ${design.components.length} components \xB7 ${design.tokens.length} tokens \xB7 a11y ${design.accessibility.standard}`] : [],
          `  manifest: ${join19(out2, "SRD.json")}`,
          `  next:     construct check --out ${out2}`
        ].join("\n") + "\n"
      );
      return;
    }
    case "analyze": {
      const out2 = requireOut(p);
      const r = analyzeRun(out2);
      if (p.bools.has("json")) {
        process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      } else {
        process.stdout.write(formatGapReport(r, out2) + "\n");
      }
      return;
    }
    case "check": {
      const out2 = requireOut(p);
      let minGrounding;
      const rawMinGrounding = p.values["min-grounding"];
      if (rawMinGrounding !== void 0) {
        minGrounding = Number(rawMinGrounding);
        if (rawMinGrounding.trim() === "" || !Number.isFinite(minGrounding) || minGrounding < 0 || minGrounding > 100) {
          fail("invalid --min-grounding (expected a number between 0 and 100)");
        }
      }
      const res = checkRun(out2, { minGrounding, semantic: p.bools.has("semantic"), allowUnverified: p.bools.has("allow-unverified") });
      if (p.bools.has("json")) {
        process.stdout.write(JSON.stringify(res, null, 2) + "\n");
      } else {
        process.stdout.write(formatCheckReport(res, out2) + "\n");
      }
      if (!res.ok) process.exit(1);
      return;
    }
    case "review": {
      const out2 = requireOut(p);
      if (p.values.apply) {
        const res = applyVerdicts(out2, resolve5(p.values.apply));
        if (p.bools.has("json")) process.stdout.write(JSON.stringify(res, null, 2) + "\n");
        else process.stdout.write(formatReviewReport(res) + "\n");
        if (!res.ok) process.exit(1);
        return;
      }
      let maxReview;
      if (p.values["max-review"] !== void 0) {
        maxReview = Number(p.values["max-review"]);
        if (p.values["max-review"].trim() === "" || !Number.isFinite(maxReview) || maxReview <= 0) fail("invalid --max-review");
      }
      const wl = runReview(out2, { maxReview });
      if (p.bools.has("json")) {
        process.stdout.write(JSON.stringify(wl, null, 2) + "\n");
        return;
      }
      process.stderr.write(
        `construct: ${wl.pairs.length} claim\u2194evidence pair(s) \u2192 ${out2}/VERIFY.md & VERIFY.todo.json
  adjudicate each verdict, save as verdicts.json, then: construct review --apply verdicts.json --out ${out2}
`
      );
      return;
    }
    case "verify": {
      const out2 = requireOut(p);
      const res = verifyRun(out2, {
        appDir: p.values.app ? resolve5(p.values.app) : void 0,
        runTests: p.bools.has("run-tests"),
        strict: p.bools.has("strict")
      });
      if (p.bools.has("json")) {
        process.stdout.write(JSON.stringify(res, null, 2) + "\n");
      } else {
        process.stdout.write(formatVerifyReport(res, out2) + "\n");
      }
      if (!res.ok) process.exit(1);
      return;
    }
    case "status": {
      const out2 = requireOut(p);
      const plan = loadPlan(out2);
      if (p.bools.has("json")) {
        process.stdout.write(JSON.stringify(plan ? readyFrontier(plan) : null, null, 2) + "\n");
        return;
      }
      const has = (rel) => existsSync13(join19(out2, rel)) ? "\u2713" : "\xB7";
      const planLine = plan ? `  \u2713 BUILD-PLAN.json (build: ${plan.tasks.filter((t) => t.status === "done").length}/${plan.tasks.length} tasks done)` : `  \xB7 BUILD-PLAN.json (build plan)`;
      const bs = loadBrainstorm(out2);
      const bsLine = bs ? (() => {
        const c2 = brainstormCounts(bs);
        return `  \u2713 brainstorm.json (${c2.kept} kept \xB7 ${c2.parked} parked \xB7 ${c2.proposed} proposed \xB7 ${c2.rejected} rejected)`;
      })() : `  \xB7 brainstorm.json (optional divergence)`;
      process.stdout.write(
        [
          `construct status: ${out2}`,
          bsLine,
          `  ${has("brief.json")} brief.json`,
          `  ${has("evidence/evidence.json")} evidence/evidence.json (research)`,
          `  ${has("SRD.json")} SRD.json (render)`,
          `  ${has("requirements/FUNCTIONAL.md")} requirements/FUNCTIONAL.md`,
          planLine
        ].join("\n") + "\n"
      );
      return;
    }
    case "orchestrate": {
      const rawOut = (p.values.out || p.values.run || "").trim();
      if (!rawOut) {
        process.stderr.write("construct orchestrate: --out <run> is required (the run folder to orchestrate).\n");
        process.exit(2);
      }
      const runDir = resolve5(rawOut);
      const engineAbs = realpathSync2(fileURLToPath3(import.meta.url));
      if (p.bools.has("list")) {
        if (!existsSync13(runDir)) {
          process.stderr.write(`construct orchestrate: run dir not found: ${runDir}.
`);
          process.exit(2);
        }
        process.stdout.write(JSON.stringify({ phases: listPhases(runDir, engineAbs) }, null, 2) + "\n");
        return;
      }
      const res = orchestrateRun(runDir, engineAbs, {
        phase: p.values.phase,
        adr: p.values.adr,
        eco: p.bools.has("eco")
      });
      if (res.exitCode !== 0) {
        for (const e of res.errors) process.stderr.write(`construct orchestrate: ${e}
`);
        process.exit(res.exitCode);
      }
      process.stderr.write("construct orchestrate: generated\n");
      for (const w of res.written) process.stderr.write(`  ${w}
`);
      for (const n of res.notices) process.stderr.write(`construct orchestrate: note \u2014 ${n}
`);
      const workflows = res.written.filter((w) => w.endsWith(".workflow.mjs"));
      if (workflows.length) {
        process.stderr.write("\n");
        for (const w of workflows) process.stderr.write(`Launch: Workflow({ scriptPath: ${JSON.stringify(w)} })
`);
        process.stderr.write(
          "Then fold the returned fragments in yourself and run the fold command named at the tail of each workflow (you stay the sole writer).\n"
        );
      } else {
        process.stderr.write(`Follow ${join19(runDir, "orchestration", "RUNBOOK.md")} sequentially (the eco path).
`);
      }
      return;
    }
    case "semantic": {
      const action = p.positional[0] ?? "status";
      const r = semanticControl(action);
      process.stdout.write(r.message + "\n");
      if (r.code !== 0) process.exit(r.code);
      return;
    }
  }
}
function loadEvidence4(runDir) {
  const path = join19(runDir, "evidence", "evidence.json");
  if (!existsSync13(path)) return [];
  try {
    const data = JSON.parse(readFileSync11(path, "utf8"));
    return Array.isArray(data) ? data.filter(isEvidenceItem) : [];
  } catch {
    return [];
  }
}
function isEvidenceItem(e) {
  return !!e && typeof e === "object" && typeof e.id === "string" && typeof e.source === "string";
}
function isInvokedDirectly() {
  const argv1 = process.argv[1];
  if (argv1 === void 0) return false;
  const modulePath = fileURLToPath3(import.meta.url);
  try {
    if (realpathSync2(argv1) === realpathSync2(modulePath)) return true;
  } catch {
  }
  return import.meta.url === pathToFileURL(argv1).href;
}
if (isInvokedDirectly()) {
  main().catch((e) => fail(e.message));
}
export {
  parseArgs
};
// "Copyright" and "@license" are already caught by DIRECTIVE_RE.
