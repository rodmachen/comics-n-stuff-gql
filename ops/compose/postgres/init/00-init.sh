#!/bin/bash
# Postgres init script — runs once on first container start (empty data volume).
# Creates the application database, role, and required extensions.
# Runs as the POSTGRES_USER (superuser) inside the container.
set -euo pipefail

echo "==> Creating role: comics_app"
psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "postgres" \
  --command "CREATE ROLE comics_app WITH LOGIN PASSWORD '$COMICS_APP_PASSWORD';"

echo "==> Creating database: comics_gcd"
psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "postgres" \
  --command "CREATE DATABASE comics_gcd OWNER comics_app;"

echo "==> Granting connect on comics_gcd to comics_app"
psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "postgres" \
  --command "GRANT CONNECT ON DATABASE comics_gcd TO comics_app;"

echo "==> Enabling pg_trgm extension (required for GIN trigram indexes)"
# pg_trgm must be superuser-installed; comics_app cannot install it.
psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "comics_gcd" \
  --command "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

echo "==> Granting schema usage and default privileges to comics_app"
psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "comics_gcd" <<-EOSQL
    GRANT USAGE ON SCHEMA public TO comics_app;
    -- Tables created later (by Prisma migrate) will automatically be accessible.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO comics_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO comics_app;
EOSQL

echo "==> Postgres init complete"
