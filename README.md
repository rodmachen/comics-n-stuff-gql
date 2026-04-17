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
| `DATABASE_URL` | PgBouncer URL (DigitalOcean droplet, requires `sslmode=require` for TLS) |
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

## Database (DigitalOcean)

The PostgreSQL database runs in Docker on a DigitalOcean droplet, accessed via **PgBouncer** on port 6432 with TLS. Key setup notes:

- Use the **PgBouncer pooler** URL (port 6432) for all connections — it handles connection pooling and transaction boundaries
- TLS is required; use `sslmode=require` in all connection strings
- The Let's Encrypt certificate is auto-provisioned by Caddy and rotated automatically
- For local development, you can optionally test against the production droplet or set up a local Postgres instance with the same schema

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
- **`src/lib/prisma.ts`** — Prisma singleton with pg Pool for TLS
- **`src/lib/loaders.ts`** — DataLoader factory (N+1 fix)
- **`src/lib/logger.ts`** — Pino structured logging
- **`src/lib/context.ts`** — Apollo context type
- **`prisma/schema.prisma`** — Database schema
