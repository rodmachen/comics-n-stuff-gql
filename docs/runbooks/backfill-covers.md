# Runbook: Backfill `cover_image_url` + `comic_vine_id` into DO Postgres

## When to re-run

Re-run this runbook any time the GCD SQL dump is re-imported from scratch (e.g., a fresh `scripts/load-to-remote.sh` wipe-and-reload). The GCD dump contains no cover or Comic Vine data; those columns are populated only by this backfill.

Not needed for routine migrations or Prisma schema changes — only after a full data reimport.

## Prerequisites

| Requirement | Where to get it |
|---|---|
| `DIRECT_DATABASE_URL` set to the Supabase connection string | 1Password → "Supabase Direct URL" or `.env` |
| SSH key at `~/.ssh/droplet` | 1Password → "DO Droplet SSH key" |
| `psql` client on your machine | `brew install postgresql` |
| Postgres healthy on DO droplet | `ssh -i ~/.ssh/droplet rod@142.93.202.59 "docker exec postgres pg_isready -U postgres"` |

## How it works

1. Extracts `(id, cover_image_url, comic_vine_id)` from Supabase `gcd_issue` where `cover_image_url IS NOT NULL` into a local CSV.
2. Ships the CSV to the droplet and copies it into the Postgres container.
3. Loads the CSV into a `covers_staging` temp table, then runs an `UPDATE gcd_issue` joined on `id` — only rows that differ are touched (idempotent).
4. Commits the transaction; confirms the count of non-null `cover_image_url` rows.

The Cloudinary URLs in Supabase remain live regardless of the Supabase project state — they point to `res.cloudinary.com`, which is independent of any Postgres instance.

## Run it

```bash
# From the project root:
bash scripts/backfill-covers-from-supabase.sh
```

The script auto-sources `.env` if present. If running without `.env`, export `DIRECT_DATABASE_URL` first:

```bash
export DIRECT_DATABASE_URL="postgresql://..."
bash scripts/backfill-covers-from-supabase.sh
```

## Expected output

```
==> Phase 1: Extract cover data from Supabase → /tmp/supabase-covers.csv
Export complete.

==> Phase 2: Local inspection
Total lines (incl. header): 4730
Data rows:                  4729
Expected:                   4729

  staging_rows_loaded
---------------------
 4729

  rows_to_update
----------------
 4729

UPDATE 4729

  do_issues_with_cover
----------------------
 4729
```

## Verify after running

```bash
# Live API: every issue in the first 3 series should have a non-null coverImageUrl
curl -s -X POST https://api.dcdecade.com/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ allSeries(limit: 3) { items { name issues(limit: 1) { coverImageUrl } } } }"}' \
  | jq .

# Spot-check a Cloudinary URL resolves (substitute a real URL from the API response):
curl -I "https://res.cloudinary.com/dke4phurv/image/upload/..."
```

## Row-count baseline (2026-04-20)

| DB | issues with `cover_image_url` |
|---|---:|
| Supabase | 4,729 |
| DO (after backfill) | 4,729 |

The remaining ~88,666 DO issues (publisher-54 data not in the Supabase snapshot) have no corresponding Cloudinary assets and remain `null` — this is intentional and out of scope.
