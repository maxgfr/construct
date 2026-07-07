#!/usr/bin/env node

// src/cli.ts
import { resolve as resolve3, join as join14 } from "path";
import { existsSync as existsSync9, readFileSync as readFileSync8 } from "fs";
import { pathToFileURL, fileURLToPath as fileURLToPath2 } from "url";
import { realpathSync } from "fs";

// src/types.ts
var VERSION = "1.9.2";
var ALL_SOURCE_KINDS = ["market", "oss", "docs", "so", "issue", "pr"];
var BRIEF_SCHEMA_VERSION = 1;
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
function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
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
  const out = [];
  for (const raw of question.split(/[^A-Za-z0-9_]+/)) {
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if (raw.length < 2) continue;
    if (STOPWORDS.has(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(raw);
  }
  return out;
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
  return base.map((k, i) => ({ k, s: score(k), i })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.k);
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
function normalizeBrief(data, warn = () => {
}) {
  const d = data ?? {};
  const line = (v) => typeof v === "string" ? v.replace(/\s+/g, " ").trim() : void 0;
  const arr = (v, field) => {
    if (v === void 0 || v === null) return [];
    if (!Array.isArray(v)) {
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
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      d.modules.forEach((m, i) => {
        const rawId = line(m?.id);
        const rawName = line(m?.name);
        const id = slugId(rawId || rawName || "");
        if (!id) {
          warn(`modules[${i}] has no usable id or name \u2014 dropped.`);
          return;
        }
        if (seen.has(id)) {
          warn(`modules[${i}]: duplicate module id "${id}" \u2014 dropped.`);
          return;
        }
        seen.add(id);
        const def = { id, name: rawName || id };
        const description = line(m.description);
        if (description) def.description = description;
        const deps = arr(m.dependsOn, `modules[${i}].dependsOn`).map(slugId);
        if (deps.length) def.dependsOn = deps;
        out.push(def);
      });
      for (const m of out) {
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
      if (out.length) modules = out;
    }
  }
  const moduleIds = new Set((modules ?? []).map((m) => m.id));
  const features = [];
  if (d.featureWishlist !== void 0 && !Array.isArray(d.featureWishlist)) {
    warn("featureWishlist is not an array \u2014 ignored.");
  } else if (Array.isArray(d.featureWishlist)) {
    d.featureWishlist.forEach((f, i) => {
      const title = line(f?.title);
      if (!title) {
        warn(`featureWishlist[${i}] has no usable title \u2014 dropped.`);
        return;
      }
      let priority = f.priority;
      if (priority !== void 0 && !PRIORITIES.includes(priority)) {
        warn(`featureWishlist[${i}].priority "${priority}" is not must|should|could \u2014 treated as should.`);
        priority = void 0;
      }
      let module;
      const rawModule = line(f.module);
      if (rawModule) {
        const slug = slugId(rawModule);
        if (moduleIds.has(slug)) module = slug;
        else warn(`featureWishlist[${i}].module "${rawModule}" names no declared module \u2014 dropped.`);
      }
      features.push({ title, priority, notes: line(f.notes), ...module ? { module } : {} });
    });
  }
  let design;
  if (d.design !== void 0 && d.design !== null) {
    if (typeof d.design !== "object" || Array.isArray(d.design)) {
      warn("design is not an object \u2014 ignored.");
    } else {
      const dd = d.design;
      const out = {};
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
      valueProp: line(d.product?.valueProp)
    },
    goals: arr(d.goals, "goals"),
    nonGoals: arr(d.nonGoals, "nonGoals"),
    constraints: {
      budget: line(d.constraints?.budget),
      timeline: line(d.constraints?.timeline),
      team: line(d.constraints?.team),
      compliance: arr(d.constraints?.compliance, "constraints.compliance")
    },
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

// src/research/registry.ts
import { join as join6 } from "path";

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
async function httpJson(method, url, body, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? HTTP_JSON_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: { "content-type": "application/json", accept: "application/json", "user-agent": UA },
      body: body === void 0 ? void 0 : JSON.stringify(body)
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
  const text = isHtml ? htmlToText(res.body) : res.body;
  return { text };
}
function excerptsFromText(text, url, title, source, question, perSource) {
  const lines = text.split("\n");
  const questions = (Array.isArray(question) ? question : [question]).filter((q) => q.trim());
  const kwSets = questions.map((q) => keywords(q).map((k) => k.toLowerCase()));
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].toLowerCase();
    let cov = 0;
    for (const kws of kwSets) {
      let c = 0;
      for (const kw of kws) if (low.includes(kw)) c++;
      if (kws.length && c > cov) cov = c;
    }
    if (cov > 0) hits.push({ idx: i, cov });
  }
  hits.sort((a, b) => b.cov - a.cov || a.idx - b.idx);
  const items = [];
  const ranges = [];
  const take = hits.length ? hits : [{ idx: 0, cov: 0 }];
  const perDoc = Math.min(2, Math.max(1, perSource));
  for (const h of take) {
    if (items.length >= perDoc) break;
    const start = Math.max(0, h.idx - 3);
    const end = Math.min(lines.length, h.idx + 12);
    if (ranges.some((r) => start < r.end && end > r.start)) continue;
    ranges.push({ start, end });
    const snippet = lines.slice(start, end).join("\n").slice(0, 1500);
    if (!snippet.trim()) continue;
    items.push({
      source,
      // Disambiguate the second+ excerpt of one page by its line range, so two
      // excerpts of the same URL don't render identical titles.
      title: items.length === 0 ? title : `${title} (lines ${start + 1}\u2013${end})`,
      ref: url,
      location: `${url}#~${start + 1}`,
      score: Number((h.cov + 1).toFixed(3)),
      snippet,
      url
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
      "No keyless engine returned results. Use your built-in WebSearch to find URLs, then ground them with `construct web --url <url> --out <run>`."
    );
  }
  return { urls: [], via: "none", notes };
}
async function webFetchUrls(urls, question, perSource, source = "market", fetchAll = false) {
  const items = [];
  const notes = [];
  const toFetch = fetchAll ? urls : urls.slice(0, Math.max(1, Math.ceil(perSource / 2)));
  for (const url of toFetch) {
    const { text, note } = await fetchAndExtract(url);
    if (note) notes.push(note);
    if (!text) continue;
    const ex = excerptsFromText(text, url, `${labelFor(source)} \u2014 ${url}`, source, question, perSource);
    items.push(
      ...ex.length ? ex : [
        {
          source,
          title: `${labelFor(source)} \u2014 ${url}`,
          ref: url,
          location: url,
          score: 0,
          snippet: text.slice(0, 800),
          url
        }
      ]
    );
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
import { existsSync as existsSync2, statSync, mkdirSync as mkdirSync2, readdirSync, rmSync } from "fs";
import { resolve, join as join2, basename } from "path";
import { tmpdir } from "os";
function cacheRoot() {
  return join2(tmpdir(), "construct");
}
function resolveRepo(raw) {
  const trimmed = raw.trim();
  if (trimmed) {
    const asPath = resolve(trimmed);
    if (existsSync2(asPath) && statSync(asPath).isDirectory()) {
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
  const dir = join2(cacheRoot(), ref.slug);
  const alreadyCloned = existsSync2(join2(dir, ".git"));
  if (alreadyCloned && !opts.refresh) return dir;
  if (alreadyCloned && opts.refresh) {
    sh("git", ["-C", dir, "fetch", "--depth", "1", "origin"], { timeoutMs: GIT_FETCH_TIMEOUT_MS });
    sh("git", ["-C", dir, "reset", "--hard", "FETCH_HEAD"], { timeoutMs: GIT_RESET_TIMEOUT_MS });
    return dir;
  }
  mkdirSync2(cacheRoot(), { recursive: true });
  const args = ["clone", "--depth", "1", "--filter=blob:none"];
  if (opts.branch) args.push("--branch", opts.branch);
  args.push(ref.cloneUrl, dir);
  const res = sh("git", args, { timeoutMs: GIT_CLONE_TIMEOUT_MS });
  if (!res.ok) {
    if (res.missing) {
      throw new Error(`git is not installed or not on PATH \u2014 cannot clone ${ref.cloneUrl}`);
    }
    if (existsSync2(dir)) {
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
  if (!existsSync2(dir) || readdirSync(dir).length === 0) {
    throw new Error(`clone produced an empty tree at ${dir}`);
  }
  return dir;
}

// src/walk.ts
import { readdirSync as readdirSync2, lstatSync, readFileSync as readFileSync2 } from "fs";
import { join as join3, relative, sep, extname } from "path";
var IGNORE_DIRS = /* @__PURE__ */ new Set([
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
  ".construct",
  "Pods",
  "DerivedData",
  ".terraform",
  "elm-stuff",
  ".dart_tool"
]);
var LOCKFILES = /* @__PURE__ */ new Set([
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
var BINARY_EXT = /* @__PURE__ */ new Set([
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
function walk(root, opts = {}) {
  const maxFileBytes = opts.maxFileBytes ?? 1024 * 1024;
  const maxFiles = opts.maxFiles ?? 2e4;
  const out = [];
  const stack = [root];
  while (stack.length) {
    if (out.length >= maxFiles) break;
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync2(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (out.length >= maxFiles) break;
      const abs = join3(dir, name);
      let st;
      try {
        st = lstatSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (IGNORE_DIRS.has(name)) continue;
        stack.push(abs);
        continue;
      }
      if (!st.isFile()) continue;
      if (st.size > maxFileBytes) continue;
      if (LOCKFILES.has(name.toLowerCase())) continue;
      const ext = extname(name).toLowerCase();
      if (BINARY_EXT.has(ext)) continue;
      if (name.endsWith(".min.js") || name.endsWith(".min.css")) continue;
      out.push({ rel: relative(root, abs).split(sep).join("/"), abs, size: st.size, ext });
    }
  }
  return out;
}
function readText(abs) {
  try {
    const buf = readFileSync2(abs);
    const head = buf.subarray(0, 4096);
    if (head.includes(0)) return "";
    return buf.toString("utf8");
  } catch {
    return "";
  }
}

// src/providers/github.ts
function toItems(raw, kind) {
  return (raw ?? []).filter((it) => it && typeof it === "object").map((it) => {
    const body = String(it.body ?? "").replace(/\r/g, "").trim().slice(0, 1200);
    const labels = (it.labels ?? []).map((l) => typeof l === "string" ? l : l.name).filter(Boolean).join(", ");
    const state = it.draft ? "draft" : it.state;
    return {
      source: kind,
      title: `#${it.number} ${it.title} [${state}]`,
      ref: `${kind}#${it.number}`,
      location: it.html_url,
      score: Number(it.score ?? 0),
      snippet: `state: ${state}` + (labels ? ` \xB7 labels: ${labels}` : "") + ` \xB7 comments: ${it.comments ?? 0} \xB7 updated: ${it.updated_at ?? "?"}

` + (body || "(no description)"),
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
    const i = full.indexOf("/");
    return i > 0 ? { owner: full.slice(0, i), repo: full.slice(i + 1) } : fallback;
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
    let c = 0;
    for (const t of terms) if (hay.includes(t)) c++;
    return c;
  };
  return items.map((it) => ({ it, c: coverage(it), s: it.score })).sort((a, b) => b.c - a.c || b.s - a.s).map((x) => x.it);
}
function uniqueAttempts(lists) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const l of lists) {
    const key = l.join("\0");
    if (l.length && !seen.has(key)) {
      seen.add(key);
      out.push(l);
    }
  }
  return out;
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
        const body = String(it.description ?? "").replace(/\r/g, "").trim().slice(0, 1200);
        return {
          source: kind,
          title: `${marker}${num} ${it.title} [${it.state}]`,
          ref: `${kind}#${num}`,
          location: it.web_url,
          score: 0,
          snippet: `state: ${it.state} \xB7 updated: ${it.updated_at ?? "?"}

${body || "(no description)"}`,
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
      const files = walk(dir);
      const langs = languageHistogram(files).slice(0, 6).map(([e, c]) => `${e}:${c}`).join(", ");
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
async function stackoverflow(question, perSource) {
  const kws = rankedKeywords(question).slice(0, 5).join(" ");
  if (!kws) return { source: "so", items: [], notes: ["No keywords to search StackOverflow."] };
  const q = encodeURIComponent(kws);
  const pat = process.env.STACK_PAT ? `&access_token=${process.env.STACK_PAT}` : "";
  const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${q}&site=stackoverflow&filter=withbody&pagesize=${perSource}${pat}`;
  const r = await httpGet(url, { accept: "application/json" });
  if (!r.ok) {
    return { source: "so", items: [], notes: [`StackOverflow search unavailable (status ${r.status}).`] };
  }
  try {
    const data = JSON.parse(r.body);
    const items = (data.items ?? []).map((it) => {
      const body = htmlToText(String(it.body ?? "")).slice(0, 1200);
      const accepted = it.is_answered ? "answered" : "unanswered";
      return {
        source: "so",
        title: htmlToText(String(it.title ?? "(question)")).slice(0, 160),
        ref: `so:${it.question_id}`,
        location: it.link,
        score: Number(it.score ?? 0),
        snippet: `score: ${it.score ?? 0} \xB7 ${accepted} \xB7 answers: ${it.answer_count ?? 0}` + (it.tags?.length ? ` \xB7 tags: ${it.tags.slice(0, 6).join(", ")}` : "") + `

${body || "(no body)"}`,
        url: it.link,
        meta: { questionId: it.question_id, isAnswered: it.is_answered, answerCount: it.answer_count }
      };
    });
    const notes = data.quota_remaining !== void 0 && data.quota_remaining < 20 ? [`StackExchange anonymous quota low (${data.quota_remaining} left).`] : [];
    if (items.length === 0) notes.push("No StackOverflow questions matched.");
    return { source: "so", items, notes };
  } catch {
    return { source: "so", items: [], notes: ["StackOverflow search returned an unparseable response."] };
  }
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
    const r = await stackoverflow(q, per);
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
import { existsSync as existsSync3 } from "fs";
import { join as join4, dirname } from "path";
import { fileURLToPath } from "url";
var OLLAMA = (process.env.CONSTRUCT_OLLAMA || "http://localhost:11434").replace(/\/$/, "");
var EMBED_MODEL = process.env.CONSTRUCT_EMBED_MODEL || "nomic-embed-text";
function cosine(a, b) {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
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
  const out = [];
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
    out.push({ ...r, items });
  }
  const notes = [`Semantic rescoring via Ollama + ${EMBED_MODEL} (local).`];
  if (failures) notes.push(`${failures} item(s) could not be embedded; ranked last.`);
  return { available: true, results: out, notes };
}
function composeFile() {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const cand of [join4(here, "..", "docker-compose.yml"), join4(here, "docker-compose.yml")]) {
    if (existsSync3(cand)) return cand;
  }
  return join4(here, "..", "docker-compose.yml");
}
function semanticControl(action) {
  if (!["up", "down", "status"].includes(action)) {
    return { message: `construct semantic: unknown action "${action}" (use: up | down | status)`, code: 1 };
  }
  if (!have("docker")) {
    return { message: "construct semantic: docker not found. Install Docker, then retry. See references/semantic-setup.md.", code: 1 };
  }
  const file = composeFile();
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
import { mkdirSync as mkdirSync3, writeFileSync as writeFileSync2 } from "fs";
import { join as join5 } from "path";
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
  const i = SOURCE_ORDER.indexOf(s);
  return i < 0 ? 99 : i;
}
function assignIds(results) {
  const flat = results.flatMap((r) => r.items);
  flat.sort((a, b) => rank(a.source) - rank(b.source) || b.score - a.score || a.ref.localeCompare(b.ref));
  return flat.map((it, i) => ({ id: `E${i + 1}`, ...it }));
}
function renderEvidenceMarkdown(evidence, meta) {
  const out = [];
  out.push(`# Evidence dossier`);
  out.push("");
  out.push(`**Idea:** ${meta.idea}`);
  if (meta.query) out.push(`**Query:** ${meta.query}`);
  out.push(`**Angles:** ${meta.angles.join(", ")} \xB7 **semantic:** ${meta.semantic ? "on" : "off"} \xB7 **built:** ${meta.builtAt}`);
  out.push("");
  out.push(
    `> Ground the SRD's requirements and decisions in this evidence. Cite items by id, e.g. \`[E1]\`. Grounding is advisory \u2014 \`construct check\` reports coverage but never fails on it. Still: prefer a cited claim to a guessed one.`
  );
  out.push("");
  if (evidence.length === 0) {
    out.push(`_No evidence was retrieved. Broaden the query, add angles, or check connectivity._`);
  }
  for (const source of SOURCE_ORDER) {
    const items = evidence.filter((e) => e.source === source);
    if (items.length === 0) continue;
    out.push(`## ${SOURCE_LABEL[source]}`);
    out.push("");
    for (const it of items) {
      out.push(`### [${it.id}] ${it.title}`);
      const meta1 = [`ref: \`${it.ref}\``, it.location ? `loc: \`${it.location}\`` : "", `score: ${it.score}`].filter(Boolean).join(" \xB7 ");
      out.push(meta1);
      if (it.url) out.push(`url: ${it.url}`);
      out.push("");
      out.push("```");
      out.push(it.snippet);
      out.push("```");
      out.push("");
    }
  }
  if (meta.notes.length) {
    out.push(`## Retrieval notes`);
    out.push("");
    for (const n of meta.notes) out.push(`- ${n}`);
    out.push("");
  }
  return out.join("\n");
}
function writeDossier(dir, evidence, meta) {
  mkdirSync3(dir, { recursive: true });
  const evidenceJson = join5(dir, "evidence.json");
  const evidenceMd = join5(dir, "EVIDENCE.md");
  const metaJson = join5(dir, "meta.json");
  writeFileSync2(evidenceJson, JSON.stringify(evidence, null, 2));
  writeFileSync2(evidenceMd, renderEvidenceMarkdown(evidence, meta));
  writeFileSync2(metaJson, JSON.stringify(meta, null, 2));
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
  const evidence = assignIds(capped);
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
  const dir = join6(ctx.runDir, "evidence");
  const paths = writeDossier(dir, evidence, meta);
  return { dir, evidence, meta, paths };
}

// src/render.ts
import { mkdirSync as mkdirSync4, writeFileSync as writeFileSync4, rmSync as rmSync2 } from "fs";
import { join as join9, dirname as dirname2 } from "path";

// src/srd.ts
import { join as join7 } from "path";
function srdManifestPath(runDir) {
  return join7(runDir, "SRD.json");
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
  const out = [];
  for (const x of scored) {
    if (seen.has(x.key)) continue;
    seen.add(x.key);
    out.push(x.id);
    if (out.length >= n) break;
  }
  return out;
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
  const tokens = rest.filter((w) => w.length >= 3 && !FEATURE_VERBS.has(w) && !NON_ENTITY_WORDS.has(w) && !/(?:ed|ing)$/.test(w)).map(singularize).filter((w) => !exclude.has(w));
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
    const name = titleCase(n);
    const refs = perFr.filter((p) => p.tokens.includes(n)).map((p) => p.fr.id);
    return {
      name,
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
  const out = [];
  for (const b of detectBoundaries(brief)) {
    const related = functional.filter((fr) => b.re.test(`${fr.title} ${fr.description}`)).map((fr) => fr.id);
    out.push({
      name: b.name,
      kind: b.kind,
      summary: `Boundary with ${b.label}. Define the contract (operations, data, failure modes) during authoring.`,
      relatedFRs: related
    });
  }
  if (brief.product.users?.length) {
    out.push({
      name: "Web App",
      kind: "ui",
      summary: `The primary user-facing surface through which ${brief.product.users.join(", ")} use the product.`,
      relatedFRs: functional.map((f) => f.id)
    });
  }
  for (const fr of functional) {
    fr.interfaces = out.filter((i) => i.relatedFRs.includes(fr.id)).map((i) => i.name);
  }
  return out;
}
function buildSRD(brief, evidence, opts) {
  const level = opts.level;
  const productName = brief.product.name || titleFromIdea(brief.idea);
  const compliance = brief.constraints.compliance ?? [];
  const selfHost = /self[- ]?host|privacy|gdpr|own (your|the) data/i.test(`${brief.idea} ${brief.product.valueProp ?? ""}`) || compliance.length > 0;
  const timeGoal = timeTokenFromGoals(brief.goals);
  const categories = [];
  for (const c of REQUIRED_NFR[level]) if (!categories.includes(c)) categories.push(c);
  for (const c of brief.nfrPriorities) {
    const k = c.toLowerCase().trim();
    if (k && !categories.includes(k)) categories.push(k);
  }
  const nonFunctional = categories.map((cat, i) => {
    const t = nfrFor(cat);
    const metric = specialiseMetric(cat, t.metric, { compliance, selfHost, timeGoal, budget: brief.constraints.budget });
    const statement = specialiseStatement(cat, t.statement, { compliance, selfHost });
    return {
      id: `NFR-${pad3(i + 1)}`,
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
  adrs.forEach((a, i) => a.id = pad4(i + 1));
  const stackAdrId = adrs[0].id;
  const dataAdr = adrs.find((a) => /persistence|integration/i.test(a.title));
  const privacyAdr = adrs.find((a) => /self-hosting|data-ownership/i.test(a.title));
  const functional = brief.featureWishlist.map((f, i) => {
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
      id: `FR-${pad3(i + 1)}`,
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
  const competitors = brief.competitors.map((name) => {
    const ev = matchEvidence(name, evidence, 2, ["market"]);
    return { name, note: noteFrom(ev, evById) || `Comparable product / alternative to "${productName}".`, evidence: ev };
  });
  const ossByKey = /* @__PURE__ */ new Map();
  const keyOf = (s) => {
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
    ossByKey.set(keyOf(seed), {
      name: label,
      url: ref.webUrl ?? (/^https?:/.test(seed) ? seed : void 0),
      note: noteFrom(ev, evById) || "Seed OSS project mined for prior art.",
      evidence: ev
    });
  }
  for (const e of evidence.filter((x) => x.source === "oss")) {
    const k = keyOf(e.ref);
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
      row.components = design.components.filter((c) => c.relatedFRs.includes(fr.id)).map((c) => c.name);
      row.screens = design.screens.filter((s) => s.relatedFRs.includes(fr.id)).map((s) => s.name);
    }
    if (fr.module) row.module = fr.module;
    return row;
  });
  const referenced = /* @__PURE__ */ new Set();
  for (const fr of functional) fr.rationaleEvidence.forEach((id) => referenced.add(id));
  for (const n of nonFunctional) n.rationaleEvidence.forEach((id) => referenced.add(id));
  for (const a of adrs) a.evidence.forEach((id) => referenced.add(id));
  for (const c of competitors) c.evidence.forEach((id) => referenced.add(id));
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
  const out = [];
  if (/self[- ]?host|privac|gdpr|own (your|the) data|no account/i.test(hay)) {
    out.push("Privacy by default \u2014 the UI never surfaces or transmits data the user did not choose to share.");
  }
  if (/fast|speed|sub-?second|latenc|instant|under \d/i.test(hay)) {
    out.push("Perceived performance first \u2014 optimistic UI, skeletons over spinners, immediate feedback on every action.");
  }
  out.push("Accessible to everyone \u2014 every flow works with the keyboard and assistive technology, by construction.");
  out.push("Consistency over novelty \u2014 reuse tokens and components before inventing new ones.");
  out.push("Progressive disclosure \u2014 show the essential first; reveal complexity only on demand.");
  out.push("Clear over clever \u2014 plain language, obvious affordances, honest empty and error states.");
  return out.slice(0, 5);
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
  return DESIGN_TOKEN_CATEGORIES.flatMap((c) => byCategory[c]);
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
  const out = [];
  for (const def of COMPONENT_DEFS) {
    const relatedFRs = functional.filter((fr) => def.re.test(`${fr.title} ${fr.description}`)).map((fr) => fr.id);
    if (relatedFRs.length === 0) continue;
    out.push({ name: def.name, purpose: def.purpose, states: [...COMPONENT_STATES], relatedFRs, evidence: [] });
  }
  return out;
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
  return defs.map((d, i) => ({
    id: `A11Y-${pad3(i + 1)}`,
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
  const c = cat.toLowerCase();
  if ((c === "performance" || c === "usability") && ctx.timeGoal) {
    return `${base} Honour the product goal: ${ctx.timeGoal}.`;
  }
  if ((c === "privacy" || c === "security") && ctx.compliance.length) {
    return `${base} Comply with: ${ctx.compliance.join(", ")}.`;
  }
  if (c === "cost" && ctx.budget) {
    return `${base} Stay within the stated budget: ${ctx.budget}.`;
  }
  return base;
}
function specialiseStatement(cat, base, ctx) {
  const c = cat.toLowerCase();
  if ((c === "privacy" || c === "security") && ctx.selfHost) {
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
  const out = [];
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
    out.push({ title: g.title, outcome: g.outcome, frIds: frs.map((f) => f.id), risks });
  }
  if (out.length === 0) out.push({ title: "M1 \u2014 Initial build", outcome: "Deliver the first usable version.", frIds: functional.map((f) => f.id), risks: [] });
  return out;
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
function contextProse(name, brief) {
  const actors = brief.product.users?.length ? brief.product.users : ["users"];
  const boundaries = detectBoundaries(brief).map((b) => b.label);
  const stack = brief.candidateTech.length ? ` Built on ${brief.candidateTech.join(", ")}.` : "";
  const ext = boundaries.length ? ` It integrates with: ${boundaries.join("; ")}.` : "";
  return `"${name}" serves ${actors.join(", ")}.${stack}${ext} Each integration boundary is owned by an ADR and detailed in INTERFACES.md during authoring.`;
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
  const out = [];
  const re = /\[(E\d+)\]/g;
  let m;
  while (m = re.exec(s)) out.push(m[1]);
  return out;
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
import { existsSync as existsSync4, readFileSync as readFileSync3, writeFileSync as writeFileSync3 } from "fs";
import { join as join8 } from "path";
function buildPlanPath(runDir) {
  return join8(runDir, "BUILD-PLAN.json");
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
  ordered.forEach(({ frId, milestone }, i) => {
    const fr = frById.get(frId);
    const dependsOn = ["T-000"];
    if (fr.entities.length) {
      for (let j = 0; j < i; j++) {
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
      id: `T-${pad32(i + 1)}`,
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
var STATUSES = ["todo", "in-progress", "done"];
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
      status: STATUSES.includes(old.status) ? old.status : t.status
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
  if (!existsSync4(path)) return null;
  try {
    const data = JSON.parse(readFileSync3(path, "utf8"));
    return data && typeof data === "object" && Array.isArray(data.tasks) ? data : null;
  } catch {
    return null;
  }
}
function writePlan(runDir, plan) {
  const path = buildPlanPath(runDir);
  writeFileSync3(path, JSON.stringify(plan, null, 2) + "\n");
  return path;
}

// src/templates.ts
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
  return items.map((i) => `- ${i}`).join("\n");
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
  const out = [`## ${fr.id} \u2014 ${fr.title} _(${fr.priority})_${cite(fr.rationaleEvidence)}`, ``];
  out.push(fr.description);
  out.push(``);
  out.push(`**Acceptance criteria:**`);
  for (const a of fr.acceptance) {
    out.push(`- **Given** ${a.given} **When** ${a.when} **Then** ${a.then}`);
  }
  out.push(``);
  const trace = [
    `NFRs: ${fr.nfrs.length ? fr.nfrs.join(", ") : "\u2014"}`,
    `entities: ${fr.entities.length ? fr.entities.join(", ") : "\u2014"}`,
    `interfaces: ${fr.interfaces.length ? fr.interfaces.join(", ") : "\u2014"}`
  ].join(" \xB7 ");
  out.push(`_Traceability \u2014 ${trace}_`);
  out.push(``);
  return out;
}
function renderFunctional(srd) {
  if (srd.modules?.length) return renderFunctionalIndex(srd);
  return renderFunctionalFull(srd);
}
function renderFunctionalFull(srd) {
  const out = [`# Functional requirements`, ``];
  if (!srd.functional.length) out.push(`_No functional requirements defined._`, ``);
  for (const fr of srd.functional) out.push(...renderFRBlock(fr));
  return out.join("\n");
}
function renderFunctionalIndex(srd) {
  const out = [`# Functional requirements`, ``];
  out.push(`_This SRD is partitioned into module PRDs \u2014 the full requirement blocks (description,`);
  out.push(`acceptance criteria, traceability) live in each module's PRD under [../prd/](../prd/README.md)._`, ``);
  out.push(`| Requirement | Title | Priority | Module | PRD |`);
  out.push(`|---|---|---|---|---|`);
  for (const fr of srd.functional) {
    const link = fr.module ? `[../prd/${fr.module}/PRD.md](../prd/${fr.module}/PRD.md)` : "\u2014";
    out.push(`| ${fr.id} | ${cell(fr.title)} | ${fr.priority} | ${fr.module ?? "\u2014"} | ${link} |`);
  }
  out.push(``);
  return out.join("\n");
}
function renderModulePRD(srd, m) {
  const frs = srd.functional.filter((f) => f.module === m.id);
  const others = (srd.modules ?? []).filter((o) => o.id !== m.id);
  const frIdSet = new Set(frs.map((f) => f.id));
  const out = [`# PRD \u2014 ${m.name}`, ``];
  out.push(`_Module \`${m.id}\` \xB7 ${srd.product.name} \xB7 ${frs.length} requirement(s)_`, ``);
  if (m.description) out.push(m.description, ``);
  out.push(
    `**Global context:** [Vision](../../00-overview/VISION.md) \xB7 [Scope](../../00-overview/SCOPE.md) \xB7 [Non-functional requirements](../../requirements/NON-FUNCTIONAL.md) \xB7 [Data model](../../architecture/DATA-MODEL.md) \xB7 [Interfaces](../../architecture/INTERFACES.md) \xB7 [Traceability](../../TRACEABILITY.md)`,
    ``
  );
  out.push(`## Scope`, ``);
  out.push(`**In scope:** ${frs.length ? frs.map((f) => f.id).join(", ") : "\u2014"}.`, ``);
  if (others.length) {
    out.push(`**Out of scope** (owned by other modules): ${others.map((o) => `[${o.name}](../${o.id}/PRD.md)`).join(", ")}.`, ``);
  }
  out.push(`## Requirements`, ``);
  if (!frs.length) out.push(`_No requirements assigned to this module._`, ``);
  for (const fr of frs) out.push(...renderFRBlock(fr));
  const nfrIds = new Set(frs.flatMap((f) => f.nfrs));
  const nfrs = srd.nonFunctional.filter((n) => nfrIds.has(n.id));
  out.push(`## Non-functional requirements`, ``);
  if (nfrs.length) {
    out.push(`_Applying to this module's requirements \u2014 full statements in [NON-FUNCTIONAL.md](../../requirements/NON-FUNCTIONAL.md)._`, ``);
    out.push(`| NFR | Category | Metric |`, `|---|---|---|`);
    for (const n of nfrs) out.push(`| ${n.id} | ${cell(n.category)} | ${cell(n.metric ?? "\u2014")} |`);
  } else {
    out.push(`_None linked._`);
  }
  out.push(``);
  const entities = srd.architecture.dataModel.filter((e) => e.referencedByFRs.some((id) => frIdSet.has(id)));
  out.push(`## Data model (module slice)`, ``);
  if (entities.length) {
    out.push(`| Entity | Referenced by |`, `|---|---|`);
    for (const e of entities) out.push(`| ${cell(e.name)} | ${e.referencedByFRs.filter((id) => frIdSet.has(id)).join(", ")} |`);
  } else {
    out.push(`_No entities touch this module yet._`);
  }
  out.push(``);
  const ifaces = srd.architecture.interfaces.filter((i) => i.relatedFRs.some((id) => frIdSet.has(id)));
  out.push(`## Interfaces (module slice)`, ``);
  if (ifaces.length) {
    out.push(`| Interface | Kind | Related |`, `|---|---|---|`);
    for (const i of ifaces) out.push(`| ${cell(i.name)} | ${i.kind} | ${i.relatedFRs.filter((id) => frIdSet.has(id)).join(", ")} |`);
  } else {
    out.push(`_No interfaces touch this module yet._`);
  }
  out.push(``);
  out.push(`## Dependencies`, ``);
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
  if (!declared.length && !shared.length) out.push(`_None._`);
  if (declared.length) out.push(`- **Declared:** depends on ${declared.join(", ")}.`);
  for (const s of shared) out.push(`- **Derived (shared data):** ${s}.`);
  out.push(``);
  return out.join("\n");
}
function renderModulePrdIndex(srd) {
  const out = [`# Module PRDs`, ``];
  out.push(`One PRD per product module, rendered from SRD.json. Cross-module docs (vision, scope,`);
  out.push(`NFRs, architecture, ADRs, traceability) live at the SRD root; the cross-module requirement`);
  out.push(`index is [../requirements/FUNCTIONAL.md](../requirements/FUNCTIONAL.md).`, ``);
  out.push(`| Module | PRD | Requirements | Depends on |`);
  out.push(`|---|---|---|---|`);
  for (const m of srd.modules ?? []) {
    out.push(`| ${cell(m.name)} | [${m.id}/PRD.md](${m.id}/PRD.md) | ${m.frIds.join(", ") || "\u2014"} | ${m.dependsOn.join(", ") || "\u2014"} |`);
  }
  out.push(``);
  return out.join("\n");
}
function renderFeaturePRD(fr, srd) {
  const out = [`# PRD ${fr.id} \u2014 ${fr.title}${cite(fr.rationaleEvidence)}`, ``];
  out.push(`_Priority: ${fr.priority}_ \xB7 _Product: ${srd.product.name}_`, ``);
  out.push(`## Context`, ``, srd.product.problem, ``);
  out.push(`## Feature`, ``, fr.description, ``);
  out.push(`## Acceptance criteria`, ``);
  for (const a of fr.acceptance) {
    out.push(`- **Given** ${a.given} **When** ${a.when} **Then** ${a.then}`);
  }
  out.push(``, `## Non-functional requirements`, ``);
  if (!fr.nfrs.length) out.push(`_None linked._`);
  for (const id of fr.nfrs) {
    const nfr = srd.nonFunctional.find((n) => n.id === id);
    out.push(nfr ? `- **${nfr.id}** (${nfr.category}): ${nfr.statement}${nfr.metric ? ` \u2014 metric: ${nfr.metric}` : ""}` : `- **${id}**`);
  }
  out.push(``, `## Data & interfaces`, ``);
  out.push(`- Entities: ${fr.entities.length ? fr.entities.join(", ") : "\u2014"}`);
  out.push(`- Interfaces: ${fr.interfaces.length ? fr.interfaces.join(", ") : "\u2014"}`);
  out.push(``, `## Grounding`, ``);
  out.push(
    fr.rationaleEvidence.length ? `Evidence:${cite(fr.rationaleEvidence)} \u2014 see ../../evidence/EVIDENCE.md.` : `_Ungrounded \u2014 see the grounding report (construct check)._`
  );
  out.push(``);
  return out.join("\n");
}
function renderPRDIndex(srd) {
  const out = [`# PRDs \u2014 one per functional requirement`, ``];
  out.push(`Rendered from SRD.json by \`construct render --prd\`. The canonical, always-current`);
  out.push(`requirement list is [../FUNCTIONAL.md](../FUNCTIONAL.md); re-render after editing.`, ``);
  out.push(`| PRD | Priority | Title |`);
  out.push(`|---|---|---|`);
  for (const fr of srd.functional) {
    const file = `PRD-${fr.id}-${slugTitle(fr.title)}.md`;
    out.push(`| [${file}](${file}) | ${cell(fr.priority)} | ${cell(fr.title)} |`);
  }
  out.push(``);
  return out.join("\n");
}
function renderNonFunctional(srd) {
  const out = [`# Non-functional requirements`, ``];
  if (!srd.nonFunctional.length) out.push(`_No non-functional requirements defined._`, ``);
  for (const n of srd.nonFunctional) {
    out.push(`## ${n.id} \u2014 ${n.category}${cite(n.rationaleEvidence)}`);
    out.push(``);
    out.push(n.statement);
    if (n.metric) out.push(``, `- **Metric:** ${n.metric}`);
    out.push(``);
  }
  return out.join("\n");
}
function renderSystemContext(srd) {
  return [`# System context`, ``, srd.architecture.context, ``].join("\n");
}
function renderDataModel(srd) {
  const out = [`# Data model`, ``];
  const entities = srd.architecture.dataModel;
  if (!entities.length) {
    out.push(`_No entities defined yet. Enrich during authoring: list entities, their attributes, and which functional requirements reference each._`, ``);
    return out.join("\n");
  }
  out.push(`_Seeded by inference from the brief \u2014 verify each entity and extend attributes during authoring._`, ``);
  for (const e of entities) {
    out.push(`## ${e.name}`);
    out.push(``);
    if (e.attributes.length) {
      out.push(`| Attribute | Type |`, `|---|---|`);
      for (const a of e.attributes) out.push(`| ${cell(a.name)} | ${cell(a.type)} |`);
    }
    out.push(``, `_Referenced by: ${e.referencedByFRs.length ? e.referencedByFRs.join(", ") : "\u2014"}_`, ``);
  }
  return out.join("\n");
}
function renderInterfaces(srd) {
  const out = [`# Interfaces`, ``];
  const ifaces = srd.architecture.interfaces;
  if (!ifaces.length) {
    out.push(`_No interfaces defined yet. Enrich during authoring: list the API/event/UI/CLI surfaces and the functional requirements each serves._`, ``);
    return out.join("\n");
  }
  out.push(`_Seeded by inference from the brief \u2014 verify each surface and define its contract during authoring._`, ``);
  for (const i of ifaces) {
    out.push(`## ${i.name} _(${i.kind})_`, ``, i.summary, ``, `_Related: ${i.relatedFRs.length ? i.relatedFRs.join(", ") : "\u2014"}_`, ``);
  }
  return out.join("\n");
}
function renderADR(adr) {
  const out = [
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
  if (adr.alternatives) out.push(`## Alternatives considered`, adr.alternatives, ``);
  return out.join("\n");
}
function renderLandscape(srd) {
  const out = [`# Competitive landscape`, ``, `## Competitors`, ``];
  if (srd.competitive.competitors.length) {
    out.push(`| Product | Note | Evidence |`, `|---|---|---|`);
    for (const c of srd.competitive.competitors) {
      const ev = c.evidence.length ? c.evidence.map((id) => `[${id}]`).join("") : "_ungrounded_";
      out.push(`| ${cell(c.name)} | ${cell(c.note)} | ${ev} |`);
    }
  } else {
    out.push(`_No competitors captured. Use the market research angle to discover them._`);
  }
  out.push(``, `## Comparable open-source projects`, ``);
  if (srd.competitive.oss.length) {
    out.push(`| Project | Note | Evidence |`, `|---|---|---|`);
    for (const o of srd.competitive.oss) {
      const name = o.url ? `[${cell(o.name)}](${o.url})` : cell(o.name);
      const ev = o.evidence.length ? o.evidence.map((id) => `[${id}]`).join("") : "_ungrounded_";
      out.push(`| ${name} | ${cell(o.note)} | ${ev} |`);
    }
  } else {
    out.push(`_No OSS prior art captured. Use the oss research angle to mine comparable projects._`);
  }
  out.push(``);
  return out.join("\n");
}
function renderBuildPlan(srd) {
  const out = [`# Build plan`, ``];
  for (const m of srd.buildPlan) {
    out.push(`## ${m.title}`, ``, m.outcome, ``);
    out.push(`- **Requirements:** ${m.frIds.length ? m.frIds.join(", ") : "\u2014"}`);
    if (m.risks.length) {
      out.push(`- **Risks:**`);
      for (const r of m.risks) out.push(`  - ${r}`);
    }
    out.push(``);
  }
  return out.join("\n");
}
function renderTraceability(srd) {
  const design = !!srd.design;
  const modules = !!srd.modules?.length;
  const cols = ["Requirement", ...modules ? ["Module"] : [], "NFRs", "ADRs", "Entities", "Interfaces", ...design ? ["Components", "Screens"] : []];
  const out = [`# Traceability matrix`, ``, `| ${cols.join(" | ")} |`, `|${cols.map(() => "---").join("|")}|`];
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
    out.push(`| ${cells.join(" | ")} |`);
  }
  out.push(``);
  return out.join("\n");
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
  const out = [`# Design tokens`, ``, `_${DESIGN_TOKENS_SEEDED_BANNER}_`, ``];
  const cats = [...new Set(ds.tokens.map((t) => t.category))];
  for (const cat of cats) {
    const toks = ds.tokens.filter((t) => t.category === cat);
    out.push(`## ${cell(cat)}`, ``, `| Token | Value | Notes |`, `|---|---|---|`);
    for (const t of toks) out.push(`| ${cell(t.name)} | ${cell(t.value)} | ${cell(t.note ?? "")} |`);
    out.push(``);
  }
  out.push("> The machine-readable token set is in `design/design-tokens.json`.", ``);
  return out.join("\n");
}
function renderDesignTokensJson(ds) {
  const obj = {};
  for (const t of ds.tokens) {
    (obj[t.category] ??= {})[t.name] = t.value;
  }
  return JSON.stringify(obj, null, 2);
}
function renderComponents(ds) {
  const out = [`# Components`, ``];
  if (!ds.components.length) {
    out.push(`_No components defined yet. Enrich during authoring: name each component, its states and the requirements it realises._`, ``);
    return out.join("\n");
  }
  out.push(`_Seeded from the functional requirements \u2014 verify each component and its states during authoring._`, ``);
  for (const c of ds.components) {
    out.push(`## ${c.name}${cite(c.evidence)}`, ``, c.purpose, ``);
    out.push(`- **States:** ${c.states.join(", ") || "\u2014"}`);
    out.push(`- **Realises:** ${c.relatedFRs.length ? c.relatedFRs.join(", ") : "\u2014"}`, ``);
  }
  return out.join("\n");
}
function renderScreens(ds) {
  const out = [`# Screens & flows`, ``, `## Screens`, ``];
  if (ds.screens.length) {
    out.push(`| Screen | Purpose | Requirements |`, `|---|---|---|`);
    for (const s of ds.screens) out.push(`| ${cell(s.name)} | ${cell(s.purpose)} | ${s.relatedFRs.join(", ") || "\u2014"} |`);
  } else {
    out.push(`_No screens defined._`);
  }
  out.push(``, `## User flows`, ``);
  if (ds.flows.length) {
    for (const f of ds.flows) {
      out.push(`### ${f.name}${f.frIds.length ? ` _(${f.frIds.join(", ")})_` : ""}`, ``);
      f.steps.forEach((step, i) => out.push(`${i + 1}. ${step}`));
      out.push(``);
    }
  } else {
    out.push(`_No user flows defined._`);
  }
  return out.join("\n");
}
function renderAccessibility(ds) {
  const a = ds.accessibility;
  const out = [`# Accessibility`, ``, `**Target standard:** ${a.standard}`, ``];
  if (!a.requirements.length) {
    out.push(`_No accessibility requirements defined._`, ``);
    return out.join("\n");
  }
  for (const r of a.requirements) {
    out.push(`## ${r.id} \u2014 ${r.statement}`, ``, `**Acceptance criteria:**`);
    for (const c of r.acceptance) out.push(`- **Given** ${c.given} **When** ${c.when} **Then** ${c.then}`);
    out.push(``);
  }
  return out.join("\n");
}
function renderMergeBundle(srd) {
  const parts = [
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
  return parts.join("\n");
}

// src/render.ts
function writeFile(out, rel, content, files) {
  const abs = join9(out, rel);
  mkdirSync4(dirname2(abs), { recursive: true });
  writeFileSync4(abs, content.endsWith("\n") ? content : content + "\n");
  files.push(rel);
}
function renderSRD(brief, evidence, opts) {
  const wantDesign = opts.level === "complex" && !opts.noDesign;
  const srd = buildSRD(brief, evidence, { level: opts.level, generatedAt: opts.generatedAt, design: wantDesign });
  const files = [];
  const out = opts.out;
  rmSync2(join9(out, "architecture", "decisions"), { recursive: true, force: true });
  rmSync2(join9(out, "design"), { recursive: true, force: true });
  rmSync2(join9(out, "prd"), { recursive: true, force: true });
  writeFile(out, "00-overview/VISION.md", renderVision(srd), files);
  writeFile(out, "00-overview/SCOPE.md", renderScope(srd), files);
  writeFile(out, "requirements/FUNCTIONAL.md", renderFunctional(srd), files);
  rmSync2(join9(out, "requirements", "prd"), { recursive: true, force: true });
  if (opts.prd) {
    for (const fr of srd.functional) {
      writeFile(out, `requirements/prd/PRD-${fr.id}-${slugTitle(fr.title)}.md`, renderFeaturePRD(fr, srd), files);
    }
    writeFile(out, "requirements/prd/README.md", renderPRDIndex(srd), files);
  }
  writeFile(out, "requirements/NON-FUNCTIONAL.md", renderNonFunctional(srd), files);
  writeFile(out, "architecture/SYSTEM-CONTEXT.md", renderSystemContext(srd), files);
  writeFile(out, "architecture/DATA-MODEL.md", renderDataModel(srd), files);
  writeFile(out, "architecture/INTERFACES.md", renderInterfaces(srd), files);
  for (const adr of srd.architecture.adrs) {
    writeFile(out, `architecture/decisions/${adr.id}-${slugTitle(adr.title)}.md`, renderADR(adr), files);
  }
  writeFile(out, "competitive/LANDSCAPE.md", renderLandscape(srd), files);
  writeFile(out, "BUILD-PLAN.md", renderBuildPlan(srd), files);
  writePlan(out, mergePlan(loadPlan(out), derivePlan(srd)));
  files.push("BUILD-PLAN.json");
  writeFile(out, "TRACEABILITY.md", renderTraceability(srd), files);
  if (srd.modules?.length) {
    for (const m of srd.modules) {
      writeFile(out, `prd/${m.id}/PRD.md`, renderModulePRD(srd, m), files);
    }
    writeFile(out, "prd/README.md", renderModulePrdIndex(srd), files);
  }
  if (srd.design) {
    writeFile(out, "design/PRINCIPLES.md", renderDesignPrinciples(srd.design), files);
    writeFile(out, "design/DESIGN-TOKENS.md", renderDesignTokens(srd.design), files);
    writeFile(out, "design/design-tokens.json", renderDesignTokensJson(srd.design), files);
    writeFile(out, "design/COMPONENTS.md", renderComponents(srd.design), files);
    writeFile(out, "design/SCREENS.md", renderScreens(srd.design), files);
    writeFile(out, "design/ACCESSIBILITY.md", renderAccessibility(srd.design), files);
  }
  writeFileSync4(srdManifestPath(out), JSON.stringify(srd, null, 2) + "\n");
  files.push("SRD.json");
  if (opts.merge) {
    writeFile(out, "SRD.md", renderMergeBundle(srd), files);
  } else {
    rmSync2(join9(out, "SRD.md"), { force: true });
  }
  return { dir: out, files, srd };
}

// src/check.ts
import { existsSync as existsSync5, readFileSync as readFileSync4, readdirSync as readdirSync3, statSync as statSync2 } from "fs";
import { join as join10, relative as relative2, sep as sep2 } from "path";
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
  const out = [];
  const stack = [runDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync3(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const abs = join10(dir, name);
      let st;
      try {
        st = statSync2(abs);
      } catch {
        continue;
      }
      const rel = relative2(runDir, abs).split(sep2).join("/");
      if (st.isDirectory()) {
        if (rel === "evidence" || name === ".construct") continue;
        stack.push(abs);
      } else if (name.endsWith(".md")) {
        out.push(rel);
      }
    }
  }
  return out.sort();
}
function loadEvidence(runDir) {
  const path = join10(runDir, "evidence", "evidence.json");
  if (!existsSync5(path)) {
    return { evidence: [], note: `No evidence/evidence.json \u2014 grounding coverage is 0 (run \`construct research\` to ground the SRD).` };
  }
  try {
    const data = JSON.parse(readFileSync4(path, "utf8"));
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
  srd.competitive.competitors.forEach((c) => note(c.evidence));
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
function applySemantic(runDir, result) {
  const p = join10(runDir, "VERIFY.json");
  if (!existsSync5(p)) {
    result.structural.warnings.push("--semantic: no VERIFY.json \u2014 run `construct review` then `review --apply <verdicts.json>` first; semantic gate skipped.");
    return;
  }
  try {
    const sem = JSON.parse(readFileSync4(p, "utf8"));
    result.semantic = sem;
    if (!sem.ok) result.ok = false;
    if (sem.unadjudicated?.length) {
      result.structural.warnings.push(`${sem.unadjudicated.length} claim(s) not fully adjudicated by review.`);
    }
  } catch (e) {
    result.structural.warnings.push(`--semantic: VERIFY.json is unreadable (${e.message}).`);
  }
}
function checkDesign(runDir, srd, errors, warnings) {
  const ds = srd.design;
  if (!ds) return;
  for (const f of DESIGN_REQUIRED_FILES) {
    if (!existsSync5(join10(runDir, f))) errors.push(`Missing required design file: ${f} (re-render at --level complex).`);
  }
  const frIds = new Set(srd.functional.map((f) => f.id));
  if (ds.components.length === 0) errors.push("Design system has no components \u2014 a complex SRD's design must name its UI components.");
  for (const c of ds.components) {
    for (const id of c.relatedFRs) if (!frIds.has(id)) errors.push(`Component "${c.name}" references unknown requirement "${id}".`);
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
  const tokenDoc = join10(runDir, "design", "DESIGN-TOKENS.md");
  if (existsSync5(tokenDoc) && readFileSync4(tokenDoc, "utf8").includes(DESIGN_TOKENS_SEEDED_BANNER)) {
    warnings.push("Design tokens are still seeded defaults \u2014 replace them with the product's real brand values (see references/design-system-authoring.md).");
  }
}
function checkModules(runDir, srd, errors, warnings) {
  const mods = srd.modules;
  if (!mods?.length) return;
  const moduleIds = new Set(mods.map((m) => m.id));
  if (!existsSync5(join10(runDir, "prd", "README.md"))) {
    errors.push(`Missing required module-PRD index: prd/README.md (re-render).`);
  }
  for (const m of mods) {
    if (!existsSync5(join10(runDir, "prd", m.id, "PRD.md"))) {
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
    if (!existsSync5(join10(runDir, f))) errors.push(`Missing required file: ${f} (run \`construct render --out ${runDir}\`).`);
  }
  const manifest = srdManifestPath(runDir);
  if (!existsSync5(manifest)) {
    errors.push(`No SRD.json in ${runDir} \u2014 render the SRD first.`);
    return { ok: false, structural: { ok: false, errors, warnings }, coverage: emptyCoverage };
  }
  let srd;
  try {
    srd = JSON.parse(readFileSync4(manifest, "utf8"));
  } catch (e) {
    errors.push(`SRD.json is unreadable: ${e.message}`);
    return { ok: false, structural: { ok: false, errors, warnings }, coverage: emptyCoverage };
  }
  for (const rel of mdFiles(runDir)) {
    const text = readFileSync4(join10(runDir, rel), "utf8");
    if (DECISION_RE.test(text)) errors.push(`Unresolved decision (\u{1F9E0}) in ${rel} \u2014 resolve it before the SRD is complete.`);
    else if (PLACEHOLDER_RE.test(text)) warnings.push(`Possible leftover placeholder (TODO/TBD/FIXME) in ${rel} \u2014 confirm it is intentional.`);
  }
  if (srd.openQuestions.length) {
    errors.push(`${srd.openQuestions.length} open decision(s) unresolved in the brief \u2014 resolve them (into ADRs/requirements) before the SRD is complete.`);
  }
  const entityNames = new Set(srd.architecture.dataModel.map((e) => e.name));
  const interfaceNames = new Set(srd.architecture.interfaces.map((i) => i.name));
  const nfrIds = new Set(srd.nonFunctional.map((n) => n.id));
  for (const fr of srd.functional) {
    if (!fr.acceptance.length) errors.push(`${fr.id} has no acceptance criteria.`);
    for (const e of fr.entities) if (!entityNames.has(e)) errors.push(`${fr.id} references unknown entity "${e}".`);
    for (const i of fr.interfaces) if (!interfaceNames.has(i)) errors.push(`${fr.id} references unknown interface "${i}".`);
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
    warnings.push(
      `${templatedThen} acceptance criteria are still renderer-templated \u2014 sharpen them into observable, bounded outcomes (see references/acceptance-criteria.md).`
    );
  }
  const templatedMetrics = srd.nonFunctional.filter((n) => n.metric && TEMPLATED_METRIC_RE.test(n.metric)).length;
  if (templatedMetrics) {
    warnings.push(`${templatedMetrics} NFR metric(s) are still generic placeholders \u2014 set measurable targets (see references/acceptance-criteria.md).`);
  }
  const { evidence, note } = loadEvidence(runDir);
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
  if (opts.semantic) applySemantic(runDir, result);
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
  const c = r.coverage;
  const advisory = r.grounding ? "advisory detail" : "advisory \u2014 does not fail the build";
  lines.push(`Grounding coverage (${advisory}):`);
  lines.push(`  functional:     ${c.frGrounded}/${c.frTotal} grounded (${pct(c.frGrounded, c.frTotal)})`);
  lines.push(`  non-functional: ${c.nfrGrounded}/${c.nfrTotal} grounded (${pct(c.nfrGrounded, c.nfrTotal)})`);
  lines.push(`  decisions:      ${c.adrGrounded}/${c.adrTotal} grounded (${pct(c.adrGrounded, c.adrTotal)})`);
  lines.push(`  citations: ${c.citations.length} \xB7 resolved: ${c.resolved.length} \xB7 dangling: ${c.dangling.length} \xB7 uncited evidence: ${c.uncited.length}`);
  if (r.grounding) {
    const g = r.grounding;
    lines.push(``);
    lines.push(`Grounding gate (opt-in --min-grounding ${g.threshold}):`);
    lines.push(
      g.ok ? `  \u2713 PASS \u2014 ${g.actualPct}% of groundable claims are grounded (threshold ${g.threshold}%)` : `  \u2717 FAIL \u2014 ${g.actualPct}% of groundable claims are grounded, below the ${g.threshold}% threshold`
    );
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
import { existsSync as existsSync6, readFileSync as readFileSync5 } from "fs";
import { join as join11 } from "path";
function loadEvidence2(runDir) {
  const path = join11(runDir, "evidence", "evidence.json");
  if (!existsSync6(path)) return [];
  try {
    const data = JSON.parse(readFileSync5(path, "utf8"));
    return Array.isArray(data) ? data.filter(
      (e) => !!e && typeof e === "object" && typeof e.id === "string" && typeof e.source === "string"
    ) : [];
  } catch {
    return [];
  }
}
function loadMetaNotes(runDir) {
  const path = join11(runDir, "evidence", "meta.json");
  if (!existsSync6(path)) return [];
  try {
    const meta = JSON.parse(readFileSync5(path, "utf8"));
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
  const evidence = loadEvidence2(runDir);
  const notes = loadMetaNotes(runDir);
  const drill = (cmd, q) => `construct ${cmd} --out ${runDir} --q "${q.replace(/"/g, "'")}"`;
  const bySource = {};
  for (const e of evidence) bySource[e.source] = (bySource[e.source] ?? 0) + 1;
  if (evidence.length === 0) {
    notes.push("No evidence dossier \u2014 run `construct research` first; everything below will render ungrounded.");
  }
  const suggestions = [];
  const ungroundedFeatures = brief.featureWishlist.filter((f) => matchEvidence(featureText(f), evidence, 1, GROUND_REQUIREMENT).length === 0).map((f) => ({ title: f.title, priority: f.priority ?? "should" }));
  for (const f of ungroundedFeatures) suggestions.push(drill("web", f.title));
  const unmatchedCompetitors = brief.competitors.filter((name) => matchEvidence(name, evidence, 1, ["market"]).length === 0);
  for (const name of unmatchedCompetitors) suggestions.push(drill("web", name));
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
  for (const c of r.unmatchedCompetitors) lines.push(`  \u2717 competitor: "${c}" never surfaced in market evidence`);
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
import { existsSync as existsSync7, readFileSync as readFileSync6 } from "fs";
import { isAbsolute, join as join12, resolve as resolve2 } from "path";
var TEST_FILE_RE = /\.(test|spec)\.[^./]+$|_(test|spec)\.[^./]+$|(^|\/)test_[^/]+\.[^./]+$/i;
var TEST_SUFFIX_RE = /(^|\/)[^/]*[A-Z]\w*Tests?\.(java|kt|kts|cs|scala|groovy)$/;
var TEST_DIR_RE = /(^|\/)(tests?|__tests__|spec|specs|e2e)\//i;
function isTestFile(rel) {
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
  if (!existsSync7(planPath)) {
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
  if (!existsSync7(manifest)) {
    errors.push(`No SRD.json in ${runDir} \u2014 the plan cannot be verified against a missing SRD.`);
    return { ok: false, errors, warnings, frTestCoverage };
  }
  let srd;
  try {
    srd = JSON.parse(readFileSync6(manifest, "utf8"));
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
  const appDir = rawApp ? isAbsolute(rawApp) ? rawApp : resolve2(runDir, rawApp) : void 0;
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
  if (!existsSync7(appDir)) {
    errors.push(`App directory does not exist: ${appDir}.`);
    return { ok: false, errors, warnings, frTestCoverage };
  }
  for (const t of doneTasks) {
    for (const rel of [...t.artifacts, ...t.tests]) {
      if (!existsSync7(join12(appDir, rel))) errors.push(`${t.id} is done but its declared file is missing: ${rel}.`);
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
    const testFiles = walk(appDir).filter((f) => isTestFile(f.rel));
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
    for (const c of r.frTestCoverage) {
      lines.push(`  ${c.testFiles.length ? "\u2713" : "\xB7"} ${c.fr} (${c.priority}): ${c.testFiles.length ? c.testFiles.join(", ") : "no test references it"}`);
    }
  }
  if (r.commandResults) {
    lines.push(``);
    lines.push(`Commands (--run-tests):`);
    for (const c of r.commandResults) lines.push(`  ${c.ok ? "\u2713" : "\u2717"} ${c.command} (exit ${c.exitCode})`);
  }
  return lines.join("\n");
}

// src/review.ts
import { existsSync as existsSync8, readFileSync as readFileSync7, writeFileSync as writeFileSync5 } from "fs";
import { join as join13 } from "path";
var REVIEW_MAX = 40;
var VALID_VERDICTS = ["supported", "partial", "refuted", "unsupported"];
function loadEvidence3(path) {
  if (!existsSync8(path)) return [];
  try {
    const data = JSON.parse(readFileSync7(path, "utf8"));
    return Array.isArray(data) ? data.filter(
      (e) => !!e && typeof e === "object" && typeof e.id === "string" && typeof e.source === "string"
    ) : [];
  } catch {
    return [];
  }
}
function srdClaims(srd) {
  const out = [];
  for (const f of srd.functional) {
    const ac = f.acceptance.map((a) => `${a.given} / ${a.when} / ${a.then}`).join("; ");
    out.push({ id: f.id, kind: "FR", text: `${f.title}: ${f.description}${ac ? " \u2014 " + ac : ""}`, ev: f.rationaleEvidence });
  }
  for (const n of srd.nonFunctional) {
    out.push({ id: n.id, kind: "NFR", text: `${n.category}: ${n.statement}${n.metric ? ` (${n.metric})` : ""}`, ev: n.rationaleEvidence });
  }
  for (const a of srd.architecture.adrs) {
    out.push({ id: `ADR-${a.id}`, kind: "ADR", text: `${a.title}: ${a.decision}`, ev: a.evidence });
  }
  srd.competitive.competitors.forEach((c, i) => out.push({ id: `COMP-${i + 1}`, kind: "competitor", text: `${c.name}: ${c.note}`, ev: c.evidence }));
  srd.competitive.oss.forEach((o, i) => out.push({ id: `OSS-${i + 1}`, kind: "oss", text: `${o.name}: ${o.note}`, ev: o.evidence }));
  return out;
}
function claimDigest(snippet, claim, cap = 600) {
  if (snippet.length <= cap) return snippet;
  const kws = keywords(claim).map((k) => k.toLowerCase());
  if (!kws.length) return snippet.slice(0, cap);
  const step = 150;
  let best = 0;
  let bestCov = -1;
  for (let start = 0; start === 0 || start + cap / 2 < snippet.length; start += step) {
    const w = snippet.slice(start, start + cap).toLowerCase();
    let cov = 0;
    for (const kw of kws) if (w.includes(kw)) cov++;
    if (cov >= bestCov) {
      bestCov = cov;
      best = start;
    }
  }
  return (best > 0 ? "\u2026 " : "") + snippet.slice(best, best + cap).trim();
}
function runReview(runDir, opts = {}) {
  const manifest = srdManifestPath(runDir);
  if (!existsSync8(manifest)) throw new Error(`No SRD.json in ${runDir} \u2014 render the SRD first (construct render).`);
  let srd;
  try {
    srd = JSON.parse(readFileSync7(manifest, "utf8"));
  } catch (e) {
    throw new Error(`SRD.json is unreadable: ${e.message}`);
  }
  const evidence = loadEvidence3(join13(runDir, "evidence", "evidence.json"));
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const pairs = [];
  for (const c of srdClaims(srd)) {
    for (const id of [...new Set(c.ev)]) {
      const e = byId.get(id);
      if (!e) continue;
      pairs.push({
        claimId: c.id,
        kind: c.kind,
        claim: c.text.trim().slice(0, 400),
        evidenceId: id,
        source: e.source,
        digest: claimDigest(e.snippet || e.title || e.ref, c.text),
        score: e.score
      });
    }
  }
  const max = Math.max(1, Math.floor(opts.maxReview ?? REVIEW_MAX));
  const kept = pairs.length > max ? pairs.slice().sort((a, b) => b.score - a.score || a.claimId.localeCompare(b.claimId) || a.evidenceId.localeCompare(b.evidenceId)).slice(0, max) : pairs;
  const worklist = { run: runDir, pairs: kept.map(({ score, ...rest }) => rest) };
  const todo = {
    run: runDir,
    pairs: worklist.pairs.map((p) => ({ ...p, verdict: null, note: "" }))
  };
  writeFileSync5(join13(runDir, "VERIFY.todo.json"), JSON.stringify(todo, null, 2));
  writeFileSync5(join13(runDir, "VERIFY.md"), renderWorklistMd(worklist, pairs.length, kept.length));
  return worklist;
}
function renderWorklistMd(wl, total, kept) {
  const out = [];
  out.push(`# Claim-support review worklist`);
  out.push("");
  out.push(
    `For each pair, open the cited evidence and judge whether it **supports** the claim. In \`VERIFY.todo.json\`, set each \`verdict\` to one of supported \xB7 partial \xB7 refuted \xB7 unsupported, add a short \`note\`, save it (e.g. as \`verdicts.json\`), then run \`construct review --apply verdicts.json --out <run>\`.`
  );
  if (kept < total) out.push(`
_Showing ${kept} of ${total} pair(s) \u2014 capped at the highest-score evidence._`);
  out.push("");
  for (const p of wl.pairs) {
    out.push(`## ${p.claimId} \xB7 ${p.evidenceId} (${p.source})`);
    out.push(`**Claim (${p.kind}):** ${p.claim}`);
    out.push(`**Cited evidence:** ${p.digest}`);
    out.push(`**Verdict:** _____ \xB7 **Note:** _____`);
    out.push("");
  }
  return out.join("\n");
}
function applyVerdicts(runDir, verdictsPath) {
  if (!existsSync8(verdictsPath)) throw new Error(`verdicts file not found: ${verdictsPath}`);
  let raw;
  try {
    raw = JSON.parse(readFileSync7(verdictsPath, "utf8"));
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
      const todo = JSON.parse(readFileSync7(todoPath, "utf8"));
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
  writeFileSync5(join13(runDir, "VERIFY.json"), JSON.stringify({ ...result, verdicts }, null, 2));
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

// src/cli.ts
var HELP = `construct v${VERSION}
Turn a product idea into a grounded, buildable SRD suite. Interview \u2192 research
(market / OSS prior-art / tech feasibility / optional local semantic) \u2192 render \u2192
check. Grounding is advisory; structural completeness is enforced.

Usage:
  construct init     --idea "<one-liner>" [--out <dir>]
  construct research --out <run> [--angles market,oss,tech,semantic] [--q "<focus>"] [--url <u,...>] [--semantic]
  construct analyze  --out <run> [--json]
  construct web|oss|tech|so --out <run> [--q "<focus>"] [--url <u,...>] [--seeds <u,...>]
  construct render   --out <run> [--level light|complex] [--merge] [--no-design] [--prd]
  construct check    --out <run> [--min-grounding <0-100>] [--semantic] [--json]
  construct review   --out <run> [--apply <verdicts.json>] [--max-review N] [--json]
  construct verify   --out <run> [--app <dir>] [--run-tests] [--strict] [--json]
  construct status   --out <run> [--json]
  construct semantic up|down|status

Commands:
  init       Scaffold a run folder + brief.json (fill it via the interview).
  research   Gather evidence across angles into <run>/evidence (a dossier).
  analyze    Report what is thin (gaps that will render ungrounded) + drill commands.
  web        Drill the market/web angle.       oss   Drill OSS prior-art mining.
  tech       Drill tech docs + StackOverflow.   so    Drill StackOverflow only.
  render     Render the SRD tree + SRD.json from brief.json + the dossier.
             At --level complex this also renders a design-system subtree
             (design/: principles, tokens, components, screens, accessibility);
             --no-design opts out. --prd also emits requirements/prd/ \u2014 one
             standalone PRD per functional requirement + an index.
  check      Hard structural gate + advisory grounding-coverage report.
             --semantic also folds in the review verdicts (fails on a claim its
             cited evidence does not support).
  review     Emit a claim\u2194evidence worklist for adversarial support-checking,
             then (--apply <verdicts.json>) gate on refuted/unsupported claims.
             Mechanizes the manual adversarial-review of SRD grounding.
  verify     Check a built app against BUILD-PLAN.json + the SRD (static by
             default; --run-tests executes the declared test commands).
  status     Show what exists in a run (brief / evidence / SRD / check).
  semantic   Manage the optional local Docker stack (Qdrant + Ollama + SearXNG).

Options:
  --idea <s>           One-line product idea                     (required for init)
  --out <dir>          The run folder                            (required for most)
  --angles <list>      market,oss,tech,semantic   (default: market,oss,tech)
  --q, --question <s>  Focus the research/drill on a sub-question
  --url <u,...>        For 'web': specific page(s) to fetch + ground
                       For 'research': pin page(s) into the dossier (market angle)
  --seeds <u,...>      OSS repo URLs to mine (overrides brief.ossSeeds)
  --docs-url <u,...>   For 'tech'/'research': docs page(s) to fetch + ground directly
  --level <l>          light | complex                           (default: light)
  --min-grounding <n>  For 'check': fail unless \u2265 n% of claims are grounded (opt-in)
  --semantic           For 'check': fold in the 'review' claim-support verdicts
  --apply <file>       For 'review': consume an adjudicated verdicts file + gate
  --app <dir>          For 'verify': the built app directory (default: conventions.appDir)
  --run-tests          For 'verify': also execute testCommand + per-task verify commands
  --strict             For 'verify': a built must-have FR with no referencing test FAILS
  --web-engine <e>     auto | searxng | ddg | claude             (default: auto)
  --per-source <n>     Max evidence items kept per source        (default: 6)
  --merge              Also emit a single-file SRD.md bundle
  --no-design          For 'render': skip the design-system subtree (complex only)
  --prd                For 'render': also emit one PRD file per FR (requirements/prd/)
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
var COMMANDS = /* @__PURE__ */ new Set(["init", "research", "analyze", "web", "oss", "tech", "so", "render", "check", "verify", "review", "status", "semantic"]);
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
  "max-review"
]);
var BOOL_FLAGS = /* @__PURE__ */ new Set(["semantic", "merge", "json", "refresh", "run-tests", "strict", "no-design", "prd"]);
function fail(message) {
  process.stderr.write(`construct: ${message}
`);
  process.exit(1);
}
function oneOf(name, value, allowed) {
  if (!allowed.includes(value)) {
    fail(`invalid --${name} "${value}" (expected: ${allowed.join(", ")})`);
  }
  return value;
}
function parseArgs(argv) {
  if (argv.length === 0) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  if (argv[0] === "-h" || argv[0] === "--help") {
    process.stdout.write(HELP);
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
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(HELP);
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
        const next = argv[i + 1];
        if (next === void 0 || next.startsWith("--")) {
          fail(`missing value for --${key}`);
        }
        value = next;
        i++;
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
  const out = [];
  for (const t of s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)) {
    if (!ALL_ANGLES.includes(t)) fail(`unknown angle "${t}" (use: market,oss,tech,semantic)`);
    if (!out.includes(t)) out.push(t);
  }
  if (out.length === 0) fail("--angles resolved to nothing");
  return out;
}
function csv(s) {
  return (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
}
function requireOut(p) {
  const out = (p.values.out || p.values.run || "").trim();
  if (!out) fail("missing --out <run>");
  return resolve3(out);
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
  const evidence = assignIds(results);
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
      const out = p.values.out ? resolve3(p.values.out) : resolve3(slugify(idea) || "construct-run");
      const brief = initBrief(idea, (/* @__PURE__ */ new Date()).toISOString());
      const path = saveBrief(out, brief);
      process.stderr.write(
        [
          `construct: scaffolded a run at ${out}`,
          `  brief:  ${path}`,
          `  next:   fill brief.json via the interview (product, users, goals, features,`,
          `          constraints, candidateTech, competitors, ossSeeds), then:`,
          `          construct research --out ${out}`
        ].join("\n") + "\n"
      );
      return;
    }
    case "research": {
      const out = requireOut(p);
      const angles = p.values.angles ? parseAngles(p.values.angles) : DEFAULT_ANGLES;
      const ctx = buildResearchContext(p, out, angles);
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
          `  next:     construct render --out ${out} [--level complex]`
        ].join("\n") + "\n"
      );
      return;
    }
    case "web":
    case "oss":
    case "tech":
    case "so": {
      const out = requireOut(p);
      const ctx = buildResearchContext(p, out, [p.command === "web" ? "market" : p.command]);
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
      const out = requireOut(p);
      const brief = loadBrief(out, warnBrief);
      const v = validateBrief(brief);
      if (!v.ok) fail(`brief is incomplete:
${v.errors.map((e) => "  - " + e).join("\n")}`);
      const level = oneOf("level", p.values.level ?? "light", ["light", "complex"]);
      const evidence = loadEvidence4(out);
      const r = renderSRD(brief, evidence, {
        level,
        out,
        merge: p.bools.has("merge"),
        noDesign: p.bools.has("no-design"),
        prd: p.bools.has("prd"),
        generatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      const design = r.srd.design;
      process.stderr.write(
        [
          `construct: rendered the ${level} SRD for "${brief.idea}"`,
          `  files:    ${r.files.length} (${r.srd.functional.length} FR \xB7 ${r.srd.nonFunctional.length} NFR \xB7 ${r.srd.architecture.adrs.length} ADR)`,
          ...design ? [`  design:   ${design.components.length} components \xB7 ${design.tokens.length} tokens \xB7 a11y ${design.accessibility.standard}`] : [],
          `  manifest: ${join14(out, "SRD.json")}`,
          `  next:     construct check --out ${out}`
        ].join("\n") + "\n"
      );
      return;
    }
    case "analyze": {
      const out = requireOut(p);
      const r = analyzeRun(out);
      if (p.bools.has("json")) {
        process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      } else {
        process.stdout.write(formatGapReport(r, out) + "\n");
      }
      return;
    }
    case "check": {
      const out = requireOut(p);
      let minGrounding;
      const rawMinGrounding = p.values["min-grounding"];
      if (rawMinGrounding !== void 0) {
        minGrounding = Number(rawMinGrounding);
        if (rawMinGrounding.trim() === "" || !Number.isFinite(minGrounding) || minGrounding < 0 || minGrounding > 100) {
          fail("invalid --min-grounding (expected a number between 0 and 100)");
        }
      }
      const res = checkRun(out, { minGrounding, semantic: p.bools.has("semantic") });
      if (p.bools.has("json")) {
        process.stdout.write(JSON.stringify(res, null, 2) + "\n");
      } else {
        process.stdout.write(formatCheckReport(res, out) + "\n");
      }
      if (!res.ok) process.exit(1);
      return;
    }
    case "review": {
      const out = requireOut(p);
      if (p.values.apply) {
        const res = applyVerdicts(out, resolve3(p.values.apply));
        if (p.bools.has("json")) process.stdout.write(JSON.stringify(res, null, 2) + "\n");
        else process.stdout.write(formatReviewReport(res) + "\n");
        if (!res.ok) process.exit(1);
        return;
      }
      const maxReview = p.values["max-review"] ? Number(p.values["max-review"]) : REVIEW_MAX;
      if (!Number.isFinite(maxReview) || maxReview <= 0) fail("invalid --max-review");
      const wl = runReview(out, { maxReview });
      if (p.bools.has("json")) {
        process.stdout.write(JSON.stringify(wl, null, 2) + "\n");
        return;
      }
      process.stderr.write(
        `construct: ${wl.pairs.length} claim\u2194evidence pair(s) \u2192 ${out}/VERIFY.md & VERIFY.todo.json
  adjudicate each verdict, save as verdicts.json, then: construct review --apply verdicts.json --out ${out}
`
      );
      return;
    }
    case "verify": {
      const out = requireOut(p);
      const res = verifyRun(out, {
        appDir: p.values.app ? resolve3(p.values.app) : void 0,
        runTests: p.bools.has("run-tests"),
        strict: p.bools.has("strict")
      });
      if (p.bools.has("json")) {
        process.stdout.write(JSON.stringify(res, null, 2) + "\n");
      } else {
        process.stdout.write(formatVerifyReport(res, out) + "\n");
      }
      if (!res.ok) process.exit(1);
      return;
    }
    case "status": {
      const out = requireOut(p);
      const plan = loadPlan(out);
      if (p.bools.has("json")) {
        process.stdout.write(JSON.stringify(plan ? readyFrontier(plan) : null, null, 2) + "\n");
        return;
      }
      const has = (rel) => existsSync9(join14(out, rel)) ? "\u2713" : "\xB7";
      const planLine = plan ? `  \u2713 BUILD-PLAN.json (build: ${plan.tasks.filter((t) => t.status === "done").length}/${plan.tasks.length} tasks done)` : `  \xB7 BUILD-PLAN.json (build plan)`;
      process.stdout.write(
        [
          `construct status: ${out}`,
          `  ${has("brief.json")} brief.json`,
          `  ${has("evidence/evidence.json")} evidence/evidence.json (research)`,
          `  ${has("SRD.json")} SRD.json (render)`,
          `  ${has("requirements/FUNCTIONAL.md")} requirements/FUNCTIONAL.md`,
          planLine
        ].join("\n") + "\n"
      );
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
  const path = join14(runDir, "evidence", "evidence.json");
  if (!existsSync9(path)) return [];
  try {
    const data = JSON.parse(readFileSync8(path, "utf8"));
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
  const modulePath = fileURLToPath2(import.meta.url);
  try {
    if (realpathSync(argv1) === realpathSync(modulePath)) return true;
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
