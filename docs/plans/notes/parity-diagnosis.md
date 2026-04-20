# Parity diagnosis — Supabase ↔ DigitalOcean

Step 1 of `docs/plans/post-migration-data-parity.md`. Ran 2026-04-20 via `scripts/diagnose-parity.sh`. Full raw output preserved in the feature-branch PR description.

## Outcome: A (match by `gcd_issue.id`)

Step 2 match key: **`issue.id`** — a direct `UPDATE gcd_issue SET cover_image_url, comic_vine_id FROM staging WHERE id = staging.id`.

## Evidence

### Row counts

| table | Supabase | DO | verdict |
| --- | ---: | ---: | --- |
| gcd_publisher | 1 | 1 | OK |
| gcd_series | 10,340 | 10,340 | OK |
| gcd_issue | 4,843 | 93,509 | **Δ (expected, see below)** |
| gcd_story | 29,610 | 545,490 | **Δ (expected, see below)** |
| gcd_story_credit | 89,899 | 1,578,323 | **Δ (expected, see below)** |
| gcd_creator | 8,498 | 8,498 | OK |
| gcd_creator_name_detail | 10,533 | 10,533 | OK |

The issue/story/story_credit deltas are expected. Supabase was a narrower snapshot (likely filtered to a DC-proper subset post-import); DO has the broader publisher-54 dataset produced by `scripts/migrate-to-postgres.py`. This is a *superset* relationship, not a divergence — every Supabase row has a counterpart on DO at the same id (verified below). DO simply has more rows that Supabase never had, which is fine: Step 2 backfills only the 4,843 Supabase issues, and the additional 88,666 DO-only issues stay null (explicitly out of scope).

### Series ID stability

All spot-checks return identical `(id, name, year_began)` tuples on both sides:

- **Crisis on Infinite Earths** (`name ILIKE 'Crisis on Infinite Earths%'`): 22 rows, identical on both sides.
- **Batman** (exact name): 11 volumes (1940, 2011, 2012, 2013, 2016, 2017, 2020, 2021, 2023, 2024, 2025), identical.
- **Action Comics**: 2 rows, identical.
- **Detective Comics**: 2 rows, identical.
- **Watchmen**: 7 rows, identical.

Conclusion: GCD dump preserves integer PKs across imports, and Supabase + DO were imported from the same (or equivalent) dumps. Series IDs align 1:1.

### Issue ID stability (sampled)

5 random Supabase issues with `cover_image_url`, verified on DO:

| id | series_id | number | key_date | Supabase `cover_image_url` | DO row present? |
| --- | --- | --- | --- | --- | --- |
| 39719 | 87 | 547 | 1985-02-00 | cloudinary `issue-39719.jpg` | yes, null cover |
| 40178 | 1245 | 278 | 1985-07-00 | cloudinary `issue-40178.jpg` | yes, null cover |
| 43431 | 2989 | 24 | 1987-10-00 | cloudinary `issue-43431.jpg` | yes, null cover |
| 45845 | 3386 | 28 | 1989-02-00 | cloudinary `issue-45845.jpg` | yes, null cover |
| 85807 | 3594 | 15 | 1989-02-00 | cloudinary `issue-85807.jpg` | yes, null cover |

All 5 sample issues exist on DO at the same `id`, with identical `series_id`, `number`, and `key_date`. Only `cover_image_url` differs (set on Supabase, null on DO). This is exactly the pattern Step 2 expects to fix.

### Frontend-pinned ID 2876 — outcome (C)

`SELECT * FROM gcd_series WHERE id = 2876` returns **zero rows on both Supabase and DO**. The dc-decade repo's hardcoded `2876` pin for "Crisis on Infinite Earths" was wrong (or very stale) regardless of the DO migration — id 2876 does not exist in either DB. The actual Crisis (1985) series is `id = 2973` on both.

This does not change the plan:
- **Step 2** (cover backfill) is unaffected — we don't backfill series, only issues.
- **Step 3** (add `Series.slug`) becomes the permanent fix: downstream stops pinning integer IDs and uses deterministic slugs that survive any future re-import.
- **Step 4** (mapping doc) will publish the correct current `(id, slug)` pairs for the homepage-pinned series so dc-decade can switch its queries.

### Cover-URL delta

| | total issues (non-deleted) | with `cover_image_url` | with `comic_vine_id` |
| --- | ---: | ---: | ---: |
| Supabase | 4,843 | 4,729 | 4,729 |
| DO | 93,509 | 0 | 0 |

Backfill workload: **4,729 UPDATEs** on DO (both columns, same rows). The 114 Supabase issues without a `cover_image_url` also have no `comic_vine_id` — Comic Vine had no match for them; they remain null on DO too.

### Cloudinary liveness

`curl -I https://res.cloudinary.com/dke4phurv/image/upload/v1772312530/comics-n-stuff/issue-39719.jpg` → `HTTP/2 200`. Asset is live; hosting is independent of Supabase/Railway (confirming the planning assumption). No re-upload needed.

## Implications for remaining steps

- **Step 2**: match by `gcd_issue.id`. Skip composite-match branch entirely. Only the 4,729 rows with non-null cover URLs on Supabase need extraction; the additional 114 rows in the Supabase `gcd_issue` table without covers contribute nothing. Extraction query narrows to `WHERE cover_image_url IS NOT NULL`.
- **Step 3**: unchanged — proceed as planned. Slug design should still include `year_began` to disambiguate repeated titles (Batman has 11 volumes, Watchmen has 7, etc.).
- **Step 4**: the mapping doc is now doubly useful — it also explains why `id = 2876` returned null (the ID was never correct), so downstream readers understand they were fixing a latent bug, not coping with ID drift.

## Assumptions validated

1. ✅ Supabase + DO `gcd_issue` share the same id space.
2. ✅ `SUPABASE_URL` (from `.env` `DIRECT_DATABASE_URL`) still authenticates. Supabase project is live.
3. ✅ Cloudinary assets remain live (HTTP 200 on sample).

## Assumptions invalidated / refined

- The planning hypothesis that "the frontend's pinned IDs may have come from a differently-vintaged or differently-scoped dump" is confirmed for 2876, though the real cause may be simpler (hand-typed / out-of-date rather than vintage drift). Either way, the remediation — slug — stands.
