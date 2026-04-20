# Plan: Post-DO-Migration Data Parity — Covers & Stable Series IDs

## Context

**Problem.** After the Supabase+Railway → DigitalOcean cutover (completed 2026-04-17, plan `migrate-to-digitalocean.md`), the new API at `https://api.dcdecade.com/graphql` serves the schema correctly but the **data is pristine-GCD**, not the Cloudinary-enriched dataset the frontend was built against. Downstream (dc-decade) observes:

1. **`Issue.coverImageUrl` is null for every issue.** The field is declared on the Issue type and there is no custom resolver — it's a plain pass-through of `gcd_issue.cover_image_url`. The column is simply empty on DO.
2. **Series IDs pinned on the homepage (e.g. `2876` for "Crisis on Infinite Earths") return null.** `allSeries` and `series(id:)` work, but specific integer IDs from the old Supabase DB don't land on the new data.

**Root cause (hypothesis, to be confirmed in Step 1).** Step 3 of the migration loaded `scripts/dc-comics-postgres.sql` — generated 2026-02-19 from the GCD dump `2026-02-15.sql` filtered to publisher 54 — directly into DO Postgres. That SQL is the raw GCD starting point and contains no `cover_image_url` or `comic_vine_id` values; those columns were added by migration `20260227181500_add_cover_image_fields` as NULLABLE, then populated *post-hoc* on Supabase by `src/scripts/fetch-covers.ts` (Comic Vine → Cloudinary upload → DB UPDATE). The DO import carried over the *schema* (via Prisma migrate deploy in `scripts/load-to-remote.sh` Phase 3) but not the Supabase-only backfill. For Series IDs: the GCD dump preserves explicit integer IDs in its INSERTs, so DO IDs *should* match Supabase IDs row-for-row — the frontend's pinned IDs may have come from a differently-vintaged or differently-scoped dump. Step 1 verifies before we commit to a theory.

**Intended outcome.**
- `coverImageUrl` is non-null for every Issue that had one on Supabase (same Cloudinary URLs, no re-upload needed).
- The API exposes a **stable, human-readable identifier** on `Series` (a deterministic `slug`) so downstream consumers are not locked to Postgres autoincrement PKs across future re-imports.
- A short mapping doc tells the dc-decade repo the current IDs + slugs for the homepage-pinned series, so it can flip from integer pins to slug pins.

**Key simplification.** The Cloudinary assets already exist and remain live; the `cover_image_url` column is just a string pointing at `res.cloudinary.com/...`. Fixing coverage on DO = copying that string from Supabase into DO. **No re-upload, no Comic Vine calls, no Cloudinary writes.** Cloudinary's internal `public_id` (e.g., `issue-{id}`) is metadata on their side — it does not need to match the DO row's `id` for the URL to resolve.

**Out of scope.**
- Running `fetch-covers.ts` (Comic Vine → Cloudinary upload). Not needed: the URLs already exist on Supabase for every issue that has one. Even if Step 1 finds ID drift, we match Supabase URLs to DO rows by composite key — never re-upload.
- Backfilling issues that were never covered on Supabase in the first place (Cloudinary has no asset for them). Those stay null; out of scope.
- Changing the GCD import pipeline (`scripts/migrate-to-postgres.py`) or switching away from Prisma.
- Any frontend changes. Downstream coordination is captured in a final mapping doc but the dc-decade repo is touched in its own PR.

**User context.** Rod is EM-level, job-searching; this project is a side/portfolio piece. Prefer small atomic PRs with reviewable diffs over one giant sweep. Project stack: Node 24 + Apollo + Prisma + Postgres; tests are Vitest.

---

## Prerequisites

- Supabase project is **still live** (user confirmed). Connection string for it is available locally (was the pre-migration `DATABASE_URL`; user has it in 1Password / local `.env` history).
- Access to the DO droplet via `~/.ssh/droplet` at `rod@142.93.202.59` (same key used by `scripts/load-to-remote.sh`).
- DO Postgres reachable on port 6432 via PgBouncer with `sslmode=require` (per `.env.example`).
- Feature branch not yet created; plan is on `main`.

---

## Step 0 — Branch, PR bootstrap, pre-flight checks
**Model/Effort**: **Sonnet / medium**
**Justification**: Routine, but the pre-flight includes live connectivity checks to both Supabase and DO that must succeed before later steps are safe. No novel reasoning needed; Haiku is under-tooled for diagnosing a TLS/auth failure if one surfaces.
**Context-clear**: no
**TDD/tests-alongside**: n/a (pre-flight is shell verification, not code)
**Files modified**: none (branch + PR only)

Actions:
1. Create feature branch `feature/post-migration-data-parity` off `main`.
2. Push an empty branch; open a non-draft PR against `main` titled "Post-migration data parity: covers + stable series IDs", body links this plan.
3. Pre-flight connectivity:
   - `psql "$SUPABASE_URL" -c "SELECT COUNT(*) FROM gcd_issue WHERE cover_image_url IS NOT NULL;"` — captures how many rows we expect to backfill.
   - `psql "$DO_URL" -c "SELECT COUNT(*) FROM gcd_issue;"` — confirms DO is reachable via PgBouncer.
   - `curl -s -X POST https://api.dcdecade.com/graphql -H 'Content-Type: application/json' -d '{"query":"{ __typename }"}'` — confirms public endpoint is up.
4. Record the three numbers in the PR description so later steps have a baseline.

**Verify**:
- `git branch --show-current` returns `feature/post-migration-data-parity`.
- `gh pr view` shows the PR open against `main`.
- CI is green on the empty commit (inherited workflow from `migrate-to-digitalocean` PR).
- All three pre-flight commands succeed; numbers recorded in PR description.

---

## Step 1 — Diagnose: verify ID stability and cover-URL delta ✅
**Model/Effort**: **Opus / high**
**Justification**: (a) Ambiguity is high — we have a hypothesis (GCD dump preserves IDs → Supabase & DO IDs align) but haven't proven it; (b) wrong conclusion compounds: if IDs have drifted, Step 2's fast backfill-by-ID is silently wrong and writes valid-looking but misaligned Cloudinary URLs into DO; (c) correctness is hard to verify post-hoc — once wrong data is written, teasing it out is painful. Worth the deliberate model. Not xhigh because the diagnostic surface is well-scoped (two DBs, specific tables, specific columns).
**Context-clear**: yes (distinct chapter — pure investigation, benefits from fresh context after branch setup)
**TDD/tests-alongside**: tests-alongside (diagnosis produces a written report, not production code; any queries worth keeping go into `scripts/` with lightweight Vitest coverage)
**Files modified** (new):
- `scripts/diagnose-parity.sh` — repeatable diagnostic runner
- `docs/plans/notes/parity-diagnosis.md` — findings, committed alongside the branch for PR reviewers

Actions:
1. **Row-count parity** across `gcd_publisher`, `gcd_series`, `gcd_issue`, `gcd_story`, `gcd_story_credit`, `gcd_creator`, `gcd_creator_name_detail` on both Supabase and DO. Expect exact match (same source dump). Any delta is a red flag — investigate before proceeding.
2. **ID stability spot-check (the load-bearing check).** On **both** Supabase and DO, run:
   ```sql
   SELECT id, name, year_began FROM gcd_series
   WHERE name ILIKE 'Crisis on Infinite Earths%'
   ORDER BY id;
   ```
   Compare. Also run for 3–4 other well-known series (Batman, Action Comics, Detective Comics, Watchmen) to make sure the pattern is consistent.
3. **Frontend-ID reality check.** Query Supabase for `SELECT id, name FROM gcd_series WHERE id = 2876` and for DO the same. Three possible outcomes:
   - (A) Both return "Crisis on Infinite Earths" → DO has the data under the same ID; the downstream failure is somewhere else (resolver? connection? CORS?). Investigate API response directly with `curl`.
   - (B) Supabase returns the expected row; DO returns null → IDs diverged between dumps. Shift Step 2 to match on `(series_name, year_began, issue_number)` composite, and make Step 3's slug addition more urgent.
   - (C) Neither returns it → the frontend's pinned IDs were wrong all along (stale snapshot). Step 3 (slug) is still the right long-term fix; the near-term fix is just publishing the correct IDs/slugs for dc-decade.
4. **Cover-URL delta**: on Supabase, `SELECT COUNT(*), COUNT(cover_image_url), COUNT(comic_vine_id) FROM gcd_issue WHERE deleted = 0;` — gives us (total, backfilled-cover, backfilled-cv-id). Same query on DO. Delta defines the backfill workload.
5. **Sample inspection**: pick 5 random issues from Supabase with non-null `cover_image_url`. Confirm the same row exists on DO (by `id` under outcome (A), by `(series_name, number, key_date)` composite under outcome (B)). `curl -I` one of the Supabase URLs to confirm the Cloudinary asset is live — gives us a one-line sanity check that the backfill target will actually resolve for end users.
6. **Write `docs/plans/notes/parity-diagnosis.md`** with: row-count table, ID-stability verdict (A/B/C), backfill workload counts, and the chosen Step 2 match strategy (by-id vs composite). Commit on feature branch.

**Verify**:
- `parity-diagnosis.md` exists, committed, and explicitly states: "Outcome: A / B / C" plus "Step 2 match key: issue.id / (series_name, number, key_date)".
- PR description updated with a one-line diagnosis summary.
- No production code touched; no DB writes issued during this step.

**If the step reveals the plan is wrong**: update the plan file before resuming (global workflow "Plan Revisions"). E.g., if outcome (A), Steps 2 and 3 collapse — the real fix is somewhere in the resolver/transport layer, and the plan needs re-scoping.

---

## Step 2 — Backfill `cover_image_url` + `comic_vine_id` from Supabase into DO
**Model/Effort**: **Sonnet / high**
**Justification**: Mostly mechanical (pg_dump two columns, UPDATE the other DB) but data-correctness-critical. The match-key choice from Step 1 determines the UPDATE shape. Compounding-mistake risk is real — a miswritten UPDATE can silently mis-attach URLs to wrong issues — so tests on the transform logic matter. Not Opus because the work is well-scoped once Step 1 locks the match key.
**Context-clear**: yes (distinct chapter — data migration; benefits from fresh focus)
**TDD/tests-alongside**: tests-alongside for the shell orchestration; **TDD** for any row-mapping logic if the match is composite (Vitest test against a small SQL fixture).
**Files modified** (new):
- `scripts/backfill-covers-from-supabase.sh` — extract + apply
- `scripts/backfill-covers-from-supabase.test.ts` — unit test on the SQL-extraction shape (only if composite-match branch is taken)
- `docs/runbooks/backfill-covers.md` — short runbook so a future re-import of GCD data can re-apply this backfill

Actions:
1. **Extract from Supabase** (path A — match by id):
   ```bash
   psql "$SUPABASE_URL" -c "\COPY (
     SELECT id, cover_image_url, comic_vine_id
     FROM gcd_issue
     WHERE cover_image_url IS NOT NULL OR comic_vine_id IS NOT NULL
   ) TO STDOUT WITH (FORMAT csv, HEADER true)" > /tmp/supabase-covers.csv
   ```
   (Path B — composite match: include `number`, `series_id`, and join to `gcd_series.name` + `year_began`; map on the DO side.)
2. **Inspect locally**: wc -l, head, a few spot checks vs the Supabase sample from Step 1.
3. **Upload to droplet**: `scp /tmp/supabase-covers.csv rod@142.93.202.59:/tmp/`. Do **not** run the import through PgBouncer — load straight into Postgres via `docker exec -i postgres psql` (same pattern as `scripts/load-to-remote.sh`).
4. **Apply via staging table** (so the UPDATE is auditable and rollback-able):
   ```sql
   BEGIN;
   CREATE TEMP TABLE covers_staging (
     id INT PRIMARY KEY,
     cover_image_url VARCHAR(500),
     comic_vine_id INT
   );
   \COPY covers_staging FROM '/tmp/supabase-covers.csv' WITH (FORMAT csv, HEADER true);

   -- Dry run: show how many DO rows will be updated
   SELECT COUNT(*) FROM gcd_issue i
   JOIN covers_staging s ON i.id = s.id
   WHERE i.cover_image_url IS DISTINCT FROM s.cover_image_url
      OR i.comic_vine_id    IS DISTINCT FROM s.comic_vine_id;

   -- Apply
   UPDATE gcd_issue i
   SET cover_image_url = s.cover_image_url,
       comic_vine_id   = s.comic_vine_id
   FROM covers_staging s
   WHERE i.id = s.id
     AND (i.cover_image_url IS DISTINCT FROM s.cover_image_url
       OR i.comic_vine_id    IS DISTINCT FROM s.comic_vine_id);

   -- Sanity check before commit
   SELECT COUNT(*) FROM gcd_issue WHERE cover_image_url IS NOT NULL;

   COMMIT;
   ```
5. **Write the runbook** `docs/runbooks/backfill-covers.md` documenting: when to re-run (e.g., re-import of GCD dump), prerequisites, the exact commands above, and the expected output counts.
6. Commit script + runbook + small test (if composite-match) on the feature branch.

**Verify**:
- On the DO side, `SELECT COUNT(*) FROM gcd_issue WHERE cover_image_url IS NOT NULL;` equals the Supabase baseline recorded in Step 0.
- Live API test:
  ```bash
  curl -s -X POST https://api.dcdecade.com/graphql \
    -H "Content-Type: application/json" \
    -d '{"query":"{ allSeries(limit: 3) { items { name issues(limit: 1) { coverImageUrl } } } }"}' \
    | jq .
  ```
  Every returned `coverImageUrl` is a `https://res.cloudinary.com/...` URL (non-null).
- Spot-check: pick 3 random Cloudinary URLs from the response, `curl -I` each, confirm HTTP 200.
- Vitest suite still green (no regression on what few tests exist; add a small integration test that asserts "at least N issues have non-null coverImageUrl" if the suite has DB access).

---

## Step 3 — Add `Series.slug` for downstream stability
**Model/Effort**: **Sonnet / high**
**Justification**: Schema addition + Prisma migration + GraphQL typedef + resolver touch + slug generation logic. Slug generation is pure transformation (good TDD candidate), but the migration must backfill existing rows deterministically. Uniqueness under realistic GCD duplicates (multiple "Batman" volumes across decades) is the trap — the slug must include `yearBegan` (or a disambiguator) to avoid collisions. Opus is overkill for this shape of work; Haiku would underweight the uniqueness trap.
**Context-clear**: yes (distinct chapter — schema surface change; fresh context avoids carrying Step 2's data-migration mindset into what is really code design)
**TDD/tests-alongside**: **TDD** for the slug generator (pure function, fixture-testable). Tests-alongside for the migration itself (verified by row counts + uniqueness constraint).
**Files modified**:
- `prisma/schema.prisma` — add `slug String @unique @map("slug")` to `Series` (nullable initially, then backfilled and tightened)
- `prisma/migrations/<new>/migration.sql` — add column, backfill, set NOT NULL + UNIQUE
- `src/graphql/typeDefs/index.ts` — add `slug: String!` to `type Series` and `seriesBySlug(slug: String!): Series` to `type Query`
- `src/graphql/resolvers/index.ts` — add `seriesBySlug` resolver; wire DataLoader if pattern warrants
- `src/lib/slug.ts` (new) — pure `seriesSlug({ name, yearBegan, id }) → string`
- `src/lib/slug.test.ts` (new) — Vitest unit tests covering: basic kebab, diacritics, colon/ampersand handling, duplicate-name disambiguation by year, final `-${id}` suffix tiebreaker for same-year duplicates

Actions:
1. **Design the slug** (TDD): kebab-case from `name`, append `-${yearBegan}`, and if that's still not unique across the dataset (rare — same title, same start year), append `-${id}` as final tiebreaker. Drop diacritics, lowercase, strip non-alphanumeric except `-`. Test fixtures include known GCD edge cases: "Crisis on Infinite Earths" (1985) → `crisis-on-infinite-earths-1985`; "Batman" (multiple volumes) → `batman-1940`, `batman-2011`, etc.
2. **Write the migration** as three phases in one SQL file:
   ```sql
   ALTER TABLE gcd_series ADD COLUMN slug VARCHAR(255);
   -- Backfill using a deterministic SQL expression that mirrors the TS slug function
   -- (simplest: a UPDATE driven by a temp-table join with data computed in Node and loaded via COPY,
   --  to guarantee TS and SQL agree)
   UPDATE gcd_series s SET slug = (SELECT slug FROM slug_staging ss WHERE ss.id = s.id);
   ALTER TABLE gcd_series ALTER COLUMN slug SET NOT NULL;
   CREATE UNIQUE INDEX gcd_series_slug_key ON gcd_series(slug);
   ```
   The migration depends on a pre-step: run `scripts/compute-slugs.ts` locally against DO to generate a CSV, then COPY it into `slug_staging` inside the migration's transaction. Document this in `docs/runbooks/add-series-slug.md`.
3. **Update typeDefs**: add `slug: String!` to Series (non-null — every row has one after backfill). Add `seriesBySlug(slug: String!): Series` query.
4. **Resolver**: `seriesBySlug` does `prisma.series.findUnique({ where: { slug } })`. Consider adding to DataLoader set (`src/graphql/loaders.ts`) if downstream patterns suggest N+1; otherwise skip for now.
5. **Apply to DO**: same pattern as `load-to-remote.sh` — ship the migration SQL + slug CSV to the droplet, run inside the postgres container, record in `_prisma_migrations`.
6. **Smoke test** the new field via curl.

**Verify**:
- `npm test` green; slug unit tests cover all fixture cases.
- On DO: `SELECT COUNT(*) FROM gcd_series WHERE slug IS NULL;` → 0.
- `SELECT COUNT(DISTINCT slug), COUNT(*) FROM gcd_series;` — the two numbers are equal (uniqueness holds across real data).
- Live API:
  ```bash
  curl -s -X POST https://api.dcdecade.com/graphql \
    -H "Content-Type: application/json" \
    -d '{"query":"{ seriesBySlug(slug: \"crisis-on-infinite-earths-1985\") { id name slug yearBegan } }"}' | jq .
  ```
  Returns the expected series.
- Introspection confirms `Series.slug` is `String!` (non-null) and `Query.seriesBySlug` exists.

---

## Step 4 — Publish downstream mapping doc
**Model/Effort**: **Haiku / low**
**Justification**: Pure documentation deliverable — a handoff for the dc-decade repo. No code surface, no ambiguity, no correctness risk. Haiku handles this well.
**Context-clear**: no (small task, builds on Step 3's output)
**TDD/tests-alongside**: n/a
**Files modified** (new):
- `docs/api-consumers/series-id-mapping.md`

Actions:
1. Export the homepage-pinned series from DO (user will provide the list of pinned IDs/names the dc-decade repo has hardcoded — likely 5–15 entries). If not provided before this step, grep the dc-decade repo for integer-literal IDs used in queries.
2. For each, record: `(original_pinned_id, current_do_id, slug, name, year_began)`.
3. Write `docs/api-consumers/series-id-mapping.md` with:
   - A short preamble: "the API now exposes `Series.slug`; migrate from integer pins to slug pins to survive future re-imports"
   - The mapping table
   - An example query using `seriesBySlug`
4. Commit on feature branch. This is the artifact dc-decade's own PR will reference.

**Verify**:
- File committed, readable, and every row in the mapping table resolves live (spot-check 3–5 via `curl seriesBySlug`).
- PR description updated to point downstream readers to this file.

---

## Step 5 — End-to-end verification + merge
**Model/Effort**: **Sonnet / medium**
**Justification**: Final integration check across the three delivered changes (backfill, slug field, mapping doc). Mechanical but load-bearing — this is the "is it really fixed" gate.
**Context-clear**: no
**TDD/tests-alongside**: tests-alongside (verification via live curl + existing test suite)
**Files modified**: none (may touch PR description)

Actions:
1. Full CI green on feature branch.
2. Live API smoke (copy-paste reproducible in PR description):
   ```bash
   curl -s -X POST https://api.dcdecade.com/graphql \
     -H "Content-Type: application/json" \
     -d '{"query":"{ allSeries(limit: 5) { totalCount items { id name slug issues(limit: 1) { id coverImageUrl } } } }"}' | jq .
   ```
   Expect: every series has a non-null `slug`; every issue has a non-null `coverImageUrl`.
3. `seriesBySlug` round-trip for 3 mapped entries.
4. Confirm Supabase data matches: `SELECT COUNT(*) FROM gcd_issue WHERE cover_image_url IS NOT NULL` on both DBs returns identical numbers.
5. Merge the PR (user action, not Claude).

**Verify**:
- All three curl responses match expectations.
- Vitest suite green.
- PR reviewed and merged.
- Post-merge cleanup (per global workflow): delete feature branch; this plan file stays in `docs/plans/` until all steps are ✅, then moves to `docs/plans/archive/`.

---

## Critical files / references

- `src/graphql/typeDefs/index.ts:88` — `coverImageUrl` field declaration (no resolver — pass-through)
- `src/graphql/resolvers/index.ts:144-146` — `series(id:)` resolver (Prisma findUnique on PK)
- `src/graphql/resolvers/index.ts:119-142` — `allSeries` resolver
- `src/scripts/fetch-covers.ts` — original Comic Vine → Cloudinary backfill. **Not invoked by this plan** (URLs already exist on Cloudinary; we copy strings from Supabase). Left in the repo for future re-backfills.
- `prisma/schema.prisma` lines 86-137 (Series), 139-195 (Issue) — where the slug column lands and where the cover-URL column already lives
- `prisma/migrations/20260227181500_add_cover_image_fields/` — proves cover columns exist on DO; just empty
- `scripts/load-to-remote.sh` — template for running migrations + data operations on the droplet via `docker exec -i postgres psql`
- `src/lib/prisma.ts` — DB connection config (DATABASE_URL + SSL)
- `docs/plans/migrate-to-digitalocean.md` — the migration this plan follows up on (already merged)

## Assumptions to validate in Step 1

1. The Supabase and DO `gcd_issue` tables share the same `id` space (both derived from the same GCD dump). **If false, Step 2 branches to composite-match.**
2. The `SUPABASE_URL` the user has locally still authenticates; Supabase project wasn't paused past its reactivation window.
3. A spot-check `curl -I` against a Supabase `cover_image_url` returns HTTP 200 — confirming Cloudinary assets remain live. (Expected; user confirmed Cloudinary hosts the images independent of Railway/Supabase.)

## Decisions confirmed with user (2026-04-20)

- **Old data access**: Supabase still live → fast SQL-backfill path (Option B of the decision matrix).
- **Series ID root cause**: diagnose before committing to a theory (Step 1 is a gate).
- **Schema change**: add a stable identifier (slug) on Series. Downstream migrates off raw PKs.

## Deferred follow-ups

- Backfilling `comic_vine_id` for issues that didn't get a cover (rare; Comic Vine had no match). Leave null; not user-visible.
- Adding a stable external ID on Issues. `coverImageUrl` already provides visual continuity; issue-level re-imports are not on the roadmap.
