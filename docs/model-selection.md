# Model Selection Guide

## Was Opus the best model for creating these plans?

**Yes, Opus was the right choice for planning.** These plans demonstrate several qualities that play to Opus's strengths:

- **Architectural breadth** — The `app-strategy.md` plan coordinates 4 platforms, shared design tokens, codegen configs, monorepo structure, and parallel agent workflows. That requires holding many interacting concerns in context simultaneously.
- **Gotcha documentation** — The `production-readiness.md` and `deploy-api.md` plans capture hard-won debugging details (Prisma SSL quirks, Supabase connection string format traps, PgBouncer double-`?` bugs). Opus is better at anticipating and surfacing these edge cases.
- **Sequencing and dependency reasoning** — The `improvement-roadmap.md` correctly identifies that deployment unblocks indexes, indexes should precede traffic, images must precede client apps, etc. This kind of multi-step dependency analysis is where Opus outperforms.
- **Correct tool/approach selection** — The `image-gathering.md` plan explicitly reasons about *why* a standalone script beats a Claude agent for the batch job (rate limiting, resumability, cost). That meta-reasoning is an Opus-tier judgment call.

**How would Sonnet 4.6 have done?** Sonnet could have produced adequate plans for the simpler ones (`add-indexes.md`, `deploy-api.md`). For the more complex plans (`app-strategy.md`, `production-readiness.md`), Sonnet would likely:
- Miss some of the edge cases and gotchas
- Produce less precise sequencing (e.g., might not have caught the variant filtering issue or the SSL/connection string pitfalls)
- Generate a less cohesive multi-platform strategy — the `app-strategy.md` plan's agent constraint system and shared content compilation pipeline is quite sophisticated
- Still produce a *usable* plan, just one you'd need to revise more during implementation

**Verdict: Opus for complex/architectural plans, Sonnet is fine for straightforward plans** like adding indexes or deploying to a known platform.

---

## For implementing these plans, is Sonnet sufficient?

**Sonnet 4.6 is sufficient for most of the implementation work**, and is the better cost/speed tradeoff for:

- **Mechanical coding tasks** — Writing the fetch-covers script, adding Prisma indexes, setting up Express middleware, writing tests. These are well-specified in the plans and don't require creative judgment.
- **Following established patterns** — The plans already document the exact files, libraries, and code patterns. Sonnet executes well against clear specifications.
- **Individual app builds** — Each of the 4 DC Decade apps has a detailed spec. Sonnet can follow the step-by-step implementation sequences in `app-strategy.md`.

**Where Opus would still be better for implementation:**

- **Debugging unexpected failures** — When Supabase SSL didn't work as expected, or when the Prisma adapter-pg ignored config options, that required deeper reasoning to diagnose.
- **Cross-cutting integration** — Phase 2 of the app strategy (merging 4 branches, resolving inconsistencies) benefits from Opus's broader reasoning.
- **Schema design decisions** — If the GraphQL schema needs changes discovered during implementation, Opus is better at evaluating ripple effects.

**Verdict: Use Sonnet for the bulk of implementation, escalate to Opus when you hit unexpected problems or need to make design decisions not covered by the plan.**

---

## Are there uses for Haiku in this project?

**Yes, a few narrow ones:**

1. **Running the test suite and interpreting results** — After Sonnet writes code, Haiku can run `npm test` and report pass/fail. It's fast and cheap for this.
2. **Linting and formatting checks** — Running ESLint, checking for type errors, reporting diagnostics.
3. **Simple file lookups and reads** — "What's the current value of X in this config file?" type queries.
4. **Git operations** — Committing, checking status, creating branches — mechanical tasks with clear outputs.
5. **Quick code generation from templates** — If you need to generate repetitive boilerplate (e.g., the platform-specific design token files from `tokens.yaml`), Haiku can handle template expansion.

**Where Haiku would struggle:**
- Any task requiring multi-file reasoning or architectural awareness
- Debugging failures that require understanding the full system
- Writing the plans themselves

**Verdict: Haiku is useful as a fast, cheap runner for mechanical subtasks, but this project's complexity means most work needs at least Sonnet.**

---

## Summary

| Task | Recommended Model |
|---|---|
| Architectural planning, complex plans | **Opus** |
| Simple/scoped plans (single feature) | Sonnet |
| Implementing well-specified plan steps | **Sonnet** |
| Debugging unexpected failures | Opus |
| Cross-platform integration | Opus |
| Running tests, linting, git ops | **Haiku** |
| Repetitive codegen/boilerplate | Haiku |
