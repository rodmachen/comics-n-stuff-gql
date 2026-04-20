#!/usr/bin/env bash
# scripts/diagnose-parity.sh
# Step 1 diagnostic from docs/plans/post-migration-data-parity.md.
# Compares Supabase (pre-migration source) vs DigitalOcean (post-migration target)
# to determine Step 2's match strategy (by-id vs composite) and verify whether
# the homepage-pinned series IDs resolve on DO.
#
# Prereqs:
#   - SUPABASE_URL exported in the current shell (pre-migration connection string)
#   - SSH access to rod@142.93.202.59 via ~/.ssh/droplet
#
# Usage:
#   bash scripts/diagnose-parity.sh                # human-readable to stdout
#   bash scripts/diagnose-parity.sh | tee out.log  # capture
#
# Writes nothing to either database. Pure SELECTs.

set -euo pipefail

: "${SUPABASE_URL:?SUPABASE_URL must be exported (pre-migration Supabase connection string)}"

DROPLET="rod@142.93.202.59"
SSH_KEY="$HOME/.ssh/droplet"
SSH="ssh -i $SSH_KEY -o BatchMode=yes"

sb()    { psql "$SUPABASE_URL" -X -c "$1"; }
sb_v()  { psql "$SUPABASE_URL" -X -t -A -c "$1"; }  # bare value, for interpolation
do_db() { echo "$1" | $SSH "$DROPLET" "docker exec -i postgres psql -U postgres -d comics_gcd -X"; }
do_v()  { echo "$1" | $SSH "$DROPLET" "docker exec -i postgres psql -U postgres -d comics_gcd -X -t -A"; }

section() { echo ""; echo "=============================================================="; echo "  $*"; echo "=============================================================="; }

section "1. Row-count parity (7 core tables)"
printf "  %-30s %12s %12s %s\n" "table" "supabase" "do" "verdict"
for tbl in gcd_publisher gcd_series gcd_issue gcd_story gcd_story_credit gcd_creator gcd_creator_name_detail; do
  s=$(sb_v "SELECT COUNT(*) FROM $tbl;")
  d=$(do_v "SELECT COUNT(*) FROM $tbl;")
  v=$([[ "$s" == "$d" ]] && echo OK || echo DELTA)
  printf "  %-30s %12s %12s %s\n" "$tbl" "$s" "$d" "$v"
done

section "2. Crisis on Infinite Earths spot-check (load-bearing check)"
echo "--- Supabase:"
sb "SELECT id, name, year_began FROM gcd_series WHERE name ILIKE 'Crisis on Infinite Earths%' ORDER BY id;"
echo "--- DO:"
do_db "SELECT id, name, year_began FROM gcd_series WHERE name ILIKE 'Crisis on Infinite Earths%' ORDER BY id;"

section "3. Frontend-ID reality check (id=2876)"
echo "--- Supabase:"
sb "SELECT id, name, year_began FROM gcd_series WHERE id = 2876;"
echo "--- DO:"
do_db "SELECT id, name, year_began FROM gcd_series WHERE id = 2876;"

section "4. Well-known series spot-check"
for name in "Batman" "Action Comics" "Detective Comics" "Watchmen"; do
  echo ""
  echo "--- '$name' on Supabase:"
  sb "SELECT id, name, year_began FROM gcd_series WHERE name = '$name' ORDER BY year_began;"
  echo "--- '$name' on DO:"
  do_db "SELECT id, name, year_began FROM gcd_series WHERE name = '$name' ORDER BY year_began;"
done

section "5. Cover-URL / Comic-Vine-ID delta (non-deleted issues)"
echo "--- Supabase:"
sb "SELECT COUNT(*) AS total, COUNT(cover_image_url) AS with_cover, COUNT(comic_vine_id) AS with_cv FROM gcd_issue WHERE deleted = 0;"
echo "--- DO:"
do_db "SELECT COUNT(*) AS total, COUNT(cover_image_url) AS with_cover, COUNT(comic_vine_id) AS with_cv FROM gcd_issue WHERE deleted = 0;"

section "6. Random sample: 5 Supabase issues with cover_image_url; verify same id on DO"
psql "$SUPABASE_URL" -X -t -A -F $'\t' -c "
  SELECT id, series_id, number, key_date, cover_image_url
  FROM gcd_issue
  WHERE cover_image_url IS NOT NULL
  ORDER BY random()
  LIMIT 5;
" > /tmp/parity-sample.tsv
echo "--- Supabase sample (/tmp/parity-sample.tsv):"
cat /tmp/parity-sample.tsv

ids=$(awk -F'\t' '{print $1}' /tmp/parity-sample.tsv | paste -sd, -)
if [[ -n "$ids" ]]; then
  echo ""
  echo "--- DO rows at ids ($ids):"
  do_db "SELECT id, series_id, number, key_date, cover_image_url FROM gcd_issue WHERE id IN ($ids) ORDER BY id;"
fi

section "7. Live Cloudinary asset liveness (curl -I on first sample URL)"
url=$(awk -F'\t' 'NR==1 {print $5}' /tmp/parity-sample.tsv)
if [[ -n "$url" ]]; then
  echo "URL: $url"
  curl -sI "$url" | head -1
else
  echo "(no URL in sample — skipped)"
fi

section "Diagnostic complete"
