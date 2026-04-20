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
psql_remote() { $SSH "$DROPLET" "docker exec -i postgres psql -U postgres -d comics_gcd $*"; }

step "Preflight"
[[ -f "$SSH_KEY" ]] || { echo "ERROR: SSH key $SSH_KEY not found."; exit 1; }
$SSH "$DROPLET" "docker exec postgres pg_isready -U postgres" \
  || { echo "ERROR: Postgres not ready on droplet."; exit 1; }
echo "Droplet reachable."

step "Phase 1: Add nullable slug column"
psql_remote < "$MIG_1"
echo "Migration 1 applied."

step "Phase 2: Fetch series data via SSH"
$SSH "$DROPLET" \
  "docker exec postgres psql -U postgres -d comics_gcd -c \
  \"\\COPY (SELECT id, name, year_began FROM gcd_series WHERE deleted = 0 ORDER BY id) TO STDOUT WITH (FORMAT csv, HEADER true)\"" \
  > "$SERIES_CSV"
echo "Fetched $(wc -l < "$SERIES_CSV") series rows to $SERIES_CSV."

step "Phase 3: Compute slugs locally"
npx tsx scripts/compute-slugs.ts "$SERIES_CSV" "$SLUGS_CSV"
echo "CSV written: $(wc -l < "$SLUGS_CSV") lines (including header)."

step "Phase 4: Upload CSV and backfill"
$SCP "$SLUGS_CSV" "$DROPLET:/tmp/slugs.csv"
$SSH "$DROPLET" "docker exec -i postgres psql -U postgres -d comics_gcd" <<'SQL'
BEGIN;

CREATE TEMP TABLE slug_staging (
  id   INT PRIMARY KEY,
  slug VARCHAR(255) NOT NULL
);

\COPY slug_staging(id, slug) FROM '/tmp/slugs.csv' WITH (FORMAT csv, HEADER true);

-- Dry-run count
SELECT COUNT(*) AS rows_to_update FROM gcd_series s
JOIN slug_staging ss ON s.id = ss.id
WHERE s.slug IS DISTINCT FROM ss.slug;

UPDATE gcd_series s
SET slug = ss.slug
FROM slug_staging ss
WHERE s.id = ss.id;

SELECT COUNT(*) AS still_null FROM gcd_series WHERE deleted = 0 AND slug IS NULL;

COMMIT;
SQL
echo "Backfill complete."

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
psql_remote -c "SELECT COUNT(*) AS total, COUNT(slug) AS with_slug, COUNT(*) - COUNT(slug) AS null_slugs FROM gcd_series WHERE deleted = 0;"
$SSH "$DROPLET" "rm -f /tmp/slugs.csv"
rm -f "$SERIES_CSV" "$SLUGS_CSV"

echo ""
echo "✓ Series.slug migration complete."
