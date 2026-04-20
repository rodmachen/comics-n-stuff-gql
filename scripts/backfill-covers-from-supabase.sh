#!/usr/bin/env bash
# scripts/backfill-covers-from-supabase.sh
# Step 2: Backfill cover_image_url + comic_vine_id from Supabase into DO.
#
# Copies the two cover columns from Supabase's gcd_issue into the DO Postgres
# by extracting to a local CSV, shipping it to the droplet, and applying a
# staging-table UPDATE inside a transaction.
#
# Usage:
#   bash scripts/backfill-covers-from-supabase.sh
#
# Prerequisites:
#   - DIRECT_DATABASE_URL pointing at Supabase (sourced from .env automatically
#     if .env exists, or exported before running this script)
#   - SSH key at ~/.ssh/droplet with access to rod@142.93.202.59
#   - Postgres healthy on the droplet (docker exec postgres pg_isready)
#   - psql client available locally (brew install postgresql or similar)
#
# Safe to re-run: the UPDATE is idempotent (IS DISTINCT FROM guards).
#
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
DROPLET="rod@142.93.202.59"
SSH_KEY="$HOME/.ssh/droplet"
SSH="ssh -i $SSH_KEY"
SCP="scp -i $SSH_KEY"
CSV_LOCAL="/tmp/supabase-covers.csv"
CSV_DROPLET="/tmp/supabase-covers.csv"
CSV_CONTAINER="/tmp/supabase-covers.csv"
EXPECTED_ROWS=4729

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo ""; echo "==> $*"; }
step() { echo ""; echo "──────────────────────────────────────────"; echo "  $*"; echo "──────────────────────────────────────────"; }

# Run SQL inside the DO Postgres container (stdin-piped via SSH).
psql_remote() {
  $SSH "$DROPLET" "docker exec -i postgres psql -U postgres -d comics_gcd $*"
}

# ── Auto-source .env ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  # shellcheck source=/dev/null
  set -a && source "$SCRIPT_DIR/.env" && set +a
fi

# ── Preflight ──────────────────────────────────────────────────────────────────
step "Preflight checks"

[[ -n "${DIRECT_DATABASE_URL:-}" ]] || {
  echo "ERROR: DIRECT_DATABASE_URL not set."
  echo "       Source .env or export DIRECT_DATABASE_URL before running this script."
  exit 1
}
[[ -f "$SSH_KEY" ]] || { echo "ERROR: SSH key $SSH_KEY not found."; exit 1; }
command -v psql &>/dev/null || { echo "ERROR: psql not found. Install postgresql client."; exit 1; }

echo "Supabase URL: (set)"
echo "Target:       $DROPLET (key: $SSH_KEY)"
echo "Local CSV:    $CSV_LOCAL"

log "Checking Postgres is healthy on droplet..."
$SSH "$DROPLET" "docker exec postgres pg_isready -U postgres" \
  || { echo "ERROR: Postgres not ready on droplet."; exit 1; }
echo "Postgres is ready."

# ── Phase 1: Extract from Supabase ────────────────────────────────────────────
step "Phase 1: Extract cover data from Supabase → $CSV_LOCAL"

psql "$DIRECT_DATABASE_URL" -c "\COPY (
  SELECT id, cover_image_url, comic_vine_id
  FROM gcd_issue
  WHERE cover_image_url IS NOT NULL
) TO STDOUT WITH (FORMAT csv, HEADER true)" > "$CSV_LOCAL"

echo "Export complete."

# ── Phase 2: Local inspection ─────────────────────────────────────────────────
step "Phase 2: Local inspection"

TOTAL_LINES=$(wc -l < "$CSV_LOCAL")
DATA_ROWS=$(( TOTAL_LINES - 1 ))  # subtract header

echo "Total lines (incl. header): $TOTAL_LINES"
echo "Data rows:                  $DATA_ROWS"
echo "Expected:                   $EXPECTED_ROWS"
echo ""
echo "First 5 lines:"
head -5 "$CSV_LOCAL"
echo ""

if [[ "$DATA_ROWS" -lt "$EXPECTED_ROWS" ]]; then
  echo "WARNING: Fewer rows than expected ($DATA_ROWS < $EXPECTED_ROWS). Proceeding anyway."
fi

# ── Phase 3: Upload CSV to droplet ────────────────────────────────────────────
step "Phase 3: Upload CSV to droplet and copy into container"

$SCP "$CSV_LOCAL" "$DROPLET:$CSV_DROPLET"
echo "SCP to droplet complete."

$SSH "$DROPLET" "docker cp $CSV_DROPLET postgres:$CSV_CONTAINER"
echo "docker cp into postgres container complete."

# ── Phase 4: Apply via staging table ──────────────────────────────────────────
step "Phase 4: Apply backfill (staging table → UPDATE, inside transaction)"

psql_remote <<'SQL'
BEGIN;

CREATE TEMP TABLE covers_staging (
  id             INT         PRIMARY KEY,
  cover_image_url VARCHAR(500),
  comic_vine_id  INT
);

\COPY covers_staging FROM '/tmp/supabase-covers.csv' WITH (FORMAT csv, HEADER true);

SELECT COUNT(*) AS staging_rows_loaded FROM covers_staging;

-- Dry-run count: how many DO rows differ from staging
SELECT COUNT(*) AS rows_to_update
FROM gcd_issue i
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

-- Final count: confirm non-null covers on DO
SELECT COUNT(*) AS do_issues_with_cover FROM gcd_issue WHERE cover_image_url IS NOT NULL;

COMMIT;
SQL

echo "Transaction committed."

# ── Phase 5: Cleanup ──────────────────────────────────────────────────────────
step "Cleanup"

$SSH "$DROPLET" "rm -f $CSV_DROPLET && docker exec postgres rm -f $CSV_CONTAINER" 2>/dev/null || true
echo "Removed CSV from droplet and container."

echo ""
echo "✓ Step 2 complete. cover_image_url + comic_vine_id backfilled into DO."
echo "  Verify with:"
echo "    curl -s -X POST https://api.dcdecade.com/graphql \\"
echo "      -H 'Content-Type: application/json' \\"
echo "      -d '{\"query\":\"{ allSeries(limit: 3) { items { name issues(limit: 1) { coverImageUrl } } } }\"}' | jq ."
