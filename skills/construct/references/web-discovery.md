# Web discovery — layered & keyless

The `market` angle (and the `web` drill) find and ground pages from the open web
— competitors, positioning, pricing, reviews. Discovery is **layered and
entirely keyless/free**; `construct` uses whatever is available, in order.
Fetching and text extraction of the chosen URLs is always done by the script.

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
   URLs, then ground them with:
   ```
   node scripts/construct.mjs web --out <run> --url <url1,url2,...>
   ```

## Pinning an engine

`--web-engine searxng|ddg|claude|auto`:
- `searxng` — only the local instance (errors with a hint if it's down).
- `ddg` — only DuckDuckGo scraping.
- `claude` — skip keyless discovery; just emit the WebSearch hint (use when you
  want to drive discovery yourself and feed `--url`).
- `auto` (default) — SearXNG → DuckDuckGo → WebSearch hint.

## Grounding specific pages

You can always ground exact pages without discovery — useful after your own
WebSearch:
```
node scripts/construct.mjs web --out <run> --q "<focus>" --url https://a.com,https://b.com
```
Each page is fetched, stripped to readable text, and excerpted around the focus
keywords into `market` evidence you can cite with `[E#]`.

## StackOverflow

Handled by the `tech` angle / `so` drill via the keyless StackExchange API — see
`provider-apis.md`.
