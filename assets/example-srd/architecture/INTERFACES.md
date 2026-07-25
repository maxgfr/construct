# Interfaces

_Seeded by inference from the brief — verify each surface and define its contract during authoring._

## Web App _(ui)_

Server-rendered Next.js UI over an internal JSON API: POST /articles (save), GET /articles?q= (search + filter), POST /tags, POST /imports (multipart upload), GET /imports/:id (progress). Session-cookie authenticated; 401 on any unauthenticated call, 503 with a Retry-After when the search index is unreachable.

_Related: FR-001, FR-002, FR-003, FR-004, FR-005_

## Browser Extension _(api)_

A WebExtension that POSTs {url, title} to the instance's /articles endpoint using a long-lived token the user pastes once. Failure modes: unreachable instance (surface the host and keep the URL in the popup), 401 (prompt to re-paste the token), 409 duplicate (report the existing article rather than erroring).

_Related: FR-001_
