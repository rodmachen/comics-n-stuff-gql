# Plan: Add GIN Trigram Indexes for ILIKE Search Performance

## Context

The three text search queries (`publishers`, `allSeries`, `creators`) use Prisma's `contains` + `mode: "insensitive"`, which translates to `ILIKE '%search%'` in PostgreSQL. There are **no indexes** on any of the searched text columns, so every search triggers a full sequential table scan. Adding GIN trigram indexes via `pg_trgm` will allow PostgreSQL to use bitmap index scans for these queries — no application code changes needed.

## Changes

### 1. Add `@@index` declarations to `prisma/schema.prisma`

Add GIN trigram indexes to the three models with searched columns:

**Publisher** (line 83, before `@@map`):
```prisma
@@index([name(ops: raw("gin_trgm_ops"))], type: Gin, name: "idx_publisher_name_trgm")
```

**Series** (line 133, before `@@map`):
```prisma
@@index([name(ops: raw("gin_trgm_ops"))], type: Gin, name: "idx_series_name_trgm")
```

**Creator** (line 284, before `@@map`):
```prisma
@@index([gcdOfficialName(ops: raw("gin_trgm_ops"))], type: Gin, name: "idx_creator_name_trgm")
```

### 2. Generate and customize migration

```bash
npx prisma migrate dev --name add_trgm_indexes --create-only
```

Edit the generated `prisma/migrations/<timestamp>_add_trgm_indexes/migration.sql` to prepend the extension creation before the index statements:

```sql
-- Enable pg_trgm extension (likely already active on Supabase)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Prisma-generated CREATE INDEX statements follow...
```

### 3. Apply the migration

```bash
npx prisma migrate dev
```

This uses the `directUrl` (port 5432) for the migration, bypassing PgBouncer.

### 4. Regenerate Prisma client

```bash
npx prisma generate
```

## Files Modified

- `prisma/schema.prisma` — add 3 `@@index` declarations
- `prisma/migrations/<timestamp>_add_trgm_indexes/migration.sql` — new (generated + edited)

## No Application Code Changes

The existing resolver code in `src/graphql/resolvers/index.ts` stays exactly as-is. PostgreSQL's query planner will automatically use the new GIN indexes for the existing `ILIKE '%...%'` queries.

## Verification

1. Run `npx prisma migrate dev` successfully
2. Connect to the database and run `EXPLAIN ANALYZE` on a search query to confirm index usage:
   ```sql
   EXPLAIN ANALYZE SELECT id, name FROM gcd_publisher WHERE name ILIKE '%marvel%' AND deleted = 0;
   ```
   Expected: `Bitmap Index Scan on idx_publisher_name_trgm` instead of `Seq Scan`
3. Run the app and test search queries via GraphQL to confirm no regressions

## Notes

- `pg_trgm` is pre-installed on Supabase; `CREATE EXTENSION IF NOT EXISTS` is a safe no-op if already enabled
- GIN indexes only accelerate search terms of 3+ characters (trigram minimum); 1-2 character searches still seq scan
- Declaring indexes in the schema (not just migration SQL) prevents Prisma migration drift issues
