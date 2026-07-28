# Self-hosted Firecrawl (compose profile `extract`)

Five containers that turn a URL into **main-content markdown**: the Firecrawl
API, a Playwright browser sidecar, Redis, RabbitMQ and a Postgres queue store.
`construct` uses it as a content-*cleaning* layer under `fetchAndExtract` — the
built-in extractor is a regex HTML stripper with no main-content detection, so
it keeps sidebars and cookie dialogs and gets nothing at all from a JS-rendered
page.

**No API key.** `USE_DB_AUTHENTICATION=false` (in `firecrawl.env`) disables auth,
so no `Authorization` header is sent. `/scrape` and `/search` are both keyless;
`/search` delegates to the `searxng` service through `SEARXNG_ENDPOINT` and
falls back to DuckDuckGo on its own when that profile is down.

**Cost.** ~3 GB of images to pull the first time and ~4 GB of RAM while running
(the API container is capped at 4 GB, the browser at 2 GB). That is why it is
its own profile and is *not* part of `--profile all`: `construct semantic up`
must stay cheap.

## Up / down

```
node scripts/construct.mjs firecrawl up       # docker compose --profile extract up -d --wait
node scripts/construct.mjs firecrawl status
node scripts/construct.mjs firecrawl down
```

`--wait` blocks until every container is healthy — the first `up` can take
several minutes while the images download. To also give it keyless search,
bring the metasearch profile up alongside it:

```
docker compose --profile search --profile extract up -d --wait
```

## Smoke test

```
curl -s http://localhost:3002/                      # {"message":"Firecrawl API",...}
curl -s -X POST http://localhost:3002/v2/scrape \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com","formats":["markdown"],"onlyMainContent":true}'
```

## How the CLI degrades

Reachability is probed once per process (`GET /`, 2 s). If nothing answers,
every page falls back to the built-in extractor silently — a stack you never
started costs one refused connection per run. If Firecrawl *is* up but cannot
extract a given page, that page falls back too and the dossier carries a note
naming the URL. Cached pages record which extractor produced them, so switching
the stack on or off never serves you the other one's text.

`CONSTRUCT_FIRECRAWL` (or `--firecrawl <url>`) points at another instance;
the literal value `off` forces the built-in extractor without stopping the
containers. `CONSTRUCT_FIRECRAWL_KEY` adds a bearer token — not needed here,
only if you point the same client at Firecrawl Cloud.
