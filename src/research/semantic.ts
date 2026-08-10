import type { SourceResult } from "../types.js";
import { httpJson, httpGet } from "./fetch.js";
import { pool } from "./pool.js";
import { cosine, embedOne, stackControl as engineStackControl, type StackDeps } from "../engine.js";
import { REACHABLE_TIMEOUT_MS, EMBED_TIMEOUT_MS, EMBED_CONCURRENCY } from "../config.js";

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

// Cosine similarity is the engine's as of webindex v1.15.2. The two guards this
// copy had — a length mismatch and a non-finite result both scoring 0 rather
// than poisoning a sort comparator — went upstream with it, so nothing is lost.
export { cosine } from "../engine.js";

async function reachable(base: string, path = "/"): Promise<boolean> {
  const r = await httpGet(base + path, { timeoutMs: REACHABLE_TIMEOUT_MS });
  return r.ok;
}

// Embedding is the engine's too: it posts to /api/embed with `input` rather
// than the legacy /api/embeddings with `prompt`, and it batches while preserving
// input order. Kept singular here under a name the engine does not own, because
// every call site wants one vector for one string and `null` for "no vector".
async function embedOneChunk(text: string): Promise<number[] | null> {
  const v = await embedOne(text.slice(0, 4000), { base: OLLAMA, model: EMBED_MODEL });
  return v && v.length ? v : null;
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
  const qv = await embedOneChunk(query);
  if (!qv) return unchanged(`could not embed the query (is the '${EMBED_MODEL}' model pulled?)`);

  // One embedding call per item, previously strictly serial: a run-sized dossier
  // meant dozens of sequential local inferences. They are independent, so run a
  // few at a time. (Ollama also exposes a batch endpoint, but its shape differs
  // across versions — bounded concurrency gets most of the win without betting
  // on which one the user has running.)
  const out: SourceResult[] = [];
  let failures = 0;
  for (const r of results) {
    const items = await pool(r.items, EMBED_CONCURRENCY, async (it) => {
      const v = await embedOneChunk(`${it.title}\n${it.snippet}`);
      if (v) return { ...it, score: Number(cosine(qv, v).toFixed(4)), meta: { ...(it.meta ?? {}), semantic: true } };
      // Never leave a failed item on the lexical scale next to 0..1 cosines —
      // it would outrank everything. Sink it with a sentinel score.
      failures++;
      return { ...it, score: -1, meta: { ...(it.meta ?? {}), semantic: false } };
    });
    out.push({ ...r, items });
  }
  const notes = [`Semantic rescoring via Ollama + ${EMBED_MODEL} (local).`];
  if (failures) notes.push(`${failures} item(s) could not be embedded; ranked last.`);
  return { available: true, results: out, notes };
}

// ── The optional local Docker stacks ────────────────────────────────────────
//
// The compose file, the profiles and the orchestration are the engine's. This
// is the mapping onto construct's two commands, plus the `use:` hint each one
// ends with — that hint is the only part that is about construct.
//
// Delegating fixes a real failure rather than only removing lines: the previous
// version walked up from the bundle looking for docker-compose.yml, which every
// install that is not a clone or a full skill copy failed to find. The engine
// writes the file out on demand, so an installed copy behaves like a checkout.
export type StackName = "semantic" | "firecrawl";

// `semantic` is the cheap one — Qdrant, Ollama and SearXNG, ~1 GB. Firecrawl is
// ~3 GB and five containers, and is deliberately not part of it. Asking for
// `searxng` alongside `semantic` reproduces exactly what compose profile `all`
// selected before, in one call.
//
// Named SERVICE_GROUPS, not STACK_SERVICES: the engine exports a STACK_SERVICES
// of its own (the flat list of service names it knows), and this is a different
// thing — construct's stack names mapped to the engine services each one pulls
// in. Two meanings under one name is how a shadow starts.
const SERVICE_GROUPS: Record<StackName, string[]> = {
  semantic: ["semantic", "searxng"],
  firecrawl: ["firecrawl"],
};

const USE_HINT: Record<StackName, string> = {
  semantic: "  use:    construct research --out <run> --angles market,oss,tech,semantic --semantic",
  firecrawl: "  use:    construct research --out <run>   (pages are cleaned through Firecrawl automatically)",
};

/**
 * Control one of the optional local Docker stacks. `deps` is injectable so the
 * mapping is testable without a daemon; the engine tests the orchestration.
 */
export function stackCommand(stack: StackName, action: string, deps: StackDeps = {}): { message: string; code: number } {
  const r = engineStackControl(SERVICE_GROUPS[stack], action, deps);
  return r.code === 0 && action === "up" ? { ...r, message: `${r.message}\n${USE_HINT[stack]}` } : r;
}
