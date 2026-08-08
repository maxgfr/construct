# Local stacks: semantic mode, web search & extraction (optional, no key)

The `market`, `oss` and `tech` angles need nothing but network access. Two
optional Docker stacks make them better, and **neither needs an API key — no
data leaves your machine**. The published `construct.mjs` bundle stays
dependency-free; it only speaks HTTP to localhost.

- **Semantic mode** adds a relevance pass over the gathered evidence: each item
  is embedded with a local model and re-scored by cosine similarity to your
  research focus, so the dossier ranks the most conceptually-relevant evidence
  first.
- **Firecrawl** replaces the *extraction* step: pages are fetched with a real
  browser and returned as main-content markdown.

## The stacks

One compose file, embedded in the engine and written into the cache dir on
demand. Four services behind profiles:

| Service | Image | Port | Profile | Role |
|---------|-------|------|---------|------|
| `qdrant` | `qdrant/qdrant` | 6333 | `semantic`, `all` | vector database (provisioned for future large-corpus indexing) |
| `ollama` | `ollama/ollama` | 11434 | `semantic`, `all` | local embedding model server (powers `--semantic`) |
| `searxng` | `searxng/searxng` | 8888 | `search`, `all` | keyless metasearch for the `market` angle |
| `firecrawl` (+ 4 sidecars) | `ghcr.io/firecrawl/firecrawl` | 3002 | `extract` | keyless main-content extraction |

Default embedding model: **`nomic-embed-text`** (137M, CPU-friendly). Override
with `CONSTRUCT_EMBED_MODEL`.

## Start / stop

```
node scripts/construct.mjs semantic up       # profile `all`: qdrant + ollama + searxng, pulls the model
node scripts/construct.mjs semantic status   # docker compose ps
node scripts/construct.mjs semantic down

node scripts/construct.mjs firecrawl up      # firecrawl + its 4 sidecars, and SearXNG behind /search
node scripts/construct.mjs firecrawl status
node scripts/construct.mjs firecrawl down
```

Both `up` commands wait for every container to report **healthy** before
returning — otherwise the next thing the engine does (pull the model, query
:8888, scrape a page) races the container's startup, and a single failed probe
is remembered for the rest of the process.

The compose file, the SearXNG settings and the Firecrawl env are **embedded in
the engine** and written out on first use, so these commands work from any
install — an `npx skills add` copy, a global npm install, a checkout. There is no
file to find and nothing left to fail to find; the previous version searched for
`docker-compose.yml` beside the bundle and told you to reinstall when the layout
did not match.

`up` also pulls the images first, on their own 20-minute budget
(`CONSTRUCT_DOCKER_PULL_TIMEOUT_MS`) — the Ollama image alone is over 1.6 GB, and
letting `up`'s shorter deadline cover the download turns a slow network into a
failed start.

**Firecrawl is deliberately not in `all`.** It is ~3 GB of images and ~4 GB of
RAM across five containers; `semantic up` has to stay cheap. Once it is up,
`curl -s localhost:3002/v2/scrape -H 'content-type: application/json' -d
'{"url":"https://example.com"}'` is the one-line smoke test.

## Use them

```
node scripts/construct.mjs research --out <run> --angles market,oss,tech,semantic --semantic
```

`--semantic` embeds the query and each evidence snippet via Ollama and re-scores
by cosine similarity (in-process — no Qdrant round-trip needed for a run-sized
dossier). If the stack isn't running (or the model isn't pulled), `--semantic`
logs a note and **keeps the lexical ranking** — research is never blocked.

Firecrawl needs no flag: while it answers on :3002, every page fetch goes
through it. Reachability is probed once per process, so a stack you never
started costs one refused connection per run and nothing else. When it is up but
cannot render a page, that page falls back to the built-in extractor and the
dossier names it. Cached pages record which extractor produced them, so turning
the stack on or off never serves you the other one's text.

## Environment overrides

| Var | Default | Meaning |
|-----|---------|---------|
| `CONSTRUCT_OLLAMA` | `http://localhost:11434` | embedding server base URL |
| `CONSTRUCT_EMBED_MODEL` | `nomic-embed-text` | embedding model id |
| `CONSTRUCT_SEARXNG` | `http://localhost:8888` | SearXNG base URL for the market angle |
| `CONSTRUCT_FIRECRAWL` | `http://localhost:3002` | Firecrawl base URL; the literal `off` disables the layer (same as `--firecrawl off`) |
| `CONSTRUCT_FIRECRAWL_KEY` | *(unset)* | bearer token — never needed self-hosted; only to point the same client at Firecrawl Cloud |
