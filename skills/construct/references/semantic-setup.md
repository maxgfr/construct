# Semantic mode & local web search (optional, fully local, no key)

The `market`, `oss` and `tech` angles need nothing but network access. **Semantic
mode** adds a relevance pass over the gathered evidence: each item is embedded
with a local model and re-scored by cosine similarity to your research focus, so
the dossier ranks the most conceptually-relevant evidence first. Everything runs
in local Docker containers — **no API key, no data leaves your machine**. The
published `construct.mjs` bundle stays dependency-free; it only speaks HTTP to
localhost.

## The stack

`docker-compose.yml` defines three services:

| Service | Image | Port | Role |
|---------|-------|------|------|
| `qdrant` | `qdrant/qdrant` | 6333 | vector database (provisioned for future large-corpus indexing) |
| `ollama` | `ollama/ollama` | 11434 | local embedding model server (powers `--semantic`) |
| `searxng` | `searxng/searxng` | 8888 | keyless metasearch for the `market` angle |

Default embedding model: **`nomic-embed-text`** (137M, CPU-friendly). Override
with `CONSTRUCT_EMBED_MODEL`.

## Start / stop

```
node scripts/construct.mjs semantic up       # starts all three, pulls the model
node scripts/construct.mjs semantic status   # docker compose ps
node scripts/construct.mjs semantic down     # stops everything
```

The `docker-compose.yml` and its `docker/searxng/settings.yml` **ship inside the
installed skill** (next to the bundle), so `construct semantic up|down|status`
works from the install directory — no repo checkout needed. If the engine can't
find the compose file it says so explicitly (reinstall via `npx skills add
maxgfr/construct`) rather than emitting a raw docker error.

`semantic up` runs `docker compose --profile all up -d` then
`ollama pull nomic-embed-text`. Start a subset directly:

```
docker compose --profile semantic up -d     # qdrant + ollama
docker compose --profile search up -d        # searxng only (for the market angle)
```

## Use it

```
node scripts/construct.mjs research --out <run> --angles market,oss,tech,semantic --semantic
```

`--semantic` embeds the query and each evidence snippet via Ollama and re-scores
by cosine similarity (in-process — no Qdrant round-trip needed for a run-sized
dossier). If the stack isn't running (or the model isn't pulled), `--semantic`
logs a note and **keeps the lexical ranking** — research is never blocked.

## Environment overrides

| Var | Default | Meaning |
|-----|---------|---------|
| `CONSTRUCT_OLLAMA` | `http://localhost:11434` | embedding server base URL |
| `CONSTRUCT_EMBED_MODEL` | `nomic-embed-text` | embedding model id |
| `CONSTRUCT_SEARXNG` | `http://localhost:8888` | SearXNG base URL for the market angle |
