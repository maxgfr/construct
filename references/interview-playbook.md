# Interview playbook — eliciting the brief

The interview captures the product *intent* before any research. Run it as a
conversation, **one question at a time**, and **recommend an answer** with each
question (drawn from the idea and anything already said). Never dump a
questionnaire. Stop early if the user says it's enough — a thinner brief just
means more 🧠 callouts later.

Write the answers into `brief.json` (start it with
`construct init --idea "<one-liner>" --out <run>`). The fields map directly to
the SRD.

## What to elicit (roughly in order)

1. **Problem** → `product.problem`. What hurts today, for whom? One sentence.
2. **Users** → `product.users`. Who are the 1–3 distinct user types?
3. **Value proposition** → `product.valueProp`. Why this over the status quo?
4. **Goals** → `goals`. Outcomes/metrics, *not* features ("re-find any article
   in seconds", "1,000 installs in year one").
5. **Features** → `featureWishlist`. Each `{title, priority: must|should|could,
   notes}`. Push for must vs. should vs. could — it drives the build plan.
6. **Non-goals** → `nonGoals`. What you're explicitly *not* building.
7. **Constraints** → `constraints` (budget, timeline, team, compliance).
8. **Candidate technologies** → `candidateTech`. Stacks/services to evaluate;
   the `tech` angle grounds these against docs + StackOverflow.
9. **Competitors** → `competitors`. Named alternatives; seed the `market` angle.
10. **OSS seeds** → `ossSeeds`. Known comparable repos to mine (optional; the
    `oss` angle can also discover them).
11. **NFR priorities** → `nfrPriorities` (performance, security, privacy, a11y…).
12. **Open questions** → `openQuestions`. Genuine decisions the user hasn't made.
    These render as `🧠 Decide:` callouts and **block the structural gate** until
    resolved — so only put real, deferred decisions here.

## Tips

- Prefer multiple-choice or "A or B?" phrasing; it's easier to answer.
- Reflect back what you heard before moving on.
- If the request spans several independent products, say so and scope to one.
- It's fine to leave fields empty — `validateBrief` warns, and the renderer fills
  generic scaffold the agent and user refine later.
