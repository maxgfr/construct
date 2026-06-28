# Provider APIs (OSS issues & PRs) — keyless

The `oss` angle mines comparable open-source projects for **prior art** (a
language/feature fingerprint) and **real pitfalls** (related issues and PRs).
Cloning is provider-agnostic (plain `git clone` of any public URL). Only
issues/PRs need a host API. `construct` selects a provider by the repo's host and
queries it **without requiring any API key**. Hosts with no public API degrade
honestly (the dossier says so) rather than implying a search happened.

## GitHub (`github.com` and Enterprise)

- **Preferred:** the `gh` CLI (`gh api search/issues`). Reuses the user's
  existing `gh` authentication — no new key — for authenticated rate limits.
  Install/login: `gh auth login`.
- **Fallback:** the public REST search endpoint
  `https://api.github.com/search/issues`, unauthenticated (~10 search req/min;
  fine for a handful of queries).
- **Query shape:** `repo:<owner>/<repo> type:issue|pr <keywords>`, recently
  updated first.
- **Progressive relaxation:** GitHub free-text search ANDs its terms, so a query
  with many keywords over-constrains to zero. `construct` tries the 3 most
  *distinctive* keywords, then 2, then each top keyword alone, taking the first
  non-empty result.

## GitLab (`gitlab.com`, self-managed)

- Public REST v4, unauthenticated read of public projects.
- Project addressed by URL-encoded full path, so **subgroups** work:
  `/api/v4/projects/<group%2Fsub%2Frepo>/issues` and `/merge_requests`.

## Other hosts (Bitbucket, Gitea, bare URLs, …)

No issue/PR API is queried; the code is still cloned and fingerprinted, and the
dossier notes issues/PRs aren't retrievable. To add a host, drop a new provider
in `src/providers/` and register it (same registry pattern).

## StackOverflow

Not a git host, but retrieved the same keyless way via the StackExchange API by
the `tech` angle (and the `so` drill). Anonymous access is rate-limited (page
≤ 25, ~1 req/min); an optional `STACK_PAT` env var raises the limit but is never
required.

## Seeding repos directly

Skip discovery by listing repos in `brief.ossSeeds`, or pass `--seeds`:
```
node scripts/construct.mjs oss --out <run> --seeds https://github.com/o/r,https://gitlab.com/g/p
```
