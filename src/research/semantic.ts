import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { SourceResult } from "../types.js";
import { httpJson, httpGet } from "./fetch.js";
import { sh, have } from "../util.js";
import {
  REACHABLE_TIMEOUT_MS,
  EMBED_TIMEOUT_MS,
  COMPOSE_DOWN_TIMEOUT_MS,
  COMPOSE_PS_TIMEOUT_MS,
  COMPOSE_UP_TIMEOUT_MS,
  OLLAMA_PULL_TIMEOUT_MS,
} from "../config.js";

// All endpoints are local and keyless; the heavy compute (embeddings) runs in a
// Docker container, so the published bundle stays dependency-free and only
// speaks HTTP to localhost.
const OLLAMA = (process.env.CONSTRUCT_OLLAMA || "http://localhost:11434").replace(/\/$/, "");
const EMBED_MODEL = process.env.CONSTRUCT_EMBED_MODEL || "nomic-embed-text";

export interface Chunk {
  rel: string;
  start: number;
  end: number;
  text: string;
  isDoc: boolean;
}

// Split content into overlapping line windows. Pure + exported for testing.
export function chunkText(rel: string, content: string, isDoc: boolean, opts: { windowLines?: number; overlap?: number; maxPerFile?: number } = {}): Chunk[] {
  const win = opts.windowLines ?? 60;
  const overlap = opts.overlap ?? 12;
  const maxPerFile = opts.maxPerFile ?? 40;
  const lines = content.split(/\r?\n/);
  const chunks: Chunk[] = [];
  const step = Math.max(1, win - overlap);
  for (let i = 0; i < lines.length && chunks.length < maxPerFile; i += step) {
    const slice = lines.slice(i, i + win);
    const text = slice.join("\n").trim();
    if (text.length < 16) continue;
    chunks.push({ rel, start: i + 1, end: Math.min(lines.length, i + win), text, isDoc });
  }
  return chunks;
}

// Cosine similarity of two equal-length vectors. Pure + exported for testing.
export function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  const r = dot / (Math.sqrt(na) * Math.sqrt(nb));
  // A non-finite component (NaN/Infinity in an embedding) would poison the sort
  // comparator — collapse it to the honest zero/lexical-fallback path.
  return Number.isFinite(r) ? r : 0;
}

async function reachable(base: string, path = "/"): Promise<boolean> {
  const r = await httpGet(base + path, { timeoutMs: REACHABLE_TIMEOUT_MS });
  return r.ok;
}

async function embed(text: string): Promise<number[] | null> {
  const r = await httpJson("POST", `${OLLAMA}/api/embeddings`, { model: EMBED_MODEL, prompt: text.slice(0, 4000) }, { timeoutMs: EMBED_TIMEOUT_MS });
  const v = r.ok ? r.data?.embedding : undefined;
  return Array.isArray(v) && v.length ? v : null;
}

export interface SemanticResult {
  available: boolean;
  results: SourceResult[];
  notes: string[];
}

// Re-score the gathered evidence by semantic similarity to the query, using a
// local Ollama embedding model + in-process cosine. The new score makes the
// dossier rank the most conceptually-relevant evidence first within each source
// (assignIds sorts by score). Never throws; returns the input unchanged with an
// honest note when the local stack is unavailable.
export async function semanticRescore(results: SourceResult[], query: string): Promise<SemanticResult> {
  const unchanged = (why: string): SemanticResult => ({
    available: false,
    results,
    notes: [`Semantic mode unavailable (${why}); kept lexical ranking.`],
  });

  if (!(await reachable(OLLAMA, "/api/tags"))) {
    return unchanged(`Ollama not reachable at ${OLLAMA} — run \`construct semantic up\``);
  }
  const qv = await embed(query);
  if (!qv) return unchanged(`could not embed the query (is the '${EMBED_MODEL}' model pulled?)`);

  const out: SourceResult[] = [];
  let failures = 0;
  for (const r of results) {
    const items = [];
    for (const it of r.items) {
      const v = await embed(`${it.title}\n${it.snippet}`);
      if (v) {
        items.push({ ...it, score: Number(cosine(qv, v).toFixed(4)), meta: { ...(it.meta ?? {}), semantic: true } });
      } else {
        // Never leave a failed item on the lexical scale next to 0..1 cosines —
        // it would outrank everything. Sink it with a sentinel score.
        failures++;
        items.push({ ...it, score: -1, meta: { ...(it.meta ?? {}), semantic: false } });
      }
    }
    out.push({ ...r, items });
  }
  const notes = [`Semantic rescoring via Ollama + ${EMBED_MODEL} (local).`];
  if (failures) notes.push(`${failures} item(s) could not be embedded; ranked last.`);
  return { available: true, results: out, notes };
}

// Locate docker-compose.yml relative to the bundle. In the INSTALLED skill the
// bundle sits at skills/construct/scripts/construct.mjs and the compose ships as
// skills/construct/docker-compose.yml (`../` from the bundle). In the repo the
// compiled/source bundle resolves the root copy (`../../`). Returns null when no
// copy exists, so semanticControl can emit a targeted error instead of shelling
// `docker compose -f <missing path>` and dumping an opaque failure.
export function composeFile(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const cand of [join(here, "..", "docker-compose.yml"), join(here, "docker-compose.yml"), join(here, "..", "..", "docker-compose.yml")]) {
    if (existsSync(cand)) return cand;
  }
  return null;
}

// Control the optional local Docker stack (Qdrant + Ollama embeddings + SearXNG).
// SearXNG powers the market angle's web discovery; Ollama powers semantic
// rescoring; Qdrant is provisioned for future large-corpus indexing.
export function semanticControl(action: string, composeFilePath: string | null = composeFile()): { message: string; code: number } {
  if (!["up", "down", "status"].includes(action)) {
    return { message: `construct semantic: unknown action "${action}" (use: up | down | status)`, code: 1 };
  }
  if (!have("docker")) {
    return { message: "construct semantic: docker not found. Install Docker, then retry. See references/semantic-setup.md.", code: 1 };
  }
  if (!composeFilePath) {
    return {
      message:
        "construct semantic: docker-compose.yml not found next to the bundle — reinstall the skill (`npx skills add maxgfr/construct`), or run from the repo. See references/semantic-setup.md.",
      code: 1,
    };
  }
  const file = composeFilePath;

  if (action === "down") {
    const r = sh("docker", ["compose", "-f", file, "--profile", "all", "down"], { timeoutMs: COMPOSE_DOWN_TIMEOUT_MS });
    return { message: r.ok ? "construct semantic: stack stopped." : `construct semantic: down failed.\n${r.stderr}`, code: r.ok ? 0 : 1 };
  }

  if (action === "status") {
    const r = sh("docker", ["compose", "-f", file, "ps"], { timeoutMs: COMPOSE_PS_TIMEOUT_MS });
    return { message: r.ok ? r.stdout || "construct semantic: no services running." : `construct semantic: status failed.\n${r.stderr}`, code: 0 };
  }

  const up = sh("docker", ["compose", "-f", file, "--profile", "all", "up", "-d"], { timeoutMs: COMPOSE_UP_TIMEOUT_MS });
  if (!up.ok) return { message: `construct semantic: up failed.\n${up.stderr}`, code: 1 };
  const pull = sh("docker", ["compose", "-f", file, "exec", "-T", "ollama", "ollama", "pull", EMBED_MODEL], { timeoutMs: OLLAMA_PULL_TIMEOUT_MS });
  const lines = [
    "construct semantic: stack is up (Qdrant :6333 · Ollama :11434 · SearXNG :8888).",
    pull.ok ? `  model:  ${EMBED_MODEL} ready` : `  model:  pull '${EMBED_MODEL}' yourself: docker compose -f ${file} exec ollama ollama pull ${EMBED_MODEL}`,
    "  use:    construct research --out <run> --angles market,oss,tech,semantic --semantic",
  ];
  return { message: lines.join("\n"), code: 0 };
}
