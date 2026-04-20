-- Enable pg_trgm extension for GIN trigram indexes
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateIndex
CREATE INDEX "idx_publisher_name_trgm" ON "gcd_publisher" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "gcd_publisher_deleted_idx" ON "gcd_publisher"("deleted");

-- CreateIndex
CREATE INDEX "idx_series_name_trgm" ON "gcd_series" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "gcd_series_publisher_id_idx" ON "gcd_series"("publisher_id");

-- CreateIndex
CREATE INDEX "gcd_series_deleted_sort_name_idx" ON "gcd_series"("deleted", "sort_name");

-- CreateIndex
CREATE INDEX "gcd_issue_series_id_deleted_variant_of_id_idx" ON "gcd_issue"("series_id", "deleted", "variant_of_id");

-- CreateIndex
CREATE INDEX "gcd_issue_key_date_idx" ON "gcd_issue"("key_date");

-- CreateIndex
CREATE INDEX "gcd_issue_on_sale_date_idx" ON "gcd_issue"("on_sale_date");

-- CreateIndex
CREATE INDEX "gcd_story_issue_id_deleted_idx" ON "gcd_story"("issue_id", "deleted");

-- CreateIndex
CREATE INDEX "gcd_story_credit_story_id_deleted_idx" ON "gcd_story_credit"("story_id", "deleted");

-- CreateIndex
CREATE INDEX "gcd_story_credit_creator_id_idx" ON "gcd_story_credit"("creator_id");

-- CreateIndex
CREATE INDEX "idx_creator_name_trgm" ON "gcd_creator" USING GIN ("gcd_official_name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "gcd_creator_deleted_sort_name_idx" ON "gcd_creator"("deleted", "sort_name");

-- CreateIndex
CREATE INDEX "gcd_creator_name_detail_creator_id_deleted_idx" ON "gcd_creator_name_detail"("creator_id", "deleted");
