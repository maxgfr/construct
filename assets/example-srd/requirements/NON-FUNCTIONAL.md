# Non-functional requirements

## NFR-001 — performance [E3]

Search and library rendering stay responsive on a self-hosted single-node install.

- **Metric:** p95 search latency < 300 ms over a 5,000-article library on 2 vCPU / 2 GB RAM; library list first paint < 1 s [E3]

## NFR-002 — security

A self-hosted instance is safe to expose to the public internet.

- **Metric:** every endpoint except /health requires an authenticated session; credentials and session tokens never appear in logs; dependencies scanned in CI and no known-exploited CVE ships in a release

## NFR-003 — reliability

A crash or a bad deploy never costs the user their library.

- **Metric:** 99.5% monthly availability measured from the instance's own health endpoint; RPO ≤ 24 h via nightly snapshot, RTO ≤ 1 h with a documented single-command restore verified on every release

## NFR-004 — usability

A new self-hoster reaches value without reading documentation end to end.

- **Metric:** a first-time user saves their first article within 2 minutes of first login, unaided, in moderated testing with 5 participants

## NFR-005 — observability

A failure can be diagnosed from the instance's own logs, without reproducing it.

- **Metric:** every request carries a trace id echoed in error responses; save, search and import each emit a structured success/failure event with duration

## NFR-006 — cost

Running a personal instance costs about what a cheap VPS costs.

- **Metric:** runs within 2 vCPU / 2 GB RAM / 20 GB disk for a single user with 5,000 articles — under $10/month at 2026 VPS pricing, matching the stated side-project budget

## NFR-007 — privacy [E1]

The user owns their data and can leave without loss.

- **Metric:** full export to JSON + original HTML on demand; account deletion removes all rows and cached bodies within 24 h; no third-party analytics or telemetry ships enabled [E1]
