# Changelog

All notable changes to this project are documented here, generated automatically from the [Conventional Commits](https://www.conventionalcommits.org/) by [semantic-release](https://github.com/semantic-release/semantic-release).

# [1.11.0](https://github.com/maxgfr/construct/compare/v1.10.0...v1.11.0) (2026-07-09)


### Features

* **orchestrate:** emit the research/claim-review/adr-judges/build fan-outs + contracts + runbook ([#12](https://github.com/maxgfr/construct/issues/12)) ([1fe0a53](https://github.com/maxgfr/construct/commit/1fe0a539615957d798670ccb635a0a5513fc598e))

# [1.10.0](https://github.com/maxgfr/construct/compare/v1.9.3...v1.10.0) (2026-07-08)


### Bug Fixes

* **brief:** coerce bare-string array fields and name unknown constraints keys ([99fbf8b](https://github.com/maxgfr/construct/commit/99fbf8b918250546eb82b3c9b883a5207c20474d))
* **check:** fail closed on --semantic and re-reduce verdicts at check time ([bcea5a1](https://github.com/maxgfr/construct/commit/bcea5a1b533cce59df341cfc8fe40360a43bb267))
* **research:** strip consent boilerplate and surface low-signal snippets ([08db4c0](https://github.com/maxgfr/construct/commit/08db4c0c05e5edb13ffdb8b796035d290e25b60d))
* **research:** tag-scoped StackOverflow queries and an off-topic post-filter ([ed563cb](https://github.com/maxgfr/construct/commit/ed563cb840c91f58a49097f169f80ac982a430cd)), closes [hi#vote](https://github.com/hi/issues/vote)
* **semantic:** ship docker-compose + searxng settings inside the skill bundle ([38210a2](https://github.com/maxgfr/construct/commit/38210a238a970a16f32382b3fce298882f21f05a))
* **srd,check:** competitor grounding requires a literal mention; warn loudly when cited claims skip the semantic gate ([5517ded](https://github.com/maxgfr/construct/commit/5517ded59893ede3a8c0047c52080e55544b92ac))
* **srd,check:** templated acceptance criteria fail at complex; adjectival prefixes never become entities ([ca73c92](https://github.com/maxgfr/construct/commit/ca73c92485b457c963cd04b71d31d36ad6b6d952))


### Features

* **brainstorm:** divergent ideation mode with a deterministic merge into the brief ([adf510e](https://github.com/maxgfr/construct/commit/adf510e1c9f6e459ebf84dd99d10870d8f1a42a2))
* **render:** --from-srd re-emits the tree from SRD.json without rebuilding ([77eb171](https://github.com/maxgfr/construct/commit/77eb171756370aa8cf76655d7b59de3cb803f594))
* **review:** adjudicate every cited pair by default; --max-review caps explicitly and loudly ([9cb4399](https://github.com/maxgfr/construct/commit/9cb439920489c6155a85ad2850a34b2e6e56ec16))

## [1.9.3](https://github.com/maxgfr/construct/compare/v1.9.2...v1.9.3) (2026-07-07)


### Bug Fixes

* **srd,oss,clone,review,cli:** correct 8 bugs surfaced while hardening tests ([67e56fe](https://github.com/maxgfr/construct/commit/67e56fe589cfc2cd853095559902d421599f6933))

## [1.9.2](https://github.com/maxgfr/construct/compare/v1.9.1...v1.9.2) (2026-07-06)


### Bug Fixes

* **review:** claim-focused digests in the claim-support worklist ([023acb7](https://github.com/maxgfr/construct/commit/023acb7b2147805f6da6f7792f613740d17ba959))

## [1.9.1](https://github.com/maxgfr/construct/compare/v1.9.0...v1.9.1) (2026-07-06)


### Bug Fixes

* **srd:** word-bound the calendar boundary regex ([488db49](https://github.com/maxgfr/construct/commit/488db493073b2b25be1f22be955c829c6f21debe))

# [1.9.0](https://github.com/maxgfr/construct/compare/v1.8.0...v1.9.0) (2026-07-06)


### Features

* **research:** excerpt market pages against the brief's feature texts ([fc25c51](https://github.com/maxgfr/construct/commit/fc25c5145c75f36cc106ba950d3b623fa2eb80fc))

# [1.8.0](https://github.com/maxgfr/construct/compare/v1.7.0...v1.8.0) (2026-07-06)


### Features

* **research:** --url pins market pages into the dossier ([2a1af60](https://github.com/maxgfr/construct/commit/2a1af601e81d1f88e9bb8f0545056fd28499aca1))

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
