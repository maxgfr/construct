# A worked brief — what `brief.json` looks like when it is done

`references/interview-playbook.md` lists the fields. This shows one filled in,
and the exchanges that produced the three hardest ones. Copy the shape, not the
content.

## The exchanges

Three questions where the answer the user *first* gives is not the answer you
want. Notice that each recommends something — never an open prompt.

> **You:** What hurts today, and for whom? One sentence if you can.
> **User:** People lose track of articles they meant to read.
> **You:** Two things hide in that — losing track *while saving*, and losing
> track *when looking for it later*. My read is the second is the real pain, and
> the first is table stakes. Shall I write the problem as "people save articles
> but never find them again"?
> **User:** Yes, and add that hosted services die and take the data.
> → `product.problem`: "People save articles to read later but never find them
> again; hosted services lock data in and die."

The move: the user gave a symptom. You proposed a sharper problem statement and
let them veto it. A vague `problem` produces a vague vision and a scope nobody
can hold you to.

> **You:** Goals should be outcomes, not features. I'd suggest "a user can save
> and reliably re-find any article within seconds" — does that capture it?
> **User:** Yes. And I'd like 1,000 installs in year one.
> → `goals`: both, as separate strings.

The move: the user will offer features here ("full-text search"). Features go in
`featureWishlist`. A goal is something a feature could *fail* to achieve — that
is what makes it a success metric later.

> **You:** Five features so far. Which are must-haves for the first release? My
> read: save, search and offline read are musts; tags and import are shoulds.
> **User:** Import has to be a must — nobody switches without it.
> → `featureWishlist`: import moves to `must`.

The move: force must/should/could. It drives the build-plan milestones directly,
and "everything is a must" produces a plan with no order.

## The brief

The full file is committed at `tests/fixtures/sample-brief.json` and is what
`assets/example-srd/` was rendered from. The load-bearing parts:

```json
{
  "schemaVersion": 1,
  "idea": "a self-hosted read-it-later app with fast full-text search and tagging",
  "product": {
    "name": "Readpile",
    "problem": "People save articles to read later but never find them again; hosted services lock data in and die.",
    "users": ["self-hosting individuals", "small teams sharing a knowledge base"],
    "valueProp": "Own your reading queue: a private, fast, searchable archive of everything you save."
  },
  "goals": [
    "A user can save and reliably re-find any article within seconds",
    "Reach 1,000 self-hosted installs in the first year"
  ],
  "nonGoals": ["A hosted multi-tenant SaaS offering", "A social/sharing network"],
  "constraints": {
    "budget": "side-project, near-zero infra budget",
    "timeline": "MVP in 8 weeks",
    "team": "one full-stack developer",
    "compliance": ["GDPR (self-hosted, user owns data)"]
  },
  "candidateTech": ["PostgreSQL", "Meilisearch", "Next.js"],
  "competitors": ["Pocket", "Instapaper", "Omnivore"],
  "ossSeeds": ["https://github.com/omnivore-app/omnivore", "https://github.com/wallabag/wallabag"],
  "featureWishlist": [
    {
      "title": "Save an article from a URL or browser extension",
      "priority": "must",
      "notes": "Extract clean readable content and store it offline, so that the saved copy renders without the original site being reachable."
    }
  ],
  "nfrPriorities": ["performance", "privacy", "reliability"],
  "openQuestions": []
}
```

## What makes this brief work

- **`notes` on a feature carry a verb and a bound.** "…so that the saved copy
  renders without the original site being reachable" is what lets the renderer
  seed a concrete acceptance criterion instead of a tautology. A feature with a
  bare title gets a placeholder you then have to rewrite by hand.
- **`competitors` and `ossSeeds` are named, not implied.** They seed the market
  and oss angles directly; discovery is a fallback, not the plan.
- **`candidateTech` lists three, not ten.** The `tech` angle grounds the first
  `--max-tech` (default 3) and says so in the notes. Ten candidates means seven
  ungrounded ones or a much longer run.
- **`nonGoals` are real refusals.** "A hosted multi-tenant SaaS offering" is what
  makes ADR-0002 a decision rather than an observation, and it is what `check`
  uses to catch an FR that contradicts scope.
- **`openQuestions` is empty.** Every entry renders as a 🧠 callout that
  **blocks** the structural gate. Put a decision here only when you genuinely
  intend to make it before the SRD ships.

## Field types that bite

`product.users`, `goals`, `nonGoals`, `candidateTech`, `competitors`,
`ossSeeds`, `nfrPriorities`, `openQuestions`, `constraints.compliance`,
`design.platforms` and `design.referenceSystems` are **arrays of strings**. A
bare string is coerced into a one-element array with a warning — nothing is
lost, but write the array.

`constraints` reads only `budget`, `timeline`, `team`, `compliance`. Any other
key is dropped with a named warning; fold a stray constraint into the nearest
recognised field or into `openQuestions`.
