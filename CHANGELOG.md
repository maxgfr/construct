# Changelog

All notable changes to this project are documented here, generated automatically from the [Conventional Commits](https://www.conventionalcommits.org/) by [semantic-release](https://github.com/semantic-release/semantic-release).

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
