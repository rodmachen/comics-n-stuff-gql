# API Production Readiness Plan

## Context
This GraphQL API (Apollo Server 5 + Prisma 7 + PostgreSQL) currently runs locally and serves DC Comics data from the 1980s. Before web, iOS, and Android apps are built against it, the API needs to be stable, performant, and reachable from the internet.

**Deployment architecture:**
- **Database**: Supabase (PostgreSQL)
- **API server**: Separate hosting platform (Railway, Render, or Fly.io) running Node.js

Changes to the GraphQL schema are particularly disruptive once apps exist, so schema decisions must be made now.

---

## Phase 1 — Blocking (apps cannot work without these)

### 1. Migrate to Express + configure CORS
`startStandaloneServer` provides no control over CORS or middleware. Switch to `expressMiddleware`.
- Install `express`, `cors`, `@types/express`, `@types/cors`
- Rewrite `src/index.ts` to create an Express app, apply `cors({ origin: process.env.CORS_ORIGINS })`
- This also enables the context function needed for DataLoaders (Phase 2)

**Files:** `src/index.ts`, `package.json`

### 2. Error handling
No try/catch exists anywhere. Stack traces will leak to clients.
- Add `formatError` hook to `ApolloServer` in `src/index.ts` to strip stack traces in production
- Create a `withErrorHandling` wrapper in `src/graphql/resolvers/index.ts` to wrap all resolvers
- Fix the non-null assertion `result!.country` in the Publisher resolver

**Files:** `src/index.ts`, `src/graphql/resolvers/index.ts`

### 3. Pagination connection types with totalCount
Apps need total counts to build paging UI. Changing this schema after apps are built is very painful.
- Add connection types to `src/graphql/typeDefs/index.ts`:
  ```graphql
  type SeriesConnection { items: [Series!]!, totalCount: Int! }
  type IssueConnection  { items: [Issue!]!,  totalCount: Int! }
  # etc. for Publisher, Story, Creator
  ```
- Update list query resolvers to run `prisma.$transaction([count, findMany])`

**Files:** `src/graphql/typeDefs/index.ts`, `src/graphql/resolvers/index.ts`

### 4. Deploy database to Supabase
The `DATABASE_URL` points to localhost. Apps cannot reach that.
- Export `comics_gcd` locally (`pg_dump`) and import to Supabase (36MB, well within free tier)
- Use the **Supavisor pooler connection string** (not the direct connection string) in production — Supabase provides this in the dashboard under Settings → Database → Connection string → Transaction pooler
- The pooler URL looks like: `postgresql://postgres.xxxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
- Add `?pgbouncer=true` to the connection string since Prisma uses PgBouncer-compatible mode with the pooler
- SSL is required: Supabase enforces TLS — add `?sslmode=require` if needed (Supabase pooler URLs include this by default)
- Keep a direct (non-pooled) connection string for local dev and Prisma migrations, since PgBouncer doesn't support all Prisma migration commands

**Files:** `.env`

### 5. Create .env.example
No template exists for deployment environments.
- Add `.env.example` with: `DATABASE_URL`, `DIRECT_DATABASE_URL` (for migrations), `PORT`, `CORS_ORIGINS`, `NODE_ENV`

**Files:** `.env.example` (new)

---

## Phase 2 — Important (performance and reliability)

### 6. DataLoader batching (N+1 fix)
Every relationship resolver fires individual DB queries per parent. A single nested query can generate thousands of round-trips. This is especially costly with Supabase since every query goes over the network.
- Install `dataloader`
- Create `src/lib/loaders.ts` with one DataLoader per entity (publisher, series, country, language, storyType, creditType, creator, creatorNameDetail, issue, story)
- Pass loaders via context (instantiated fresh per request to prevent cache leakage between users)
- Refactor all relationship resolvers to use `context.loaders.X.load(id)` instead of direct Prisma calls
- One-to-many relationships (e.g. `Series.issues`) need batch-by-parent-ID loaders

**Files:** `src/lib/loaders.ts` (new), `src/graphql/resolvers/index.ts`, `src/index.ts`

### 7. Query depth limiting
The schema has circular paths (e.g. `Issue → Series → Issues → Series`). Unconstrained depth queries can DoS the API.
- Install `graphql-depth-limit`
- Add to `ApolloServer` `validationRules` in `src/index.ts` with a max depth of ~15

**Files:** `src/index.ts`, `package.json`

### 8. Input validation
Search strings have no length cap; date strings have no format check; limit/offset silently clamp.
- Validate `search` max length (200 chars)
- Validate `keyDate`/`onSaleDate` format (`YYYY-MM-DD`)
- Return explicit `BAD_USER_INPUT` `GraphQLError` instead of silently clamping

**Files:** `src/graphql/resolvers/index.ts`

### 9. Structured logging
Only `console.log('Server ready...')` exists. Production debugging is impossible without logs.
- Install `pino`
- Create `src/lib/logger.ts`
- Pass logger to `ApolloServer` and log errors in `formatError`
- Log slow Prisma queries via `PrismaClient` event emitter (important since every query now crosses the network to Supabase)

**Files:** `src/lib/logger.ts` (new), `src/index.ts`, `src/lib/prisma.ts`, `package.json`

---

## Phase 2.5 — API Contract Artifacts (required before frontend repos start)

### 10. Generate and commit schema.graphql
All three Apollo clients (web/TypeScript, iOS/Swift, Android/Kotlin) use code generation to produce typed models and query hooks from the schema. They can introspect a live server, but a **static `schema.graphql` file** is far more reliable — codegen runs without a live server, Claude can read it directly when planning frontend work, and it version-controls the API contract.

- Add a `generate:schema` npm script that prints the SDL from the running Apollo Server:
  ```bash
  npx tsx src/scripts/print-schema.ts > schema.graphql
  ```
- Create `src/scripts/print-schema.ts` using `printSchema` from `graphql` + the existing `typeDefs`
- Commit `schema.graphql` to the repo root — update it whenever the schema changes
- Each frontend repo references this file for their codegen config

**Files:** `schema.graphql` (new, generated), `src/scripts/print-schema.ts` (new), `package.json`

### 11. Example operations files
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

| # | Task | Effort |
|---|------|--------|
| 1 | Express migration + CORS | 1 hr |
| 2 | Error handling | 1 hr |
| 3 | Connection types + totalCount | 2-3 hrs |
| 4 | Supabase database migration | 2-3 hrs |
| 5 | .env.example | 15 min |
| 6 | DataLoader batching | 4-6 hrs |
| 7 | Query depth limiting | 1 hr |
| 8 | Input validation | 1-2 hrs |
| 9 | Structured logging | 2 hrs |
| 10 | Generate schema.graphql + print-schema script | 30 min |
| 11 | Example operations files | 1 hr |
| 12 | Dockerfile + API platform deploy | 2-3 hrs |
| 13 | Tests | 4-8 hrs |
| 14 | ESLint | 1 hr |
| 15 | README | 1-2 hrs |

---

## Critical Files
- `src/index.ts` — server setup; needs Express, CORS, error formatting, context with loaders
- `src/graphql/typeDefs/index.ts` — schema; needs connection types before apps are built
- `src/graphql/resolvers/index.ts` — all resolvers; needs error handling, DataLoader usage, connection type returns
- `src/lib/loaders.ts` — new file; DataLoader factory (one per entity, fresh per request)
- `src/lib/prisma.ts` — Prisma singleton; add slow query logging
- `prisma/schema.prisma` — add `directUrl = env("DIRECT_DATABASE_URL")` for Supabase migrations

## Verification
1. Start server with `npm run dev`, confirm no startup errors with Supabase `DATABASE_URL`
2. Open Apollo Sandbox, run nested query and confirm DataLoader batching (Prisma logs should show batched `WHERE id IN (...)` queries)
3. Run a query from a different origin in a browser — confirm CORS headers present
4. Send a deeply nested query — confirm depth limit rejection error
5. Confirm `totalCount` returned alongside `items` in all list queries
6. Confirm all 10,848 issues are present in Supabase via `psql` or Supabase dashboard
