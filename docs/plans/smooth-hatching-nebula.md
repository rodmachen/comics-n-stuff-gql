# Plan: Create fetch-covers script (image-gathering step 5)

## Context

Steps 1-4 of the image-gathering plan are done: Issue model has `coverImageUrl`/`comicVineId` fields, GraphQL schema updated, env vars configured, Cloudinary SDK installed. Now we need the actual script that fetches cover images from Comic Vine and uploads them to Cloudinary.

## Files to create/modify

1. **`src/scripts/fetch-covers.ts`** — new script
2. **`package.json`** — add `"fetch-covers"` script entry

## Script design (`src/scripts/fetch-covers.ts`)

Imports (follows existing script pattern from `print-schema.ts`):
- `import "dotenv/config"` — load env vars since script runs standalone
- `import { prisma } from "../lib/prisma.js"` — existing Prisma client
- `import { v2 as cloudinary } from "cloudinary"` — installed at v2.9.0

### Flow

1. Configure Cloudinary from `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
2. Validate that `COMIC_VINE_API_KEY` is set
3. Query all canonical issues needing covers: `deleted: 0`, `variantOfId: null`, `coverImageUrl: null`, with `include: { series: true }` to get series name
4. Log total count
5. For each issue:
   a. Search Comic Vine: `/search/?api_key=KEY&format=json&resources=issue&query=SERIES_NAME ISSUE_NUMBER`
   b. Filter results: match `volume.name` (case-insensitive) and `issue_number` (exact)
   c. If multiple matches, prefer closest `cover_date` to GCD `keyDate`
   d. If no match, log and skip
   e. Get `image.original_url` from search result (fallback `super_url`)
   f. Upload to Cloudinary: `cloudinary.uploader.upload(url, { folder: "comics-n-stuff", public_id: "issue-{id}" })`
   g. Update DB: `prisma.issue.update({ where: { id }, data: { coverImageUrl, comicVineId } })`
   h. Log: `[42/4843] Series Name #number -> uploaded`
   i. Wait 2s before next Comic Vine request

### Error handling

- Each issue wrapped in try/catch — log error, continue
- Comic Vine rate limit (HTTP 420): wait 60s, retry once
- End summary: total, uploaded, skipped (no match), failed

### package.json

Add to scripts: `"fetch-covers": "tsx src/scripts/fetch-covers.ts"`

## Verification

1. `caffeinate -i npm run fetch-covers` — check first few issues get images
2. Check Cloudinary dashboard
3. Re-run — should skip already-processed issues
