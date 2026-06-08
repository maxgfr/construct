#!/usr/bin/env node

// src/cli.ts
import { resolve as resolve2, join as join10 } from "path";
import { existsSync as existsSync5, readFileSync as readFileSync4 } from "fs";
import { pathToFileURL, fileURLToPath as fileURLToPath2 } from "url";
import { realpathSync } from "fs";

// src/types.ts
var VERSION = "1.0.0";
var BRIEF_SCHEMA_VERSION = 1;
var SRD_SCHEMA_VERSION = 1;

// src/util.ts
import { spawnSync } from "child_process";
function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
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
function loadBrief(runDir) {
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
  return normalizeBrief(data);
}
function normalizeBrief(data) {
  const d = data ?? {};
  const arr = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  return {
    schemaVersion: typeof d.schemaVersion === "number" ? d.schemaVersion : BRIEF_SCHEMA_VERSION,
    idea: typeof d.idea === "string" ? d.idea : "",
    product: {
      name: d.product?.name,
      problem: d.product?.problem,
      users: arr(d.product?.users),
      valueProp: d.product?.valueProp
    },
    goals: arr(d.goals),
    nonGoals: arr(d.nonGoals),
    constraints: {
      budget: d.constraints?.budget,
      timeline: d.constraints?.timeline,
      team: d.constraints?.team,
      compliance: arr(d.constraints?.compliance)
    },
    candidateTech: arr(d.candidateTech),
    competitors: arr(d.competitors),
    ossSeeds: arr(d.ossSeeds),
    featureWishlist: Array.isArray(d.featureWishlist) ? d.featureWishlist.filter((f) => !!f && typeof f.title === "string").map((f) => ({
      title: f.title,
      priority: f.priority,
      notes: f.notes
    })) : [],
    nfrPriorities: arr(d.nfrPriorities),
    openQuestions: arr(d.openQuestions),
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
  return { ok: errors.length === 0, errors, warnings };
}

// src/research/registry.ts
import { join as join6 } from "path";

// src/research/fetch.ts
var UA = "construct/0.x (+https://github.com/maxgfr/construct)";
var BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
async function httpGet(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 2e4);
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
      contentType: res.headers.get("content-type") ?? ""
    };
  } catch (e) {
    return { ok: false, status: 0, body: "", contentType: "", error: e.message };
  } finally {
    clearTimeout(t);
  }
}
async function httpJson(method, url, body, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 3e4);
  try {
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: { "content-type": "application/json", accept: "application/json", "user-agent": UA },
      body: body === void 0 ? void 0 : JSON.stringify(body)
    });
    const text = await res.text();
    let data = void 0;
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
var ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&mdash;": "\u2014",
  "&ndash;": "\u2013",
  "&hellip;": "\u2026",
  "&copy;": "\xA9"
};
function htmlToText(html) {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<(script|style|noscript|head|nav|footer|svg)[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<\/(p|div|section|article|li|tr|h[1-6]|pre|blockquote|br)>/gi, "\n");
  s = s.replace(/<(br|hr)\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&#(\d+);/g, (_m, n) => {
    try {
      return String.fromCodePoint(Number(n));
    } catch {
      return " ";
    }
  });
  for (const [k, v] of Object.entries(ENTITIES)) s = s.split(k).join(v);
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
  const kws = keywords(question).map((k) => k.toLowerCase());
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].toLowerCase();
    let cov = 0;
    for (const kw of kws) if (low.includes(kw)) cov++;
    if (cov > 0) hits.push({ idx: i, cov });
  }
  hits.sort((a, b) => b.cov - a.cov || a.idx - b.idx);
  const items = [];
  const seen = /* @__PURE__ */ new Set();
  const take = hits.length ? hits : [{ idx: 0, cov: 0 }];
  const perDoc = Math.min(2, Math.max(1, perSource));
  for (const h of take) {
    if (items.length >= perDoc) break;
    const block = Math.floor(h.idx / 12);
    if (seen.has(block)) continue;
    seen.add(block);
    const start = Math.max(0, h.idx - 3);
    const end = Math.min(lines.length, h.idx + 12);
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
  const r = await httpGet(url, { accept: "application/json", timeoutMs: 8e3 });
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
  const r = await httpGet(url, { accept: "text/html", timeoutMs: 12e3 });
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
    if (s && s.length) return { urls: s, via: "searxng", notes };
    if (engine === "searxng") notes.push(`SearXNG unreachable at ${SEARXNG_BASE}. Run \`construct semantic up\`.`);
  }
  if (engine === "ddg" || engine === "auto") {
    const d = await viaDuckDuckGo(query2, n);
    if (d && d.length) return { urls: d, via: "duckduckgo", notes };
    if (engine === "ddg") notes.push("DuckDuckGo returned no results.");
  }
  if (engine === "claude" || engine === "auto") {
    notes.push(
      "No keyless engine returned results. Use your built-in WebSearch to find URLs, then ground them with `construct web --url <url> --out <run>`."
    );
  }
  return { urls: [], via: "none", notes };
}
async function webFetchUrls(urls, question, perSource, source = "market") {
  const items = [];
  const notes = [];
  for (const url of urls.slice(0, Math.max(1, Math.ceil(perSource / 2)))) {
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
  if (!query2) return [{ source: "market", items: [], notes: ["No idea/competitors to search the market for."] }];
  const { urls, via, notes } = await discover(query2, ctx.webEngine, ctx.perSource);
  if (urls.length === 0) {
    return [{ source: "market", items: [], notes: [`Market discovery via ${via}.`, ...notes] }];
  }
  const fetched = await webFetchUrls(urls, query2, ctx.perSource, "market");
  return [
    {
      source: "market",
      items: fetched.items,
      notes: [`Market discovery via ${via} for "${query2}".`, ...notes, ...fetched.notes]
    }
  ];
}

// src/clone.ts
import { existsSync as existsSync2, statSync, mkdirSync as mkdirSync2, readdirSync } from "fs";
import { resolve, join as join2, basename } from "path";
import { tmpdir } from "os";
function cacheRoot() {
  return join2(tmpdir(), "construct");
}
function resolveRepo(raw) {
  const trimmed = raw.trim();
  const asPath = resolve(trimmed);
  if (existsSync2(asPath) && statSync(asPath).isDirectory()) {
    return {
      raw: trimmed,
      host: "local",
      isLocal: true,
      slug: "local-" + slugify(basename(asPath) + "-" + asPath)
    };
  }
  let host;
  let path;
  const scp = /^git@([^:]+):(.+)$/.exec(trimmed);
  const url = /^https?:\/\/([^/]+)\/(.+)$/.exec(trimmed);
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
  } else {
    host = "github.com";
    path = trimmed;
  }
  path = path.replace(/\.git$/, "").replace(/\/+$/, "");
  const segments = path.split("/").filter(Boolean);
  const repo = segments.length ? segments[segments.length - 1] : void 0;
  const owner = segments.length > 1 ? segments.slice(0, -1).join("/") : void 0;
  const cloneUrl = /^https?:\/\//.test(trimmed) || scp ? trimmed : `https://${host}/${path}.git`;
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
    sh("git", ["-C", dir, "fetch", "--depth", "1", "origin"], { timeoutMs: 18e4 });
    sh("git", ["-C", dir, "reset", "--hard", "FETCH_HEAD"], { timeoutMs: 6e4 });
    return dir;
  }
  mkdirSync2(cacheRoot(), { recursive: true });
  const args = ["clone", "--depth", "1", "--filter=blob:none"];
  if (opts.branch) args.push("--branch", opts.branch);
  args.push(ref.cloneUrl, dir);
  const res = sh("git", args, { timeoutMs: 3e5 });
  if (!res.ok) {
    const fallback = sh(
      "git",
      ["clone", "--depth", "1", ...opts.branch ? ["--branch", opts.branch] : [], ref.cloneUrl, dir],
      { timeoutMs: 3e5 }
    );
    if (!fallback.ok) {
      throw new Error(
        `git clone failed for ${ref.cloneUrl}
${(res.stderr || fallback.stderr).trim()}`
      );
    }
  }
  if (!existsSync2(dir) || readdirSync(dir).length === 0) {
    throw new Error(`clone produced an empty tree at ${dir}`);
  }
  return dir;
}

// src/walk.ts
import { readdirSync as readdirSync2, statSync as statSync2, readFileSync as readFileSync2 } from "fs";
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
      const abs = join3(dir, name);
      let st;
      try {
        st = statSync2(abs);
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
  return (raw ?? []).map((it) => {
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
var canonCache = /* @__PURE__ */ new Map();
async function canonicalRepo(ref) {
  const fallback = { owner: ref.owner, repo: ref.repo };
  if (!/github/i.test(ref.host)) return fallback;
  const key = `${ref.owner}/${ref.repo}`;
  const cached = canonCache.get(key);
  if (cached) return cached;
  let resolved = fallback;
  const parse = (full) => {
    const i = full.indexOf("/");
    return i > 0 ? { owner: full.slice(0, i), repo: full.slice(i + 1) } : fallback;
  };
  if (have("gh")) {
    const r = sh("gh", ["api", `repos/${ref.owner}/${ref.repo}`, "--jq", ".full_name"]);
    if (r.ok && r.stdout.includes("/")) resolved = parse(r.stdout.trim());
  } else {
    const r = await httpGet(`https://api.github.com/repos/${ref.owner}/${ref.repo}`, { accept: "application/vnd.github+json" });
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
  if (have("gh")) {
    const res = sh("gh", [
      "api",
      "-X",
      "GET",
      "search/issues",
      "-f",
      `q=${q}`,
      "-f",
      `per_page=${perSource}`,
      "-f",
      "sort=updated",
      "-f",
      "order=desc"
    ]);
    if (res.ok) {
      try {
        return { items: toItems(JSON.parse(res.stdout).items, kind) };
      } catch {
      }
    }
  }
  const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=${perSource}&sort=updated&order=desc`;
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
    const proj = encodeURIComponent(`${ref.owner}/${ref.repo}`);
    const path = kind === "issue" ? "issues" : "merge_requests";
    const search = encodeURIComponent(rankedKeywords(question).slice(0, 4).join(" "));
    const url = `https://${ref.host}/api/v4/projects/${proj}/${path}?search=${search}&per_page=${perSource}&order_by=updated_at&sort=desc`;
    const r = await httpGet(url, { accept: "application/json" });
    if (!r.ok) {
      return { items: [], notes: [`GitLab ${kind} search unavailable (status ${r.status}).`] };
    }
    try {
      const arr = JSON.parse(r.body);
      if (!Array.isArray(arr)) return { items: [], notes: [`GitLab ${kind} search returned no array.`] };
      const marker = kind === "issue" ? "#" : "!";
      const items = arr.map((it) => {
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
      notes: [
        `No public ${kind} API for host "${ref.host}". The code was cloned and indexed; issues/PRs are not retrievable for this host.`
      ]
    };
  }
};

// src/providers/registry.ts
var PROVIDERS = [github, gitlab];
function providerFor(host) {
  return PROVIDERS.find((p) => p.matches(host)) ?? generic;
}

// src/research/oss.ts
var REPO_URL_RE = /^https?:\/\/(github|gitlab)\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/i;
function canonicalRepoUrl(url) {
  const m = /^(https?:\/\/(?:github|gitlab)\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)/i.exec(url);
  return m ? m[1].replace(/\.git$/, "") : void 0;
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
  let seeds = ctx.brief.ossSeeds.filter((s) => REPO_URL_RE.test(s) || /^[\w.-]+\/[\w.-]+$/.test(s));
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
  const techs = ctx.brief.candidateTech.slice(0, 3);
  const ideaKw = ctx.query || ctx.brief.idea;
  const docItems = [];
  const docNotes = [];
  for (const tech of techs) {
    const q = `${tech} official documentation`;
    const { urls, via, notes } = await discover(q, ctx.webEngine, ctx.perSource);
    docNotes.push(`Docs discovery for "${tech}" via ${via}.`, ...notes);
    if (!urls.length) continue;
    const fetched = await webFetchUrls(urls.slice(0, 1), `${tech} ${ideaKw}`, ctx.perSource, "docs");
    docItems.push(...fetched.items);
    docNotes.push(...fetched.notes);
  }
  if (techs.length === 0) docNotes.push("No candidate technologies in the brief \u2014 nothing to ground feasibility against.");
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
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
async function reachable(base, path = "/") {
  const r = await httpGet(base + path, { timeoutMs: 2500 });
  return r.ok;
}
async function embed(text) {
  const r = await httpJson(
    "POST",
    `${OLLAMA}/api/embeddings`,
    { model: EMBED_MODEL, prompt: text.slice(0, 4e3) },
    { timeoutMs: 6e4 }
  );
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
  for (const r of results) {
    const items = [];
    for (const it of r.items) {
      const v = await embed(`${it.title}
${it.snippet}`);
      const score = v ? Number(cosine(qv, v).toFixed(4)) : it.score;
      items.push({ ...it, score, meta: { ...it.meta ?? {}, semantic: true } });
    }
    out.push({ ...r, items });
  }
  return { available: true, results: out, notes: [`Semantic rescoring via Ollama + ${EMBED_MODEL} (local).`] };
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
    const r = sh("docker", ["compose", "-f", file, "--profile", "all", "down"], { timeoutMs: 12e4 });
    return { message: r.ok ? "construct semantic: stack stopped." : `construct semantic: down failed.
${r.stderr}`, code: r.ok ? 0 : 1 };
  }
  if (action === "status") {
    const r = sh("docker", ["compose", "-f", file, "ps"], { timeoutMs: 3e4 });
    return { message: r.ok ? r.stdout || "construct semantic: no services running." : `construct semantic: status failed.
${r.stderr}`, code: 0 };
  }
  const up = sh("docker", ["compose", "-f", file, "--profile", "all", "up", "-d"], { timeoutMs: 3e5 });
  if (!up.ok) return { message: `construct semantic: up failed.
${up.stderr}`, code: 1 };
  const pull = sh("docker", ["compose", "-f", file, "exec", "-T", "ollama", "ollama", "pull", EMBED_MODEL], { timeoutMs: 6e5 });
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
  flat.sort(
    (a, b) => rank(a.source) - rank(b.source) || b.score - a.score || a.ref.localeCompare(b.ref)
  );
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
      const meta1 = [
        `ref: \`${it.ref}\``,
        it.location ? `loc: \`${it.location}\`` : "",
        `score: ${it.score}`
      ].filter(Boolean).join(" \xB7 ");
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
import { mkdirSync as mkdirSync4, writeFileSync as writeFileSync3, rmSync } from "fs";
import { join as join8, dirname as dirname2 } from "path";

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
    return { id: e.id, url: e.url ?? "", cov, ratio: cov / kws.length, score: e.score };
  }).filter((x) => x.cov >= need && x.ratio >= ratioFloor).sort((a, b) => b.cov - a.cov || b.ratio - a.ratio || b.score - a.score || a.id.localeCompare(b.id));
  const seenUrl = /* @__PURE__ */ new Set();
  const out = [];
  for (const x of scored) {
    if (x.url && seenUrl.has(x.url)) continue;
    if (x.url) seenUrl.add(x.url);
    out.push(x.id);
    if (out.length >= n) break;
  }
  return out;
}
var REQUIRED_NFR = {
  light: ["performance", "security", "reliability"],
  complex: ["performance", "security", "reliability", "usability", "observability", "cost"]
};
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
var INTEGRATION_RE = /calendar|caldav|google|ical|ics|sync|webhook|email|smtp|sms|widget|iframe|embed|oauth|payment|api/i;
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
    const metric = specialiseMetric(cat, t.metric, { compliance, selfHost, timeGoal });
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
      if (sig && sig.test(text)) nfrs.push(n.id);
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
      unresolved: false
    };
  });
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
    ossByKey.set(keyOf(seed), { name: label, url: ref.webUrl ?? (/^https?:/.test(seed) ? seed : void 0), note: noteFrom(ev, evById) || "Seed OSS project mined for prior art.", evidence: ev });
  }
  for (const e of evidence.filter((x) => x.source === "oss")) {
    const k = keyOf(e.ref);
    if (ossByKey.has(k)) {
      if (!ossByKey.get(k).evidence.includes(e.id)) ossByKey.get(k).evidence.push(e.id);
      continue;
    }
    ossByKey.set(k, { name: e.title.replace(/ —.*$/, ""), url: e.url, note: firstSentence(e.snippet) || "Comparable open-source project (prior art).", evidence: [e.id] });
  }
  const oss = [...ossByKey.values()];
  const buildPlan = buildMilestones(functional, brief, evidence, evById);
  const traceability = functional.map((fr) => {
    const text = `${fr.title} ${fr.description}`;
    const adrIds = [stackAdrId];
    if (dataAdr && (PERSIST_RE.test(text) || INTEGRATION_RE.test(text))) adrIds.push(dataAdr.id);
    if (privacyAdr && NFR_SIGNALS.privacy.test(text)) adrIds.push(privacyAdr.id);
    return { fr: fr.id, nfrs: fr.nfrs, adrs: adrIds, entities: fr.entities, interfaces: fr.interfaces };
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
    nonFunctional,
    architecture: { context: contextProse(productName, brief), dataModel: [], interfaces: [], adrs },
    competitive: { competitors, oss },
    buildPlan,
    traceability,
    openQuestions: brief.openQuestions,
    evidenceIndex
  };
}
function concreteOutcome(title, notes) {
  const n = (notes ?? "").trim();
  const m = /\b(never|always|so that|so it|must|guarantee[sd]?|without|in under [^.]+)\b[^.]*/i.exec(n);
  if (m) {
    const clause = m[0].trim().replace(/[,;]$/, "");
    return `the action succeeds and ${lowerFirst(clause)}`;
  }
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
  return base;
}
function specialiseStatement(cat, base, ctx) {
  const c = cat.toLowerCase();
  if ((c === "privacy" || c === "security") && ctx.selfHost) {
    return `${base} No personal data leaves the self-hosted instance unless the host configures it.`;
  }
  return base;
}
function buildMilestones(functional, brief, evidence, evById) {
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
  const haystack = `${brief.idea} ${brief.candidateTech.join(" ")} ${brief.featureWishlist.map((f) => `${f.title} ${f.notes ?? ""}`).join(" ")}`;
  const boundaries = [];
  const add = (re, label) => {
    if (re.test(haystack) && !boundaries.includes(label)) boundaries.push(label);
  };
  add(/calendar|caldav|ical|ics/i, "calendar systems (CalDAV/iCal)");
  add(/google/i, "Google APIs");
  add(/email|smtp/i, "an email/SMTP provider");
  add(/sms|twilio/i, "an SMS provider");
  add(/widget|iframe|embed/i, "external host sites (embed/iframe)");
  add(/payment|stripe|billing/i, "a payments provider");
  add(/webhook/i, "outbound webhooks");
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
  const m = /^(.{20,200}?[.!?])(\s|$)/.exec(clean);
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

// src/templates.ts
function cite(ids) {
  if (!ids || ids.length === 0) return "";
  return " " + ids.map((id) => `[${id}]`).join("");
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
function renderFunctional(srd) {
  const out = [`# Functional requirements`, ``];
  if (!srd.functional.length) out.push(`_No functional requirements defined._`, ``);
  for (const fr of srd.functional) {
    out.push(`## ${fr.id} \u2014 ${fr.title} _(${fr.priority})_${cite(fr.rationaleEvidence)}`);
    out.push(``);
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
  }
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
  for (const e of entities) {
    out.push(`## ${e.name}`);
    out.push(``);
    if (e.attributes.length) {
      out.push(`| Attribute | Type |`, `|---|---|`);
      for (const a of e.attributes) out.push(`| ${a.name} | ${a.type} |`);
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
      out.push(`| ${c.name} | ${c.note} | ${ev} |`);
    }
  } else {
    out.push(`_No competitors captured. Use the market research angle to discover them._`);
  }
  out.push(``, `## Comparable open-source projects`, ``);
  if (srd.competitive.oss.length) {
    out.push(`| Project | Note | Evidence |`, `|---|---|---|`);
    for (const o of srd.competitive.oss) {
      const name = o.url ? `[${o.name}](${o.url})` : o.name;
      const ev = o.evidence.length ? o.evidence.map((id) => `[${id}]`).join("") : "_ungrounded_";
      out.push(`| ${name} | ${o.note} | ${ev} |`);
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
  const out = [
    `# Traceability matrix`,
    ``,
    `| Requirement | NFRs | ADRs | Entities | Interfaces |`,
    `|---|---|---|---|---|`
  ];
  for (const r of srd.traceability) {
    out.push(
      `| ${r.fr} | ${r.nfrs.join(", ") || "\u2014"} | ${r.adrs.join(", ") || "\u2014"} | ${r.entities.join(", ") || "\u2014"} | ${r.interfaces.join(", ") || "\u2014"} |`
    );
  }
  out.push(``);
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
    renderFunctional(srd),
    renderNonFunctional(srd),
    renderSystemContext(srd),
    renderDataModel(srd),
    renderInterfaces(srd),
    `# Architecture decisions`,
    ``,
    ...srd.architecture.adrs.map(renderADR),
    renderLandscape(srd),
    renderBuildPlan(srd),
    renderTraceability(srd)
  ];
  return parts.join("\n");
}

// src/render.ts
function writeFile(out, rel, content, files) {
  const abs = join8(out, rel);
  mkdirSync4(dirname2(abs), { recursive: true });
  writeFileSync3(abs, content.endsWith("\n") ? content : content + "\n");
  files.push(rel);
}
function renderSRD(brief, evidence, opts) {
  const srd = buildSRD(brief, evidence, { level: opts.level, generatedAt: opts.generatedAt });
  const files = [];
  const out = opts.out;
  rmSync(join8(out, "architecture", "decisions"), { recursive: true, force: true });
  writeFile(out, "00-overview/VISION.md", renderVision(srd), files);
  writeFile(out, "00-overview/SCOPE.md", renderScope(srd), files);
  writeFile(out, "requirements/FUNCTIONAL.md", renderFunctional(srd), files);
  writeFile(out, "requirements/NON-FUNCTIONAL.md", renderNonFunctional(srd), files);
  writeFile(out, "architecture/SYSTEM-CONTEXT.md", renderSystemContext(srd), files);
  writeFile(out, "architecture/DATA-MODEL.md", renderDataModel(srd), files);
  writeFile(out, "architecture/INTERFACES.md", renderInterfaces(srd), files);
  for (const adr of srd.architecture.adrs) {
    writeFile(out, `architecture/decisions/${adr.id}-${slugTitle(adr.title)}.md`, renderADR(adr), files);
  }
  writeFile(out, "competitive/LANDSCAPE.md", renderLandscape(srd), files);
  writeFile(out, "BUILD-PLAN.md", renderBuildPlan(srd), files);
  writeFile(out, "TRACEABILITY.md", renderTraceability(srd), files);
  writeFileSync3(srdManifestPath(out), JSON.stringify(srd, null, 2) + "\n");
  files.push("SRD.json");
  if (opts.merge) {
    writeFile(out, "SRD.md", renderMergeBundle(srd), files);
  }
  return { dir: out, files, srd };
}

// src/check.ts
import { existsSync as existsSync4, readFileSync as readFileSync3, readdirSync as readdirSync3, statSync as statSync3 } from "fs";
import { join as join9, relative as relative2, sep as sep2 } from "path";
var REQUIRED_NFR2 = {
  light: ["performance", "security", "reliability"],
  complex: ["performance", "security", "reliability", "usability", "observability", "cost"]
};
var REQUIRED_FILES = [
  "00-overview/VISION.md",
  "00-overview/SCOPE.md",
  "requirements/FUNCTIONAL.md",
  "requirements/NON-FUNCTIONAL.md",
  "TRACEABILITY.md",
  "SRD.json"
];
var PLACEHOLDER_RE = /🧠|\bTODO\b|\bTBD\b|\bFIXME\b/;
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
      const abs = join9(dir, name);
      let st;
      try {
        st = statSync3(abs);
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
  const path = join9(runDir, "evidence", "evidence.json");
  if (!existsSync4(path)) {
    return { evidence: [], note: `No evidence/evidence.json \u2014 grounding coverage is 0 (run \`construct research\` to ground the SRD).` };
  }
  try {
    const data = JSON.parse(readFileSync3(path, "utf8"));
    return { evidence: Array.isArray(data) ? data : [] };
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
function checkRun(runDir) {
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
    if (!existsSync4(join9(runDir, f))) errors.push(`Missing required file: ${f} (run \`construct render --out ${runDir}\`).`);
  }
  const manifest = srdManifestPath(runDir);
  if (!existsSync4(manifest)) {
    errors.push(`No SRD.json in ${runDir} \u2014 render the SRD first.`);
    return { ok: false, structural: { ok: false, errors, warnings }, coverage: emptyCoverage };
  }
  let srd;
  try {
    srd = JSON.parse(readFileSync3(manifest, "utf8"));
  } catch (e) {
    errors.push(`SRD.json is unreadable: ${e.message}`);
    return { ok: false, structural: { ok: false, errors, warnings }, coverage: emptyCoverage };
  }
  for (const rel of mdFiles(runDir)) {
    const text = readFileSync3(join9(runDir, rel), "utf8");
    if (PLACEHOLDER_RE.test(text)) errors.push(`Unresolved placeholder/decision (\u{1F9E0}/TODO/TBD) in ${rel}.`);
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
  if (srd.functional.length === 0) warnings.push("No functional requirements \u2014 the SRD has nothing to build.");
  const noTrace = srd.functional.filter((fr) => fr.entities.length === 0 && fr.interfaces.length === 0).length;
  if (noTrace) {
    warnings.push(`${noTrace} functional requirement(s) have no data/interface traceability \u2014 fill DATA-MODEL.md / INTERFACES.md and set FR.entities/interfaces.`);
  }
  if (srd.level === "complex" && srd.architecture.dataModel.length === 0) {
    warnings.push("Data model is empty \u2014 a complex SRD should name its core entities.");
  }
  const presentCats = new Set(srd.nonFunctional.map((n) => n.category.toLowerCase()));
  for (const cat of REQUIRED_NFR2[srd.level]) {
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
  const { evidence, note } = loadEvidence(runDir);
  if (note) warnings.push(note);
  const coverage = computeCoverage(srd, evidence);
  if (coverage.dangling.length) {
    warnings.push(`Grounding: ${coverage.dangling.length} citation(s) do not resolve to evidence.json: ${coverage.dangling.join(", ")}.`);
  }
  const ok = errors.length === 0;
  return { ok, structural: { ok, errors, warnings }, coverage };
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
  lines.push(`Grounding coverage (advisory \u2014 does not fail the build):`);
  lines.push(`  functional:     ${c.frGrounded}/${c.frTotal} grounded (${pct(c.frGrounded, c.frTotal)})`);
  lines.push(`  non-functional: ${c.nfrGrounded}/${c.nfrTotal} grounded (${pct(c.nfrGrounded, c.nfrTotal)})`);
  lines.push(`  decisions:      ${c.adrGrounded}/${c.adrTotal} grounded (${pct(c.adrGrounded, c.adrTotal)})`);
  lines.push(`  citations: ${c.citations.length} \xB7 resolved: ${c.resolved.length} \xB7 dangling: ${c.dangling.length} \xB7 uncited evidence: ${c.uncited.length}`);
  return lines.join("\n");
}

// src/cli.ts
var HELP = `construct v${VERSION}
Turn a product idea into a grounded, buildable SRD suite. Interview \u2192 research
(market / OSS prior-art / tech feasibility / optional local semantic) \u2192 render \u2192
check. Grounding is advisory; structural completeness is enforced.

Usage:
  construct init     --idea "<one-liner>" [--out <dir>]
  construct research --out <run> [--angles market,oss,tech,semantic] [--q "<focus>"] [--semantic]
  construct web|oss|tech|so --out <run> [--q "<focus>"] [--url <u,...>] [--seeds <u,...>]
  construct render   --out <run> [--level light|complex] [--merge]
  construct check    --out <run>
  construct status   --out <run>
  construct semantic up|down|status

Commands:
  init       Scaffold a run folder + brief.json (fill it via the interview).
  research   Gather evidence across angles into <run>/evidence (a dossier).
  web        Drill the market/web angle.       oss   Drill OSS prior-art mining.
  tech       Drill tech docs + StackOverflow.   so    Drill StackOverflow only.
  render     Render the SRD tree + SRD.json from brief.json + the dossier.
  check      Hard structural gate + advisory grounding-coverage report.
  status     Show what exists in a run (brief / evidence / SRD / check).
  semantic   Manage the optional local Docker stack (Qdrant + Ollama + SearXNG).

Options:
  --idea <s>           One-line product idea                     (required for init)
  --out <dir>          The run folder                            (required for most)
  --angles <list>      market,oss,tech,semantic   (default: market,oss,tech)
  --q, --question <s>  Focus the research/drill on a sub-question
  --url <u,...>        For 'web': specific page(s) to fetch + ground
  --seeds <u,...>      OSS repo URLs to mine (overrides brief.ossSeeds)
  --docs-url <url>     A technology docs page to ground against
  --level <l>          light | complex                           (default: light)
  --web-engine <e>     auto | searxng | ddg | claude             (default: auto)
  --per-source <n>     Max evidence items kept per source        (default: 6)
  --merge              Also emit a single-file SRD.md bundle
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
var COMMANDS = /* @__PURE__ */ new Set(["init", "research", "web", "oss", "tech", "so", "render", "check", "status", "semantic"]);
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
  "per-source"
]);
var BOOL_FLAGS = /* @__PURE__ */ new Set(["semantic", "merge", "json", "refresh"]);
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
  const out = p.values.out ?? p.values.run;
  if (!out) fail("missing --out <run>");
  return resolve2(out);
}
function buildResearchContext(p, runDir, angles) {
  const brief = loadBrief(runDir);
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
    refresh: p.bools.has("refresh")
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
      const out = p.values.out ? resolve2(p.values.out) : resolve2(slugify(idea) || "construct-run");
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
          const { items, notes } = await webFetchUrls(urls, q, ctx.perSource, "market");
          results = [{ source: "market", items, notes }];
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
      const brief = loadBrief(out);
      const v = validateBrief(brief);
      if (!v.ok) fail(`brief is incomplete:
${v.errors.map((e) => "  - " + e).join("\n")}`);
      const level = oneOf("level", p.values.level ?? "light", ["light", "complex"]);
      const evidence = loadEvidence2(out);
      const r = renderSRD(brief, evidence, {
        level,
        out,
        merge: p.bools.has("merge"),
        generatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      process.stderr.write(
        [
          `construct: rendered the ${level} SRD for "${brief.idea}"`,
          `  files:    ${r.files.length} (${r.srd.functional.length} FR \xB7 ${r.srd.nonFunctional.length} NFR \xB7 ${r.srd.architecture.adrs.length} ADR)`,
          `  manifest: ${join10(out, "SRD.json")}`,
          `  next:     construct check --out ${out}`
        ].join("\n") + "\n"
      );
      return;
    }
    case "check": {
      const out = requireOut(p);
      const res = checkRun(out);
      process.stdout.write(formatCheckReport(res, out) + "\n");
      if (!res.ok) process.exit(1);
      return;
    }
    case "status": {
      const out = requireOut(p);
      const has = (rel) => existsSync5(join10(out, rel)) ? "\u2713" : "\xB7";
      process.stdout.write(
        [
          `construct status: ${out}`,
          `  ${has("brief.json")} brief.json`,
          `  ${has("evidence/evidence.json")} evidence/evidence.json (research)`,
          `  ${has("SRD.json")} SRD.json (render)`,
          `  ${has("requirements/FUNCTIONAL.md")} requirements/FUNCTIONAL.md`
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
function loadEvidence2(runDir) {
  const path = join10(runDir, "evidence", "evidence.json");
  if (!existsSync5(path)) return [];
  try {
    const data = JSON.parse(readFileSync4(path, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
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
