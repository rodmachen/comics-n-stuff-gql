# Plan: Deploy API to Railway

## Context

The `comics-n-stuff-gql` GraphQL API needs to be deployed to production before the DC Decade client apps can be built. The API is Dockerized and connects to an existing Supabase PostgreSQL database. Railway is the target platform — it's free at this usage level ($5/mo credit covers a single lightweight container), has no cold starts, and auto-deploys from GitHub.

## Prerequisites

- GitHub repo for `comics-n-stuff-gql` (push current code if not already there)
- Railway account (sign up at railway.app with GitHub)
- Supabase database already running with data

---

## Step 1: Add a health check endpoint

Railway (and any container platform) needs a health check. Add a `/health` endpoint before the GraphQL middleware.

**File:** `src/index.ts`

Add before the `/graphql` middleware:
```typescript
app.get("/health", (_, res) => {
  res.json({ status: "ok" });
});
```

---

## Step 2: Fix Prisma schema env vars

The Prisma schema currently has hardcoded connection strings inside `env()` calls. These should reference env var names, not values.

**File:** `prisma/schema.prisma` (lines 8-9)

Change to:
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_DATABASE_URL")
}
```

---

## Step 3: Deploy to Railway

### 3a. Create the project

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click "New Project" → "Deploy from GitHub repo"
3. Select the `comics-n-stuff-gql` repository
4. Railway auto-detects the Dockerfile

### 3b. Set environment variables

In Railway's project settings → Variables, add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql://postgres.rwzvlouetkgnlnemqzmo:pLLD7YKDUEcfscZG@aws-0-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=no-verify` |
| `DIRECT_DATABASE_URL` | `postgresql://postgres:pLLD7YKDUEcfscZG@db.rwzvlouetkgnlnemqzmo.supabase.co:5432/postgres` |
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `CORS_ORIGINS` | `https://dc-decade.vercel.app,http://localhost:3000` |
| `LOG_LEVEL` | `info` |

### 3c. Configure networking

In Railway's project settings → Networking:
- Generate a public domain (Railway provides `*.up.railway.app`)
- Or add a custom domain if desired
- Railway automatically routes HTTPS traffic to your container's PORT

### 3d. Configure health check

In Railway's project settings → Deploy:
- Health check path: `/health`
- Health check timeout: 30s

---

## Step 4: Verify deployment

Once Railway deploys (typically 1-2 minutes):

1. **Health check:**
   ```
   curl https://YOUR-APP.up.railway.app/health
   ```
   Expected: `{"status":"ok"}`

2. **GraphQL endpoint:**
   ```
   curl -X POST https://YOUR-APP.up.railway.app/graphql \
     -H "Content-Type: application/json" \
     -d '{"query":"{ publishers(limit: 1) { items { name } totalCount } }"}'
   ```
   Expected: JSON response with publisher data

3. **Search query:**
   ```
   curl -X POST https://YOUR-APP.up.railway.app/graphql \
     -H "Content-Type: application/json" \
     -d '{"query":"{ allSeries(search: \"Batman\", limit: 3) { items { name yearBegan } } }"}'
   ```

---

## Step 5: Enable auto-deploy

Railway auto-deploys by default when you push to the connected branch (usually `main`). Verify this is enabled in Settings → Source.

---

## Code Changes Required

Only two files need changes before deploying:

### 1. `src/index.ts` — add health check
Add `app.get("/health", ...)` before the GraphQL middleware.

### 2. `prisma/schema.prisma` — fix env var references
Change hardcoded connection strings to `env("DATABASE_URL")` and `env("DIRECT_DATABASE_URL")`.

---

## Post-Deployment

- **Update `plans/app-strategy.md`** with the production API URL once deployed
- **Update CORS_ORIGINS** as new frontend domains are added (Vercel preview URLs, etc.)
- **Monitor** via Railway's built-in logs dashboard (Pino JSON logs are searchable)
- **Database backups** are handled by Supabase (daily automatic backups on free tier)

---

## Cost

Railway provides $5/mo in free credits. A single lightweight Node.js container serving a few dozen requests/month will use well under $1/mo. No credit card required to start.
