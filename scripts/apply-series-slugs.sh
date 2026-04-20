#!/usr/bin/env bash
# scripts/apply-series-slugs.sh
# Applies the two Series.slug migrations to the DO droplet:
#   1. Adds nullable slug column (migration 20260420000000)
#   2. Fetches series data via SSH, computes slugs locally, uploads CSV, backfills rows
#   3. Sets NOT NULL + UNIQUE (migration 20260420000001)
#   4. Records both migrations in _prisma_migrations
#
# Usage:
#   bash scripts/apply-series-slugs.sh
#
# Prerequisites:
#   - SSH key at ~/.ssh/droplet
#   - tsx available (npx tsx)
set -euo pipefail

DROPLET="rod@142.93.202.59"
SSH_KEY="$HOME/.ssh/droplet"
SSH="ssh -i $SSH_KEY"
SCP="scp -i $SSH_KEY"
SERIES_CSV="/tmp/series-raw.csv"
SLUGS_CSV="/tmp/slugs.csv"
MIG_1="prisma/migrations/20260420000000_add_series_slug_nullable/migration.sql"
MIG_2="prisma/migrations/20260420000001_finalize_series_slug/migration.sql"

log()  { echo ""; echo "==> $*"; }
step() { echo ""; echo "──────────────────────────────────────────"; echo "  $*"; echo "──────────────────────────────────────────"; }
# Pass SQL via stdin; -v ON_ERROR_STOP=1 makes psql exit non-zero on SQL errors
psql_remote() { $SSH "$DROPLET" "docker exec -i postgres psql -U postgres -d comics_gcd -v ON_ERROR_STOP=1"; }
psql_remote_cmd() { $SSH "$DROPLET" "docker exec postgres psql -U postgres -d comics_gcd -v ON_ERROR_STOP=1 -c '$1'"; }

step "Preflight"
[[ -f "$SSH_KEY" ]] || { echo "ERROR: SSH key $SSH_KEY not found."; exit 1; }
$SSH "$DROPLET" "docker exec postgres pg_isready -U postgres" \
  || { echo "ERROR: Postgres not ready on droplet."; exit 1; }
echo "Droplet reachable."

step "Phase 1: Add nullable slug column"
psql_remote < "$MIG_1"
echo "Migration 1 applied."

step "Phase 2: Fetch series data via SSH"
# Fetch ALL rows (including deleted) — Migration 2 sets NOT NULL across the whole table,
# so every row needs a slug regardless of deleted status.
$SSH "$DROPLET" \
  "docker exec postgres psql -U postgres -d comics_gcd -c \
  \"\\COPY (SELECT id, name, year_began FROM gcd_series ORDER BY id) TO STDOUT WITH (FORMAT csv, HEADER true)\"" \
  > "$SERIES_CSV"
echo "Fetched $(wc -l < "$SERIES_CSV") series rows to $SERIES_CSV."

step "Phase 3: Compute slugs locally"
npx tsx scripts/compute-slugs.ts "$SERIES_CSV" "$SLUGS_CSV"
echo "CSV written: $(wc -l < "$SLUGS_CSV") lines (including header)."

step "Phase 4: Upload CSV and backfill"
# SCP to droplet host, then docker cp into the container so server-side COPY can read it
$SCP "$SLUGS_CSV" "$DROPLET:/tmp/slugs.csv"
$SSH "$DROPLET" "docker cp /tmp/slugs.csv postgres:/tmp/slugs.csv"

psql_remote <<'SQL'
BEGIN;

CREATE TEMP TABLE slug_staging (
  id   INT PRIMARY KEY,
  slug VARCHAR(255) NOT NULL
);

COPY slug_staging(id, slug) FROM '/tmp/slugs.csv' WITH (FORMAT csv, HEADER true);

SELECT COUNT(*) AS rows_to_update FROM gcd_series s
JOIN slug_staging ss ON s.id = ss.id
WHERE s.slug IS DISTINCT FROM ss.slug;

UPDATE gcd_series s
SET slug = ss.slug
FROM slug_staging ss
WHERE s.id = ss.id;

SELECT COUNT(*) AS still_null FROM gcd_series WHERE slug IS NULL;

COMMIT;
SQL
echo "Backfill complete."

step "Phase 5: Pre-check before NOT NULL constraint"
# Verify zero null slugs across the entire table (all rows, including deleted)
# before running Migration 2, which sets NOT NULL. Any null here would cause that ALTER to fail.
NULL_COUNT=$($SSH "$DROPLET" "docker exec postgres psql -U postgres -d comics_gcd -t -A -c \
  'SELECT COUNT(*) FROM gcd_series WHERE slug IS NULL;'")
if [[ "$NULL_COUNT" -ne 0 ]]; then
  echo "ERROR: $NULL_COUNT row(s) still have NULL slugs. Aborting before Migration 2."
  echo "       Check the slug_staging upload and re-run Phase 4 before proceeding."
  exit 1
fi
echo "All rows have slugs — proceeding to finalize."

step "Phase 5: Finalize (NOT NULL + UNIQUE)"
psql_remote < "$MIG_2"
echo "Migration 2 applied."

step "Phase 6: Record migrations in _prisma_migrations"
CHECKSUM_1=$(openssl dgst -sha256 "$MIG_1" | awk '{print $2}')
CHECKSUM_2=$(openssl dgst -sha256 "$MIG_2" | awk '{print $2}')

psql_remote <<SQL
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count")
VALUES
  (gen_random_uuid()::text, '$CHECKSUM_1', now(), '20260420000000_add_series_slug_nullable', 1),
  (gen_random_uuid()::text, '$CHECKSUM_2', now(), '20260420000001_finalize_series_slug',     1)
ON CONFLICT ("id") DO NOTHING;

SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at;
SQL

step "Phase 7: Verify"
$SSH "$DROPLET" "docker exec postgres psql -U postgres -d comics_gcd -c \
  'SELECT COUNT(*) AS total, COUNT(slug) AS with_slug, COUNT(*) - COUNT(slug) AS null_slugs FROM gcd_series;'"
$SSH "$DROPLET" "docker exec postgres psql -U postgres -d comics_gcd -c \
  'SELECT COUNT(DISTINCT slug) AS distinct_slugs, COUNT(*) AS total FROM gcd_series;'"
$SSH "$DROPLET" "rm -f /tmp/slugs.csv && docker exec postgres rm -f /tmp/slugs.csv"
rm -f "$SERIES_CSV" "$SLUGS_CSV"

echo ""
echo "✓ Series.slug migration complete."
