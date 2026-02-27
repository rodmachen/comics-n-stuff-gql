# Consolidated Improvement Roadmap

## Context

This document reviews the `comics-n-stuff-gql` codebase against the installed Claude Code skills and consolidates all existing plans in `docs/plans/` into a single prioritized roadmap. The goal is to identify what's done, what's pending, and what order to tackle remaining work.

---

## Skill Applicability

| Installed Skill | Applicable? | Notes |
|---|---|---|
| **supabase-postgres-best-practices** | Yes | Supabase PostgreSQL is the database — directly relevant |
| vercel-react-best-practices | Not yet | Will apply when the Next.js web app is built (see `app-strategy.md`) |
| vercel-composition-patterns | Not yet | Same — applies to future React component architecture |
| vercel-react-native-skills | Not yet | Applies to the future React Native iOS app |
| web-design-guidelines | Not yet | No UI exists yet |
| frontend-design | Not yet | No frontend exists yet |

**Only `supabase-postgres-best-practices` applies to the current codebase.** The other five skills will become relevant when work begins on the `dc-decade` client apps.

---

## Existing Plan Status

| Plan | File | Status |
|---|---|---|
| Production Readiness | `production-readiness.md` | **COMPLETE** — all 15 items done |
| Deploy API (Railway) | `deploy-api.md` | **Code complete** — deployment steps documented, needs execution |
| Add GIN Trigram Indexes | `add-indexes.md` | **NOT STARTED** |
| Image Gathering (Comic Vine → Cloudinary) | `image-gathering.md` | **NOT STARTED** |
| App Strategy (DC Decade 4-platform) | `app-strategy.md` | **NOT STARTED** — blocked by deploy + images |
| Basic Profile | `Basic Profile.md` | **UNRELATED** — job search template, not part of this project |

---

## New Recommendations from Supabase Postgres Skill Review

These are issues found by reviewing the codebase against Supabase Postgres best practices that are **not covered by any existing plan**:

### A. Add Foreign Key and Filter Indexes

`add-indexes.md` covers GIN trigram indexes for text search, but the schema is also missing **B-tree indexes on foreign keys and commonly filtered columns**. Every relationship resolver and filtered query benefits from these.

**Indexes to add to `prisma/schema.prisma`:**

| Model | Column(s) | Query that benefits |
|---|---|---|
| Publisher | `deleted` | All publisher queries filter `deleted: 0` |
| Series | `publisherId` | `allSeries(publisherId:)`, `Publisher.series` resolver |
| Series | `deleted, sortName` | `allSeries` list query |
| Issue | `seriesId, deleted, variantOfId` | `issues` query, `Series.issues` resolver |
| Issue | `keyDate` | `issues(keyDate:)` filter |
| Issue | `onSaleDate` | `issues(onSaleDate:)` filter |
| Story | `issueId, deleted` | `storiesByIssueId` DataLoader |
| StoryCredit | `storyId, deleted` | `creditsByStoryId` DataLoader |
| StoryCredit | `creatorId` | `creatorNameDetail` resolver lookups |
| Creator | `deleted, sortName` | `creators` list query |
| CreatorNameDetail | `creatorId, deleted` | `nameDetailsByCreatorId` DataLoader |

These should be added **alongside** the GIN trigram indexes in the same migration.

### B. Fix SSL Configuration

**File:** `src/lib/prisma.ts`

`ssl: { rejectUnauthorized: false }` disables certificate verification. For production with Supabase, this should use the Supabase root CA certificate or at minimum be configurable per environment. This is a security concern flagged by the Supabase best practices.

### C. Configure Connection Pool Sizing

**File:** `src/lib/prisma.ts`

The `pg.Pool` uses defaults (max 10 connections). Should be configurable via environment variable and sized appropriately for the Supabase plan's connection limits (free tier allows ~60 direct / ~200 pooler connections).

```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: parseInt(process.env.DB_POOL_SIZE || "10"),
  idleTimeoutMillis: 30000,
});
```

### D. Country/Language Resolvers Lack DataLoaders

`Country.publishers` and `Country.series` resolvers hit the database directly without batching. If a query returns multiple countries, this causes N+1 queries. Low priority since countries are rarely queried in bulk, but worth noting.

---

## Prioritized Execution Order

### Tier 1 — Deploy (unblocks everything else)

| # | Task | Plan | Effort |
|---|---|---|---|
| 1 | **Deploy API to Railway** | `deploy-api.md` | Manual steps — ~30 min |

The API must be live before image gathering or client apps can proceed.

### Tier 2 — Database Performance (do before traffic arrives)

| # | Task | Plan | Effort |
|---|---|---|---|
| 2 | **Add GIN trigram indexes** | `add-indexes.md` | Schema + migration |
| 3 | **Add FK/filter B-tree indexes** | New (section A above) | Schema + migration |
| 4 | **Configure connection pool** | New (section C above) | `src/lib/prisma.ts` — small change |
| 5 | **Fix SSL configuration** | New (section B above) | `src/lib/prisma.ts` — small change |

Items 2 and 3 can be combined into a single migration. Items 4 and 5 are a single file edit.

### Tier 3 — Content (prerequisite for client apps)

| # | Task | Plan | Effort |
|---|---|---|---|
| 6 | **Gather cover images** | `image-gathering.md` | Script + multi-hour batch run |

Requires: deployed API (#1), Comic Vine API key, Cloudinary account.

### Tier 4 — Client Apps (the big build)

| # | Task | Plan | Effort |
|---|---|---|---|
| 7 | **Build DC Decade apps** | `app-strategy.md` | Large — 4 apps in parallel |

Requires: deployed API (#1), cover images (#6), branding assets. This is when the React/React Native/web design skills become applicable.

### Tier 5 — Low Priority

| # | Task | Notes |
|---|---|---|
| 8 | **Add Country/Language DataLoaders** | Section D above — only if queries show N+1 issues |
| 9 | **Select-only queries** | Reduce column fetching for wide tables — optimization, not urgent |

---

## Verification

After completing Tiers 1-2:
1. Confirm Railway deployment responds at `/health` and `/graphql`
2. Run `EXPLAIN ANALYZE` on search queries to verify GIN indexes are used
3. Run `EXPLAIN ANALYZE` on filtered queries (e.g., issues by seriesId) to verify B-tree indexes
4. Verify connection pool config via Railway logs (no connection exhaustion errors)
5. Run existing test suite: `npm test`
6. Test all GraphQL operations via Apollo Sandbox against the deployed URL
