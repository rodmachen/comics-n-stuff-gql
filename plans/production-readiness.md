# API Production Readiness Plan

## Context
This GraphQL API (Apollo Server 5 + Prisma 7 + PostgreSQL) currently runs locally and serves DC Comics data from the 1980s. Before web, iOS, and Android apps are built against it, the API needs to be stable, performant, and reachable from the internet.

**Deployment architecture:**
- **Database**: Supabase (PostgreSQL)
- **API server**: Separate hosting platform (Railway, Render, or Fly.io) running Node.js
- **Web app**: Vercel

Changes to the GraphQL schema are particularly disruptive once apps exist, so schema decisions must be made now.

---

## Phase 1 — Blocking (apps cannot work without these) ✅ COMPLETE

### 1. ✅ Migrate to Express + configure CORS
Switched from `startStandaloneServer` to Express 5 with `@as-integrations/express5`.
- Apollo Server 5 dropped the built-in `@apollo/server/express4` integration — use the `@as-integrations/express5` package instead (Express 5 was installed by default)
- CORS origins configurable via `CORS_ORIGINS` env var (comma-separated list, defaults to `*`)
- GraphQL endpoint is at `/graphql` (not `/`)
- `ApolloServerPluginDrainHttpServer` added for graceful shutdown

**Files modified:** `src/index.ts`, `package.json`

### 2. ✅ Error handling
- Added `formatError` hook to `ApolloServer` — strips stack traces when `NODE_ENV=production`
- Created generic `withErrorHandling<TParent, TArgs, TResult>` wrapper — all async resolvers are wrapped
- Fixed the unsafe `result!.country` non-null assertion in Publisher resolver — now throws a proper `NOT_FOUND` GraphQLError

**Files modified:** `src/index.ts`, `src/graphql/resolvers/index.ts`

### 3. ✅ Pagination connection types with totalCount
All five list queries now return `{ items, totalCount }`:
- `PublisherConnection`, `SeriesConnection`, `IssueConnection`, `StoryConnection`, `CreatorConnection`
- Each resolver uses `prisma.$transaction([findMany, count])` with shared `where` clauses

**Files modified:** `src/graphql/typeDefs/index.ts`, `src/graphql/resolvers/index.ts`

### 4. ✅ Deploy database to Supabase

#### Setup steps:
1. Create a Supabase project at supabase.com
2. Get connection strings from **Settings → Database → Connection string**:
   - **Transaction pooler** (port 6543) — for the running API
   - **Direct connection** (port 5432) — for pg_dump imports and Prisma migrations
3. Export local database:
   ```bash
   /opt/homebrew/opt/postgresql@17/bin/pg_dump \
     --no-owner --no-acl --format=plain --schema=public \
     -U rodmachen comics_gcd > comics_gcd_export.sql
   ```
4. Import to Supabase (use the **direct** connection string, not the pooler):
   ```bash
   /opt/homebrew/opt/postgresql@17/bin/psql \
     "postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres" \
     -f comics_gcd_export.sql
   ```
5. Verify:
   ```bash
   /opt/homebrew/opt/postgresql@17/bin/psql "DIRECT_URL" \
     -c "SELECT schemaname, relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;"
   ```

#### Gotchas encountered:
- **TLS self-signed certificate error**: The `pg` driver with `sslmode=require` now treats it as `verify-full`, which rejects Supabase's certificate chain. **Fix**: use `sslmode=no-verify` in the connection string instead
- **Prisma adapter-pg SSL**: Passing `ssl: { rejectUnauthorized: false }` in the `PrismaPg` config object does NOT work — `PrismaPg` ignores it. Must create a `pg.Pool` directly with the SSL option and pass the Pool to `PrismaPg`:
  ```typescript
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const adapter = new PrismaPg(pool);
  ```
- **Connection string format**: Supabase pooler URLs use `postgres.PROJECT_REF` as the username (the dot matters). Direct URLs use plain `postgres` as the username. Don't add a `/` before the password
- **Double `?` in query params**: `?pgbouncer=true&?sslmode=require` is invalid — second param uses `&` not `&?`
- The column in `pg_stat_user_tables` for the table name is `relname`, not `tablename`

**Files modified:** `.env`, `src/lib/prisma.ts`

### 5. ✅ Create .env.example
Template with all required variables and comments.

**Files created:** `.env.example`

### 6. ✅ Variant filtering (added during implementation)
The GCD tracks Direct, Newsstand, and Canadian editions as separate issue records (~55% of all issues are variants). The `issues` query and `Series.issues` resolver now filter by `variantOfId = null` to return only primary issues. Variants are still accessible via the `Issue.variants` field on individual issues.

- 4,843 primary issues out of 10,848 total
- 1 orphaned variant exists (second printing whose parent was filtered during 1980s migration) — harmless

**Files modified:** `src/graphql/resolvers/index.ts`

---

## Phase 2 — Important (performance and reliability) ✅ COMPLETE

### 6. ✅ DataLoader batching (N+1 fix)
All relationship resolvers now use DataLoader instead of individual Prisma calls.
- Installed `dataloader`
- Created `src/lib/loaders.ts` with `createByIdLoader` generic factory and `createLoaders()` function
- By-ID loaders for all 11 entities (publisher, series, issue, story, country, language, storyType, creditType, creator, creatorNameDetail, seriesPublicationType)
- By-parent-ID loaders for one-to-many relationships: `storiesByIssueId`, `creditsByStoryId`, `nameDetailsByCreatorId`, `variantsByIssueId`
- Loaders passed via Apollo context (fresh per request to prevent cache leakage)
- Created `src/lib/context.ts` for shared `Context` type (avoids circular imports)
- `withErrorHandling` wrapper updated to pass context through to resolvers

**Files modified:** `src/lib/loaders.ts` (new), `src/lib/context.ts` (new), `src/graphql/resolvers/index.ts`, `src/index.ts`

### 7. ✅ Query depth limiting
- Installed `graphql-depth-limit`
- Added `validationRules: [depthLimit(15)]` to `ApolloServer` config
- Prevents circular query abuse (e.g. `Issue → Series → Issues → Series → ...`)

**Files modified:** `src/index.ts`

### 8. ✅ Input validation
- `validateSearch`: rejects search strings over 200 characters with `BAD_USER_INPUT`
- `validateDate`: rejects `keyDate`/`onSaleDate` not matching `YYYY-MM-DD` format
- `validatePagination`: rejects `limit` outside 1–100 range and negative `offset`
- All list query resolvers call validators before executing

**Files modified:** `src/graphql/resolvers/index.ts`

### 9. ✅ Structured logging
- Installed `pino` + `pino-pretty` (dev dependency)
- Created `src/lib/logger.ts` — uses `pino-pretty` in development, JSON in production
- `LOG_LEVEL` env var controls verbosity (defaults to `info`)
- `formatError` logs internal errors via Pino before stripping details in production
- `withErrorHandling` uses `logger.error` instead of `console.error`
- Server startup logged with structured `{ port }` context

**Files modified:** `src/lib/logger.ts` (new), `src/index.ts`, `src/graphql/resolvers/index.ts`, `.env.example`

---

## Phase 2.5 — API Contract Artifacts (required before frontend repos start) ✅ COMPLETE

### 10. ✅ Generate and commit schema.graphql
All three Apollo clients (web/TypeScript, iOS/Swift, Android/Kotlin) use code generation to produce typed models and query hooks from the schema. They can introspect a live server, but a **static `schema.graphql` file** is far more reliable — codegen runs without a live server, Claude can read it directly when planning frontend work, and it version-controls the API contract.

- Add a `generate:schema` npm script that prints the SDL from the running Apollo Server:
  ```bash
  npx tsx src/scripts/print-schema.ts > schema.graphql
  ```
- Create `src/scripts/print-schema.ts` using `printSchema` from `graphql` + the existing `typeDefs`
- Commit `schema.graphql` to the repo root — update it whenever the schema changes
- Each frontend repo references this file for their codegen config

**Files:** `schema.graphql` (new, generated), `src/scripts/print-schema.ts` (new), `package.json`

### 11. ✅ Example operations files
Beyond the schema, each frontend app needs **named `.graphql` operation files** (the actual queries they'll run) to generate typed hooks. Create a shared `operations/` directory with example operations covering all use cases:
- `operations/series.graphql` — `SearchSeries`, `GetSeries`, `SeriesByPublisher`
- `operations/issues.graphql` — `GetIssues`, `IssuesByKeyDate`, `IssuesByOnSaleDate`, `GetIssue`
- `operations/creators.graphql` — `SearchCreators`, `GetCreator`
- `operations/stories.graphql` — `GetStory`, `GetStoriesForIssue`

These double as documentation and as the starting point for each frontend app's own operations. Each app will copy and extend these as needed.

**Files:** `operations/*.graphql` (new directory)

---

## Phase 3 — Nice-to-have (before public launch)

### 12. Dockerfile + deployment config
Multi-stage Dockerfile for production Node builds. Required for Railway, Render, or Fly.io deployment.
- Multi-stage build: compile TypeScript in build stage, copy only `dist/` + production `node_modules` to runtime stage
- Use `node:24-alpine` as runtime base
- Add `.dockerignore`

**Files:** `Dockerfile` (new), `.dockerignore` (new), `package.json`

### 13. Tests
Zero coverage currently. Add Vitest + integration tests for resolver logic, pagination, and error handling.

### 14. ESLint
TypeScript strict is on but ESLint catches unhandled promise rejections and unsafe patterns.

### 15. README
Document setup, env variables, Supabase deployment steps, Railway deployment steps, and point to `schema.graphql` and `operations/` for frontend teams.

---

## Recommended Order

| # | Task | Status |
|---|------|--------|
| 1 | Express migration + CORS | ✅ Done |
| 2 | Error handling | ✅ Done |
| 3 | Connection types + totalCount | ✅ Done |
| 4 | Supabase database migration | ✅ Done |
| 5 | .env.example | ✅ Done |
| — | Variant filtering (issues query) | ✅ Done |
| 6 | DataLoader batching | ✅ Done |
| 7 | Query depth limiting | ✅ Done |
| 8 | Input validation | ✅ Done |
| 9 | Structured logging | ✅ Done |
| 10 | Generate schema.graphql + print-schema script | ✅ Done |
| 11 | Example operations files | ✅ Done |
| 12 | Dockerfile + API platform deploy | Pending |
| 13 | Tests | Pending |
| 14 | ESLint | Pending |
| 15 | README | Pending |

---

## Critical Files
- `src/index.ts` — Express + Apollo Server setup, CORS, error formatting, context function
- `src/graphql/typeDefs/index.ts` — GraphQL schema with connection types
- `src/graphql/resolvers/index.ts` — all resolvers with error handling, connection type returns, variant filtering
- `src/lib/prisma.ts` — Prisma singleton with pg Pool (ssl: rejectUnauthorized: false for Supabase)
- `src/lib/loaders.ts` — (Phase 2) DataLoader factory
- `prisma/schema.prisma` — add `directUrl = env("DIRECT_DATABASE_URL")` for Supabase migrations
- `.env` — DATABASE_URL uses `sslmode=no-verify` for Supabase compatibility

## Verification
1. Start server with `npm run dev`, confirm no startup errors with Supabase `DATABASE_URL`
2. Open Apollo Sandbox at `http://localhost:4000/graphql`, run queries
3. Confirm `totalCount` returned alongside `items` in all list queries
4. Confirm `issues` query returns only primary issues (4,843), not variants
5. Confirm `Issue.variants` field returns variant editions for individual issues
6. Confirm all 10,848 issues (4,843 primary + variants) are present in Supabase
