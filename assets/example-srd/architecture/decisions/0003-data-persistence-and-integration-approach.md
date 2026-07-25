# 0003. Data persistence and integration approach

- **Status:** accepted

## Context
Saved articles must survive the source going offline, and imports of up to 10,000 entries must not lose data or block the UI. Prior art shows bulk imports are where read-it-later tools break [E5].

## Decision
Store extracted article bodies as rows in PostgreSQL with images on the filesystem, and process imports through a resumable batch job that commits every 100 entries [E5][E2]. [E5][E2]

## Consequences
A refresh or a crash mid-import loses at most one batch, and a single bad entry is recorded rather than fatal. Storing bodies in PostgreSQL keeps backup to a single pg_dump; large libraries grow the database rather than an object store, which is acceptable at the stated single-user scale.

## Alternatives considered
One transaction for the whole import — simpler, but a 10,000-entry rollback loses hours of work.,Object storage for bodies — better at scale, but adds a service the self-hosting target does not need.
