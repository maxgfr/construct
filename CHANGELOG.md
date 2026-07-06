# Changelog

All notable changes to this project are documented here, generated automatically from the [Conventional Commits](https://www.conventionalcommits.org/) by [semantic-release](https://github.com/semantic-release/semantic-release).

# [1.7.0](https://github.com/maxgfr/construct/compare/v1.6.0...v1.7.0) (2026-07-06)


### Features

* **render:** modules mode — one PRD per module — plus --prd per-FR export ([57c556d](https://github.com/maxgfr/construct/commit/57c556d3b055de91fa30077377355ed462b365da))

# [1.6.0](https://github.com/maxgfr/construct/compare/v1.5.2...v1.6.0) (2026-06-28)


### Features

* harden providers, prune dead helpers, gate releases on lint ([0ffb339](https://github.com/maxgfr/construct/commit/0ffb33992493f6497ac9ce7dc17f4448f624bd84))

## [1.5.2](https://github.com/maxgfr/construct/compare/v1.5.1...v1.5.2) (2026-06-28)


### Bug Fixes

* **skill:** package skill under skills/construct so `npx skills add` bundles the engine ([ea9cf71](https://github.com/maxgfr/construct/commit/ea9cf7124f5970a3fe3f854959abd515aa4d77e8))

## [1.5.1](https://github.com/maxgfr/construct/compare/v1.5.0...v1.5.1) (2026-06-24)


### Bug Fixes

* **plan,check:** preserve design-task progress and stop 🧠 gate false-positives ([a4acfbf](https://github.com/maxgfr/construct/commit/a4acfbf89044f025498a0c6cc652bd97e0999a4f))

# [1.5.0](https://github.com/maxgfr/construct/compare/v1.4.0...v1.5.0) (2026-06-24)


### Features

* **design:** add a design-system mode to the SRD (tokens, components, screens, a11y) ([cd0496d](https://github.com/maxgfr/construct/commit/cd0496d5d7ebe320671583067ab697bc8eb9945e))

# [1.4.0](https://github.com/maxgfr/construct/compare/v1.3.0...v1.4.0) (2026-06-16)


### Bug Fixes

* **review:** clean domain errors, reject malformed verdicts, flag omitted claim pairs ([e585caf](https://github.com/maxgfr/construct/commit/e585caf44ff0024797bd20eb57818be146a44eb3))


### Features

* **cli:** add status --json ready-frontier query for parallel build fan-out ([153a285](https://github.com/maxgfr/construct/commit/153a285b01629b28146e2e45c5573ad2a88987d9))
* **skill:** three-tier dynamic-workflow orchestration with claim-support and build fan-out ([5c1d284](https://github.com/maxgfr/construct/commit/5c1d284cbf350c9265a5c4eec2fca156ba354ae6))

# [1.3.0](https://github.com/maxgfr/construct/compare/v1.2.0...v1.3.0) (2026-06-15)


### Features

* semantic claim-support gate — review + check --semantic ([#8](https://github.com/maxgfr/construct/issues/8)) ([129cf31](https://github.com/maxgfr/construct/commit/129cf317a11c58f436938d9fa1b3e2ffcddda474))

# [1.2.0](https://github.com/maxgfr/construct/compare/v1.1.0...v1.2.0) (2026-06-11)


### Bug Fixes

* **clone:** report both clone attempts and a missing git binary distinctly ([844ccc7](https://github.com/maxgfr/construct/commit/844ccc73435d5cfe7efb8f455e3dc981805c3ccc))
* **oss:** never treat a GitHub/GitLab site section as a repo seed ([4ac6bcf](https://github.com/maxgfr/construct/commit/4ac6bcf8ba82745dfb528f01aef512da103c5a03))
* **srd:** dedupe matched evidence on a stable key when url is absent ([032f891](https://github.com/maxgfr/construct/commit/032f891b97099c0060b032df8f340b00cb0254b4))
* **verify:** detect rspec, pytest-prefix and JVM-suffix test files ([aa1d4d9](https://github.com/maxgfr/construct/commit/aa1d4d9fd5be94f29524ee4ae33875df3a4a4de4))


### Features

* **brief:** surface normalization warnings instead of dropping data silently ([32f077d](https://github.com/maxgfr/construct/commit/32f077d0505a8140953c33ed8afbc7aa98f2f6ba))
* **fetch:** retry httpGet with backoff and Retry-After on 5xx/429 ([14df6a4](https://github.com/maxgfr/construct/commit/14df6a41b2cc2479fb129a09a27e458742766814))
* **research:** wire --docs-url into the tech angle and drill ([991c655](https://github.com/maxgfr/construct/commit/991c6558830c86810fe245eb90e5c40bedee644d))

# [1.1.0](https://github.com/maxgfr/construct/compare/v1.0.2...v1.1.0) (2026-06-10)


### Features

* build phase — machine-readable BUILD-PLAN.json and `construct verify` ([acfc292](https://github.com/maxgfr/construct/commit/acfc2921119f839f76abd42ec04cf0f54078bf5c))
* multi-agent orchestration playbook — research fan-out, red team, judge panel ([8e730ee](https://github.com/maxgfr/construct/commit/8e730eefc849ee876da1038167288aa6a116c583))
* sharpen the SRD — analyze gaps, infer data model, opt-in grounding gate ([4dafe85](https://github.com/maxgfr/construct/commit/4dafe85e5155e0571fdff9774bddfa17f3470e21))

## [1.0.2](https://github.com/maxgfr/construct/compare/v1.0.1...v1.0.2) (2026-06-09)


### Bug Fixes

* enforce non-empty FR in check, drop stale SRD.md, note tech cap ([3c017c6](https://github.com/maxgfr/construct/commit/3c017c6d60c2e3aad3f9a0ff255e7ec078c8a63f))

## [1.0.1](https://github.com/maxgfr/construct/compare/v1.0.0...v1.0.1) (2026-06-09)


### Bug Fixes

* resolve 24 correctness bugs from the adversarial bug hunt ([f610c20](https://github.com/maxgfr/construct/commit/f610c202030ab28297c5aea9750f93f850565756))

# 1.0.0 (2026-06-08)


### Features

* initial construct skill — grounded SRD generator ([dd022c3](https://github.com/maxgfr/construct/commit/dd022c3fd53c158d5891d56f2dc1aa4331065ec6))
* raise SRD quality from the adversarial audit ([d39ae04](https://github.com/maxgfr/construct/commit/d39ae04a9413938ee88ae1b5b832fd7da252754b))
