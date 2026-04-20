# Plan: Comic Vine Image Gathering → Cloudinary

## Context

The app has no cover images for issues. The goal is to fetch one cover image per issue from the Comic Vine API and upload it to Cloudinary for permanent hosting. Once all images are in Cloudinary, the Comic Vine API is no longer needed — this is a **one-time batch migration**, not an ongoing integration.

## Recommendation: Standalone TypeScript Script (not a Claude agent)

A standalone script is the right approach because:
- **Rate limiting** — Comic Vine allows 200 requests/resource/hour with velocity detection. A script with a configurable delay (e.g., 2s between requests) handles this deterministically. A Claude agent using Haiku would have no reliable way to throttle or resume.
- **Resumability** — With ~4,800 primary issues, this will take hours. A script can track progress in the database (which issues already have images) and resume from where it left off after interruption.
- **Cost** — A script costs nothing to run. An agent making 4,800+ tool calls would consume significant tokens for a mechanical task.
- **Cron is overkill** — This is a one-time migration, not recurring. Run the script manually; re-run it to catch any failures.

## Comic Vine API Details

- **Base URL:** `https://comicvine.gamespot.com/api/`
- **Auth:** Query parameter `?api_key=YOUR_KEY`
- **Format:** `&format=json`
- **Rate limit:** 200 requests per resource per hour; avoid rapid bursts (velocity detection)
- **Search endpoint:** `/search/?api_key=KEY&format=json&resources=issue&query=SEARCH_TERM`
- **Issue endpoint:** `/issue/4000-ISSUE_ID/?api_key=KEY&format=json&field_list=image`
- **Image object:** Returns an `image` object with multiple sizes:
  - `icon_url`, `tiny_url`, `thumb_url`, `small_url`, `medium_url`, `screen_url`, `screen_large_url`, `super_url`, `original_url`

## Image Selection Strategy

Pick `original_url` (highest quality). If `original_url` and `super_url` point to the same image dimensions, use `super_url` (smaller file size). The script should:
1. Fetch the `image` field from Comic Vine
2. Prefer `original_url`; fall back to `super_url` if original is unavailable
3. Upload the image to Cloudinary (which handles resizing/optimization on the fly via URL transforms)

Since Cloudinary generates any size on demand from the uploaded original, we only need to store one image — the best quality available.

## Implementation

### 1. Add fields to Issue model (`prisma/schema.prisma`) -- DONE

```prisma
model Issue {
  // ... existing fields ...
  coverImageUrl      String?  @map("cover_image_url") @db.VarChar(500)
  comicVineId        Int?     @map("comic_vine_id")
  // ...
}
```

- `coverImageUrl` — The Cloudinary URL for the cover image
- `comicVineId` — The Comic Vine issue ID, used for lookups and to avoid re-fetching

### 2. Update GraphQL schema (`src/graphql/typeDefs/index.ts`) -- DONE

Add `coverImageUrl: String` to the `Issue` type.

### 3. Environment variables (`.env` and `.env.example`) -- DONE

```bash
COMIC_VINE_API_KEY=your_key_here
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your_secret
```

### 4. Install Cloudinary SDK -- DONE

```bash
npm install cloudinary
```

### 5. Create and run the script (`src/scripts/fetch-covers.ts`)

```
npm script: "fetch-covers": "tsx src/scripts/fetch-covers.ts"
```

The script flow:
1. Query all primary issues (variant_of_id IS NULL) that have no `coverImageUrl`
2. For each issue, search Comic Vine by series name + issue number
3. Extract the `image.original_url` (or `super_url` fallback)
4. Upload to Cloudinary using the upload API
5. Save the Cloudinary URL and Comic Vine ID back to the database
6. Wait 2 seconds between Comic Vine API calls (safe under 200/hour limit)
7. Log progress: `[42/4843] Batman #319 → uploaded`

Key details:
- Use native `fetch()` (Node 24, no extra dependency needed)
- Use Cloudinary's Node SDK (`cloudinary` npm package) for uploads
- Batch size: process all issues in a single run with delay between calls
- On failure: log the error, skip the issue, continue (re-run later to catch failures)
- Resumable by design: query only issues WHERE `cover_image_url IS NULL`

**Running the script (~2.7 hours for ~4,800 issues):**

```bash
caffeinate -i npm run fetch-covers
```

`caffeinate -i` prevents macOS idle sleep while the script runs, then allows normal sleep again once it finishes. Re-run the same command to retry any failures — it skips already-processed issues.

## Files Modified/Created

- `prisma/schema.prisma` — add `coverImageUrl` and `comicVineId` fields to Issue
- `prisma/migrations/<timestamp>_add_cover_image_fields/` — generated migration
- `src/graphql/typeDefs/index.ts` — add `coverImageUrl` to Issue type
- `src/scripts/fetch-covers.ts` — **new** batch script
- `.env.example` — add Comic Vine + Cloudinary env vars
- `package.json` — add `fetch-covers` script, `cloudinary` dependency

## Matching Strategy

The tricky part is matching GCD issues to Comic Vine issues. The approach:
1. Search Comic Vine: `/search/?resources=issue&query=Batman 503`
2. Filter results: match on `volume.name` (series name) and `issue_number`
3. If multiple matches, prefer the one whose `cover_date` is closest to the GCD `key_date`
4. If no match, log and skip

## Verification

1. ~~Run `npx prisma migrate dev` to add the new fields~~ — DONE
2. Run `caffeinate -i npm run fetch-covers` and verify first 5-10 issues get images
3. Check Cloudinary dashboard for uploaded images
4. Query the API: `{ issues(seriesId: 141, issueNumber: "319") { items { coverImageUrl } } }`
5. Re-run the script — it should skip already-processed issues
