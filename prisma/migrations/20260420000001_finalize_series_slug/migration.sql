-- Step 2 of 2: tighten slug column after backfill.
-- Run only after scripts/apply-series-slugs.sh has populated every row.
ALTER TABLE "gcd_series" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "gcd_series_slug_key" ON "gcd_series"("slug");
