#!/usr/bin/env bash
# scripts/load-to-remote.sh
# Step 3: Load GCD data and apply Prisma migrations into the droplet's Postgres.
#
# Usage:
#   bash scripts/load-to-remote.sh
#
# Prerequisites:
#   - SSH key access to the droplet as rod@142.93.202.59
#   - scripts/dc-comics-postgres.sql present (output of migrate-to-postgres.py)
#   - docker compose stack running on the droplet (docker compose ps shows postgres healthy)
#
# Strategy: Postgres has no published ports (by design). We load via
#   docker exec -i postgres psql piped through SSH. No tunnel needed.
#
set -euo pipefail

DROPLET="rod@142.93.202.59"
SQL_FILE="scripts/dc-comics-postgres.sql"
MIGRATION_1="prisma/migrations/20260227180905_add_indexes/migration.sql"
MIGRATION_2="prisma/migrations/20260227181500_add_cover_image_fields/migration.sql"
PSQL_CMD="docker exec -i postgres psql -U postgres -d comics_gcd"

log()  { echo ""; echo "==> $*"; }
step() { echo ""; echo "──────────────────────────────────────────"; echo "  $*"; echo "──────────────────────────────────────────"; }

# ── Preflight ──────────────────────────────────────────────────────────────────
step "Preflight checks"

[[ -f "$SQL_FILE" ]]    || { echo "ERROR: $SQL_FILE not found. Run scripts/migrate-to-postgres.py first."; exit 1; }
[[ -f "$MIGRATION_1" ]] || { echo "ERROR: $MIGRATION_1 not found."; exit 1; }
[[ -f "$MIGRATION_2" ]] || { echo "ERROR: $MIGRATION_2 not found."; exit 1; }

echo "SQL file:     $SQL_FILE ($(du -sh "$SQL_FILE" | cut -f1))"
echo "Migration 1:  $MIGRATION_1"
echo "Migration 2:  $MIGRATION_2"
echo "Target:       $DROPLET"

log "Checking Postgres is healthy on droplet..."
ssh "$DROPLET" "docker exec postgres pg_isready -U postgres" \
  || { echo "ERROR: Postgres not ready. Check docker compose on the droplet."; exit 1; }
echo "Postgres is ready."

# ── Phase 1: Upload SQL file ───────────────────────────────────────────────────
step "Phase 1: Upload SQL file"
echo "Copying $SQL_FILE → droplet:/tmp/dc-comics-postgres.sql"
scp "$SQL_FILE" "$DROPLET:/tmp/dc-comics-postgres.sql"
echo "Upload complete."

# ── Phase 2: Load data ────────────────────────────────────────────────────────
step "Phase 2: Load GCD data into Postgres"
echo "Running psql inside the postgres container (this takes a few minutes)..."
ssh "$DROPLET" "docker exec -i postgres psql -U postgres -d comics_gcd -f /tmp/dc-comics-postgres.sql"
echo "Data load complete."

# ── Phase 3: Apply Prisma migrations ──────────────────────────────────────────
step "Phase 3: Apply Prisma migrations"

log "Applying 20260227180905_add_indexes..."
ssh "$DROPLET" "$PSQL_CMD" < "$MIGRATION_1"
echo "Migration 1 applied."

log "Applying 20260227181500_add_cover_image_fields..."
ssh "$DROPLET" "$PSQL_CMD" < "$MIGRATION_2"
echo "Migration 2 applied."

# Record migrations in _prisma_migrations so the API container doesn't re-apply them.
# Checksum is SHA-256 hex digest of the migration SQL file content (Prisma's format).
log "Recording migrations in _prisma_migrations..."
CHECKSUM_1=$(openssl dgst -sha256 "$MIGRATION_1" | awk '{print $2}')
CHECKSUM_2=$(openssl dgst -sha256 "$MIGRATION_2" | awk '{print $2}')

ssh "$DROPLET" "$PSQL_CMD" <<SQL
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    VARCHAR(36)  NOT NULL,
    "checksum"              VARCHAR(64)  NOT NULL,
    "finished_at"           TIMESTAMPTZ,
    "migration_name"        VARCHAR(255) NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        TIMESTAMPTZ,
    "started_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count"   INTEGER     NOT NULL DEFAULT 0,
    PRIMARY KEY ("id")
);

INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","applied_steps_count")
VALUES
  (gen_random_uuid()::text, '$CHECKSUM_1', now(), '20260227180905_add_indexes',           1),
  (gen_random_uuid()::text, '$CHECKSUM_2', now(), '20260227181500_add_cover_image_fields', 1)
ON CONFLICT ("id") DO NOTHING;

SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at;
SQL

echo "Migrations recorded."

# ── Phase 4: ANALYZE ──────────────────────────────────────────────────────────
step "Phase 4: ANALYZE"
ssh "$DROPLET" "docker exec postgres psql -U postgres -d comics_gcd -c 'ANALYZE;'"
echo "ANALYZE complete."

# ── Phase 5: Verify ───────────────────────────────────────────────────────────
step "Phase 5: Verification"

log "Row counts:"
ssh "$DROPLET" "docker exec postgres psql -U postgres -d comics_gcd -c \"
SELECT relname AS table, n_live_tup AS rows
FROM pg_stat_user_tables
WHERE schemaname = 'public' AND n_live_tup > 0
ORDER BY n_live_tup DESC;
\""

log "GIN index check (idx_series_name_trgm):"
ssh "$DROPLET" "docker exec postgres psql -U postgres -d comics_gcd -c '\di+ idx_series_name_trgm'"

log "Sample trigram search (should use GIN index):"
ssh "$DROPLET" "docker exec postgres psql -U postgres -d comics_gcd -c \"
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, name FROM gcd_series
WHERE name %> 'Batman'
ORDER BY name <-> 'Batman'
LIMIT 10;
\""

# ── Cleanup ───────────────────────────────────────────────────────────────────
step "Cleanup"
ssh "$DROPLET" "rm -f /tmp/dc-comics-postgres.sql"
echo "Removed /tmp/dc-comics-postgres.sql from droplet."

echo ""
echo "✓ Step 3 complete. GCD data loaded and migrations applied."
echo "  Next: Step 4 — deploy the API container."
