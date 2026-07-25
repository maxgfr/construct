# 0001. Primary technology stack

- **Status:** accepted

## Context
The product is a single-developer, 8-week MVP that must run on a cheap VPS and be installable by non-experts. It needs relational storage, full-text search with typo tolerance, and a server-rendered web UI.

## Decision
Build on Next.js with PostgreSQL as the system of record and Meilisearch as the search index, shipped together as a docker-compose stack [E3]. [E3]

## Consequences
One language across server and client keeps a solo developer productive. Meilisearch adds a second stateful service to run and back up, which is the main operational cost of the choice; PostgreSQL full-text search was rejected because typo tolerance would have to be hand-built. The stack fits the 2 vCPU / 2 GB target.

## Alternatives considered
PostgreSQL full-text search alone — one fewer service, but no typo tolerance without significant custom work.,SQLite + FTS5 — simplest to operate, but weak concurrent-write behaviour under import load.
