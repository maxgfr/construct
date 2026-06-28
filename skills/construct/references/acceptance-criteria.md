# Acceptance criteria & NFR metrics — from templated to testable

`construct render` emits *structurally complete* Given/When/Then criteria and
NFR metrics. `construct check` warns while any still carry the renderer's
template phrasing. This guide is how to sharpen them. The bar for every
criterion: **a developer could write an automated test from it without asking a
single question.**

## The checklist

A sharp criterion has all four:

1. **Observable outcome** — something a test can assert (a record exists, a
   response returns, an email sends), not an intention ("works correctly",
   "handles gracefully").
2. **Bounded numbers** — every "fast/large/many" replaced by a number with a
   unit: `within 2 seconds`, `up to 10,000 items`, `at least 3 retries`.
3. **A concrete actor and trigger** — who does what, through which surface
   (the Web App? the API? the import job?).
4. **No restated requirement** — "Then the system fulfils the requirement" and
   "Then the result is persisted and visible" are placeholders in spirit.

## Worked rewrites (bad → good)

**A CRUD feature** — "Save an article from a URL"

> ✗ **Given** the app is available **When** they save an article from a URL
> **Then** the result of "save an article" is persisted and visible to the user

> ✓ **Given** a logged-in user with a reachable article URL
> **When** they submit it via the Web App or browser extension
> **Then** the readable article body (title, text, images) is extracted and
> stored locally, and the article appears at the top of their list within 2
> seconds [E4]

**A search feature** — "Full-text search across saved articles"

> ✓ **Given** a library of 5,000 saved articles
> **When** the user searches a two-word query with one typo
> **Then** matching articles are returned in under 500 ms, ranked by relevance,
> with the typo tolerated [E3]

**A failure path** (every must-have needs at least one)

> ✗ **Given** something goes wrong **When** the user acts **Then** an error is shown

> ✓ **Given** the article URL returns HTTP 404 or times out after 10 seconds
> **When** the user submits it
> **Then** the save is rejected with the specific reason, nothing partial is
> stored, and the user can retry without re-entering the URL

**An import/batch feature** — ground limits in prior art when you have it

> ✓ **Given** a Pocket export of up to 10,000 articles
> **When** the user imports it
> **Then** items import in batches with visible progress, and a single failed
> item is skipped and reported — the import never aborts wholesale [E5]

Notice the last two: prior-art evidence (an OSS issue about large imports
timing out) is exactly what turns a guessed bound into a grounded one. Cite it.

## NFR metrics — measurable patterns per category

Replace any metric that merely promises measurement ("a measurable target is
agreed and tracked") with the target itself. Patterns:

| Category | Pattern | Example |
|---|---|---|
| performance | p50/p95 latency + load | p95 < 300 ms for search at 50 concurrent users |
| reliability | availability + recovery | 99.9% monthly; RPO ≤ 24 h, RTO ≤ 1 h on restore |
| security | authz surface + secret handling | every endpoint authenticated; secrets never in logs; deps scanned in CI |
| usability | task completion | a new user saves their first article in < 2 min without help |
| observability | diagnosis without repro | every request carries a trace id; error-rate + latency alerts on SLO breach |
| cost | unit economics + ceiling | infra < $10/month at 1,000 users on the stated budget |
| accessibility | conformance level | WCAG 2.1 AA on the save/read/search flows |
| privacy | data rights | export + delete available; retention ≤ 90 days by default |

Two rules of judgement:

- **Numbers come from somewhere.** Prefer a bound from the brief (a goal, the
  budget) or the evidence (docs claiming sub-second search [E3], an issue about
  timeouts [E5]) over an invented one. Cite the source with `[E#]`. If you must
  pick a number unsupported, say so in the metric ("target, unvalidated").
- **The metric must be falsifiable on this product.** "Scales infinitely" and
  "no bugs" are not metrics. If you cannot describe the measurement, the metric
  is not done.
