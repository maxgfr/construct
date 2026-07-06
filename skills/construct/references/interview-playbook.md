# Interview playbook — eliciting the brief

The interview captures the product *intent* before any research. Run it as a
conversation, **one question at a time**, and **recommend an answer** with each
question (drawn from the idea and anything already said). Never dump a
questionnaire. Stop early if the user says it's enough — a thinner brief just
means more 🧠 callouts later.

Write the answers into `brief.json` (start it with
`construct init --idea "<one-liner>" --out <run>`). The fields map directly to
the SRD.

## Scope gate — when NOT to run construct

Check the fit before question 1; a wrong fit wastes the whole loop.

- **Existing codebase (brownfield).** construct specs *greenfield* products.
  To document or evolve an existing repo, point the user at a repo-grounded
  tool instead (e.g. `reconstruct`). Run construct only for a genuinely new
  product, even one that will live next to existing code.
- **Several products in one ask.** Scope to ONE: name the split, recommend
  which to spec first, park the rest. One run = one product.
- **No articulable idea.** `init` needs a one-liner. If the user can't state
  the problem in a sentence, help them get to one first — don't start a run
  on "an AI thing".

## Pruning the interview

- Skip any question whose answer you can confidently infer from the idea or a
  prior answer: state the inference ("I'll assume solo dev, no budget — veto
  if wrong") and move on.
- If one question stalls after ~3 attempts, propose a concrete default, record
  the hesitation as an `openQuestions` entry, and move on — the 🧠 callout
  forces the decision before the SRD can pass `check` anyway.

## What to elicit (roughly in order)

1. **Problem** → `product.problem`. What hurts today, for whom? One sentence.
2. **Users** → `product.users`. Who are the 1–3 distinct user types?
3. **Value proposition** → `product.valueProp`. Why this over the status quo?
4. **Goals** → `goals`. Outcomes/metrics, *not* features ("re-find any article
   in seconds", "1,000 installs in year one").
5. **Features** → `featureWishlist`. Each `{title, priority: must|should|could,
   notes}`. Push for must vs. should vs. could — it drives the build plan.
   Keep titles unique across the wishlist: BUILD-PLAN progress is merged across
   re-renders by feature title, so two identical titles would share one task.
6. **Modules** → `modules` (optional — *modules mode*). When the product is
   naturally modular (>~6 features, or the user names a modular target like
   `src/modules/…`), propose a decomposition: each `{id, name, description?,
   dependsOn?}`, and set `module: "<id>"` on **every** feature (the gate is
   all-or-nothing). Ids are slugs and become `prd/<id>/` folder names — mirror
   the intended code layout so a module's PRD maps 1:1 to its future folder.
   Render then emits one PRD per module and tags BUILD-PLAN tasks with it.
7. **Non-goals** → `nonGoals`. What you're explicitly *not* building.
8. **Constraints** → `constraints` (budget, timeline, team, compliance).
9. **Candidate technologies** → `candidateTech`. Stacks/services to evaluate;
   the `tech` angle grounds these against docs + StackOverflow.
10. **Competitors** → `competitors`. Named alternatives; seed the `market` angle.
11. **OSS seeds** → `ossSeeds`. Known comparable repos to mine (optional; the
    `oss` angle can also discover them).
12. **NFR priorities** → `nfrPriorities` (performance, security, privacy, a11y…).
13. **Design intent** → `design` (optional, all fields optional). Target
    `platforms` (web/iOS/Android/desktop), `brandConstraints` (existing brand or
    greenfield), `referenceSystems` to emulate (Material, shadcn…), an explicit
    `accessibilityTarget` (e.g. RGAA 4.1 — otherwise derived from compliance /
    nfrPriorities, default WCAG 2.2 AA) and a `tone`. Drives the `complex`
    design system (`design/`). Skip it for a `light`/non-UI spec.
14. **Open questions** → `openQuestions`. Genuine decisions the user hasn't made.
    These render as `🧠 Decide:` callouts and **block the structural gate** until
    resolved — so only put real, deferred decisions here.

## Tips

- Prefer multiple-choice or "A or B?" phrasing; it's easier to answer.
- Reflect back what you heard before moving on.
- It's fine to leave fields empty — `validateBrief` warns, and the renderer fills
  generic scaffold the agent and user refine later.
