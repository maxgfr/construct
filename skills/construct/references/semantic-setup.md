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

One `docker-compose.yml`, two profiles.

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

node scripts/construct.mjs firecrawl up      # profile `extract`: firecrawl + its 4 sidecars
node scripts/construct.mjs firecrawl status
node scripts/construct.mjs firecrawl down
```

Both `up` commands wait for every container to report **healthy** before
returning — otherwise the next thing the engine does (pull the model, query
:8888, scrape a page) races the container's startup, and a single failed probe
is remembered for the rest of the process.

`docker-compose.yml`, `docker/searxng/settings.yml` and
`docker/firecrawl/firecrawl.env` **ship inside the installed skill** (next to the
bundle), so these commands work from the install directory — no repo checkout
needed. If the engine can't find the compose file it says so explicitly
(reinstall via `npx skills add maxgfr/construct`) rather than emitting a raw
docker error.

Start a subset directly:

```
docker compose --profile semantic up -d     # qdrant + ollama
docker compose --profile search up -d       # searxng only (for the market angle)
docker compose --profile extract up -d      # firecrawl only
```

**Firecrawl is deliberately not in `all`.** It is ~3 GB of images and ~4 GB of
RAM across five containers; `semantic up` has to stay cheap. Details and a curl
smoke test: `docker/firecrawl/README.md`.

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
