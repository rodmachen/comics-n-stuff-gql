# Comics 'n Stuff GraphQL API

GraphQL API serving DC Comics data from the 1980s, built with Apollo Server 5, Prisma 7, and PostgreSQL.

## Quick Start

```bash
npm install
cp .env.example .env   # then fill in your database URLs
npx prisma generate
npm run dev             # http://localhost:4000/graphql
```

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Supabase pooler URL (port 6543, `pgbouncer=true&sslmode=no-verify`) |
| `DIRECT_DATABASE_URL` | Supabase direct URL (port 5432, for Prisma migrations) |
| `PORT` | Server port (default: `4000`) |
| `CORS_ORIGINS` | Comma-separated allowed origins (default: `*`) |
| `NODE_ENV` | `development` or `production` |
| `LOG_LEVEL` | `trace`, `debug`, `info`, `warn`, `error`, `fatal` (default: `info`) |

See `.env.example` for a full template.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run production build |
| `npm test` | Run tests (Vitest) |
| `npm run lint` | Run ESLint |
| `npm run generate:schema` | Regenerate `schema.graphql` from type definitions |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Run Prisma migrations |
| `npm run prisma:studio` | Open Prisma Studio |

## API Schema

The full GraphQL schema is committed at [`schema.graphql`](./schema.graphql). Frontend code generators (Apollo iOS, Apollo Kotlin, GraphQL Code Generator) should point to this file rather than introspecting a live server.

Regenerate after schema changes:

```bash
npm run generate:schema
```

## Example Operations

The [`operations/`](./operations/) directory contains named `.graphql` operation files covering all query use cases:

- `operations/series.graphql` — `SearchSeries`, `GetSeries`, `SeriesByPublisher`
- `operations/issues.graphql` — `GetIssues`, `IssuesByKeyDate`, `IssuesByOnSaleDate`, `GetIssue`
- `operations/creators.graphql` — `SearchCreators`, `GetCreator`
- `operations/stories.graphql` — `GetStoriesForIssue`, `GetStory`

Frontend apps can copy these as a starting point for their own codegen configs.

## Database (Supabase)

The PostgreSQL database is hosted on Supabase. Key setup notes:

- Use the **transaction pooler** URL (port 6543) for `DATABASE_URL`
- Use the **direct connection** URL (port 5432) for `DIRECT_DATABASE_URL` and for `pg_dump`/`psql` imports
- Connection strings must use `sslmode=no-verify` (not `sslmode=require`) to avoid TLS certificate errors
- The Prisma adapter requires creating a `pg.Pool` with `ssl: { rejectUnauthorized: false }` — passing SSL options directly to `PrismaPg` does not work

## Docker

Build and run with Docker:

```bash
docker build -t comics-gql .
docker run -p 4000:4000 --env-file .env comics-gql
```

The Dockerfile uses a multi-stage build: TypeScript compiles in the build stage, and only `dist/` with production dependencies are copied to the `node:24-alpine` runtime image.

## Architecture

- **`src/index.ts`** — Express + Apollo Server setup, CORS, error formatting
- **`src/graphql/typeDefs/`** — GraphQL schema with connection types
- **`src/graphql/resolvers/`** — All resolvers with error handling, pagination, variant filtering
- **`src/lib/prisma.ts`** — Prisma singleton with pg Pool for Supabase SSL
- **`src/lib/loaders.ts`** — DataLoader factory (N+1 fix)
- **`src/lib/logger.ts`** — Pino structured logging
- **`src/lib/context.ts`** — Apollo context type
- **`prisma/schema.prisma`** — Database schema
