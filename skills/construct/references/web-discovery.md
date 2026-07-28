# Web discovery — layered & keyless

The `market` angle (and the `web` drill) find and ground pages from the open web
— competitors, positioning, pricing, reviews. Discovery is **layered and
entirely keyless/free**; `construct` uses whatever is available, in order.
Fetching and text extraction of the chosen URLs is always done by the script.

Two separate steps, worth keeping apart: **discovery** picks the URLs (this
page), **extraction** turns a page into text (the last section).

## The layers (`--web-engine auto`, the default)

1. **SearXNG (local, Docker).** If a SearXNG instance is reachable (default
   `http://localhost:8888`, override with `CONSTRUCT_SEARXNG`), it's queried over
   HTTP (`/search?format=json`). Self-hosted metasearch, no key, nothing leaves
   the machine. Brought up by `construct semantic up` (see `semantic-setup.md`).
2. **DuckDuckGo HTML (no Docker).** Scrapes `html.duckduckgo.com/html` and
   decodes the real URLs from DDG's redirector. Autonomous and keyless; a bit
   fragile if DDG changes its markup.
3. **Claude WebSearch (harness).** If neither keyless engine returns results,
   the angle emits a note telling you to use your built-in **WebSearch** to find
   URLs, then ground them by pinning the pages into a `research` re-run (the
   `web` drill only prints — `research --url` is what persists to the dossier):
   ```
   node scripts/construct.mjs research --out <run> --url <url1,url2,...>
   ```

## Pinning an engine

`--web-engine searxng|ddg|claude|firecrawl|auto`:
- `searxng` — only the local instance (errors with a hint if it's down).
- `ddg` — only DuckDuckGo scraping.
- `claude` — skip keyless discovery; just emit the WebSearch hint (use when you
  want to drive discovery yourself and feed `--url`).
- `firecrawl` — Firecrawl's own `/search` (keyless too: it cascades to the
  `searxng` container, then to DuckDuckGo, internally). **Explicit only** — it
  rides on the heavy `extract` Docker profile, so `auto` never probes it. Worth
  pinning when the extraction stack is already up.
- `auto` (default) — SearXNG → DuckDuckGo → WebSearch hint. Unchanged.

## Grounding specific pages

You can always ground exact pages without discovery — useful after your own
WebSearch. **Two different commands, and only one of them grounds:**

```
# INSPECT — fetches, extracts, prints to stdout. Persists NOTHING.
node scripts/construct.mjs web --out <run> --q "<focus>" --url https://a.com,https://b.com

# GROUND — pins the pages into the dossier with real [E#] ids you can cite.
node scripts/construct.mjs research --out <run> --angles market,oss,tech --url https://a.com,https://b.com
```

The drill is for reading a page before deciding it is worth grounding; the
`research` re-run is what makes it citable. Pinned pages are never dropped by
the per-source budget — if the budget has to cut, it cuts discovery and names
the cut in the dossier notes.

`web --url` also accepts `--source <market|docs|oss|so|issue|pr>` to file the
printed excerpts under a different evidence kind (a vendor's docs page read
through the web drill, say). It changes the classification, not the fact that
the drill only prints.

## Extraction — what a fetched page becomes

Discovery chooses URLs; extraction turns each one into the text the dossier
excerpts. Two extractors exist, and the choice is automatic.

1. **Built-in (always available).** A regex HTML stripper: drops
   script/style/nav/footer, turns block tags into newlines, decodes entities,
   then removes cookie/consent banner lines. Zero-dependency and fast, but it has
   **no main-content detection** — sidebars and related-links rails survive — and
   a JS-rendered page yields nothing, because its prose was never in the HTML.
2. **Firecrawl (when the `extract` stack is up).** Fetches with a real browser
   and returns main-content markdown. Keyless, self-hosted, started by
   `construct firecrawl up` (see `semantic-setup.md`). No flag turns it on: it is
   used whenever `http://localhost:3002` answers.

The fallback is total and quiet. A stack that isn't running costs one refused
connection per process, and pages extract exactly as they did before. A stack
that *is* running but can't render one page falls that page back to the built-in
extractor and names it in the dossier notes. Override the address — or force the
built-in path — with `--firecrawl <url>` / `--firecrawl off`
(`CONSTRUCT_FIRECRAWL`).

Cached pages record which extractor produced them, so switching the stack on or
off never serves you the other one's text: a native body is re-fetched through
Firecrawl and vice versa, instead of shadowing it for the cache's week-long TTL.

## StackOverflow

Handled by the `tech` angle / `so` drill via the keyless StackExchange API — see
`provider-apis.md`.
