#!/usr/bin/env bash
# Weekly Postgres backup.
#
# Dumps all user databases EXCEPT comics_gcd (static data; source of truth is
# 2026-02-15.sql + scripts/migrate-to-postgres.py — no scheduled backup needed).
#
# Run via systemd timer (pg-dump.timer), or manually:
#   sudo -u rod bash /opt/stack/ops/backup/pg-dump.sh
#
# Backups land in BACKUP_DIR as <db>-YYYYMMDD-HHMMSS.sql.gz and are pruned
# after RETAIN_DAYS days.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/postgres}"
RETAIN_DAYS=28
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"

# List user databases, skip templates and the static comics_gcd.
DATABASES=$(docker exec postgres psql -U postgres -t -A -c \
  "SELECT datname FROM pg_database
   WHERE datistemplate = false
     AND datname NOT IN ('postgres', 'comics_gcd');")

if [ -z "$DATABASES" ]; then
  echo "No non-static databases found — nothing to back up."
  exit 0
fi

for DB in $DATABASES; do
  OUT="${BACKUP_DIR}/${DB}-${TIMESTAMP}.sql.gz"
  echo "Dumping ${DB} → ${OUT}"
  docker exec postgres pg_dump -U postgres "$DB" | gzip > "$OUT"
done

# Prune old backups.
find "$BACKUP_DIR" -name "*.sql.gz" -mtime "+${RETAIN_DAYS}" -delete

echo "Backup complete. Current contents of ${BACKUP_DIR}:"
ls -lh "$BACKUP_DIR"
