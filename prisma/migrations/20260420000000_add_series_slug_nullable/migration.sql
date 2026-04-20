-- Step 1 of 2: add nullable slug column.
-- Step 2 (20260420000001_finalize_series_slug) must be applied AFTER running
-- scripts/apply-series-slugs.sh, which backfills the column from computed slugs.
ALTER TABLE "gcd_series" ADD COLUMN IF NOT EXISTS "slug" VARCHAR(255);
