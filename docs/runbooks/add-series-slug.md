# Runbook: Add Series.slug

Adds a deterministic `slug` field to every `gcd_series` row for stable downstream addressing.

## When to re-run

After any re-import of the GCD dump (scripts/dc-comics-postgres.sql), run this runbook
to repopulate slugs for the new dataset.

## Prerequisites

- SSH key at `~/.ssh/droplet` with access to `rod@142.93.202.59`
- Docker postgres container healthy on the droplet
- `tsx` available: `npm install -g tsx` or `npx tsx`

## Steps

### 1. Apply (first time)

```bash
bash scripts/apply-series-slugs.sh
```

The script:
1. Adds nullable `slug VARCHAR(255)` column (migration 20260420000000)
2. Runs `scripts/compute-slugs.ts` to generate `/tmp/slugs.csv`
3. Uploads the CSV to the droplet and backfills via a staging-table UPDATE
4. Sets `NOT NULL` + `UNIQUE` index (migration 20260420000001)
5. Records both migrations in `_prisma_migrations`
6. Verifies zero null slugs remain

### 2. Re-run after a fresh GCD import

After re-importing the raw GCD dump the slug column won't exist yet, so run the
full script again. If the column already exists (partial re-run), migration 1
will error — skip Phase 1 and run phases 2–7 manually following the script.

## Slug format

`{kebab-name}-{yearBegan}` — e.g., `crisis-on-infinite-earths-1985`.

If two series share the same name and starting year (rare), the row's id is appended:
`batman-1940-123`. This is computed by `src/lib/slug.ts:seriesSlug`.

## Verification

After the script completes:

```bash
# Zero null slugs on active rows
ssh -i ~/.ssh/droplet rod@142.93.202.59 \
  "docker exec postgres psql -U postgres -d comics_gcd -c \
  'SELECT COUNT(*) FROM gcd_series WHERE deleted=0 AND slug IS NULL;'"
# → 0

# Uniqueness: both counts must be equal
ssh -i ~/.ssh/droplet rod@142.93.202.59 \
  "docker exec postgres psql -U postgres -d comics_gcd -c \
  'SELECT COUNT(DISTINCT slug), COUNT(*) FROM gcd_series WHERE deleted=0;'"

# Live API smoke test
curl -s -X POST https://api.dcdecade.com/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ seriesBySlug(slug: \"crisis-on-infinite-earths-1985\") { id name slug yearBegan } }"}' \
  | jq .
```
