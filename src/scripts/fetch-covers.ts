import "dotenv/config";
import { prisma } from "../lib/prisma.js";
import { v2 as cloudinary } from "cloudinary";

// ─── Configuration ───────────────────────────────────────────────────────────

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const COMIC_VINE_API_KEY = process.env.COMIC_VINE_API_KEY;
if (!COMIC_VINE_API_KEY) {
  console.error("COMIC_VINE_API_KEY is not set");
  process.exit(1);
}

const COMIC_VINE_BASE = "https://comicvine.gamespot.com/api";
const CV_DELAY_MS = 20000; // ~180 requests/hour, stays under 200 limit
const RATE_LIMIT_WAIT_MS = 65 * 60 * 1000; // 65 minutes

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cvFetch(url: string, retried = false): Promise<any> {
  const res = await fetch(url);

  if (res.status === 420) {
    if (retried) throw new Error("Rate limited twice in a row");
    const resetMsg = await res.text();
    console.log(`  Rate limited — waiting 65 min... (${resetMsg})`);
    await sleep(RATE_LIMIT_WAIT_MS);
    return cvFetch(url, true);
  }

  if (!res.ok) {
    throw new Error(`Comic Vine API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\s+comic\s*book$/i, "")
    .trim();
}

// ─── Comic Vine API ──────────────────────────────────────────────────────────

interface ComicVineIssue {
  id: number;
  issue_number: string;
  volume: { id: number; name: string };
  cover_date: string | null;
  image: { original_url: string; super_url: string };
}

/** Find volume IDs matching a series name */
async function getVolumeIds(seriesName: string): Promise<number[]> {
  const normalized = normalizeName(seriesName);

  // Try exact name first, then variants
  const searchNames = new Set([seriesName]);
  searchNames.add(seriesName.replace(/^The\s+/i, ""));
  searchNames.add(seriesName.replace(/\s+Comic\s*Book$/i, ""));

  for (const query of searchNames) {
    const url = new URL(`${COMIC_VINE_BASE}/volumes/`);
    url.searchParams.set("api_key", COMIC_VINE_API_KEY!);
    url.searchParams.set("format", "json");
    url.searchParams.set("filter", `name:${query}`);
    url.searchParams.set("field_list", "id,name");
    url.searchParams.set("limit", "100");

    const data = await cvFetch(url.toString());
    const results: { id: number; name: string }[] = data.results ?? [];

    // Exact or normalized match
    const ids = results
      .filter(
        (v) =>
          v.name.toLowerCase() === query.toLowerCase() ||
          normalizeName(v.name) === normalized
      )
      .map((v) => v.id);

    if (ids.length > 0) return ids;

    await sleep(CV_DELAY_MS);
  }

  return [];
}

/** Fetch ALL issues for a volume (paginated) */
async function fetchAllVolumeIssues(
  volumeId: number
): Promise<ComicVineIssue[]> {
  const all: ComicVineIssue[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const url = new URL(`${COMIC_VINE_BASE}/issues/`);
    url.searchParams.set("api_key", COMIC_VINE_API_KEY!);
    url.searchParams.set("format", "json");
    url.searchParams.set("filter", `volume:${volumeId}`);
    url.searchParams.set("field_list", "id,issue_number,volume,cover_date,image");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    const data = await cvFetch(url.toString());
    const results: ComicVineIssue[] = data.results ?? [];
    all.push(...results);

    if (results.length < limit || all.length >= data.number_of_total_results) {
      break;
    }

    offset += limit;
    await sleep(CV_DELAY_MS);
  }

  return all;
}

// ─── Main ────────────────────────────────────────────────────────────────────

interface DbIssue {
  id: number;
  number: string;
  keyDate: string;
  series: { id: number; name: string };
}

async function main() {
  const issues = await prisma.issue.findMany({
    where: {
      deleted: 0,
      variantOfId: null,
      coverImageUrl: null,
    },
    include: { series: true },
  });

  const total = issues.length;
  console.log(`Found ${total} issues needing covers`);

  // Group by series for batch processing
  const bySeries = new Map<number, DbIssue[]>();
  for (const issue of issues) {
    const group = bySeries.get(issue.seriesId) ?? [];
    group.push(issue as DbIssue);
    bySeries.set(issue.seriesId, group);
  }

  console.log(`Grouped into ${bySeries.size} series\n`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;
  let seriesIdx = 0;

  for (const [seriesId, seriesIssues] of bySeries) {
    seriesIdx++;
    const seriesName = seriesIssues[0].series.name;
    console.log(`\n--- [Series ${seriesIdx}/${bySeries.size}] ${seriesName} (${seriesIssues.length} issues) ---`);

    try {
      // Step 1: Find volume IDs (1 API call, cached by name normalization)
      const volumeIds = await getVolumeIds(seriesName);

      if (volumeIds.length === 0) {
        console.log(`  No volume found on Comic Vine, skipping series`);
        skipped += seriesIssues.length;
        processed += seriesIssues.length;
        continue;
      }

      // Step 2: Fetch ALL issues for matching volumes (few paginated calls)
      const cvIssues: ComicVineIssue[] = [];
      for (const volumeId of volumeIds) {
        const volumeIssues = await fetchAllVolumeIssues(volumeId);
        cvIssues.push(...volumeIssues);
        await sleep(CV_DELAY_MS);
      }

      console.log(`  Found ${cvIssues.length} issues on Comic Vine across ${volumeIds.length} volume(s)`);

      // Build lookup: issue_number -> ComicVineIssue[]
      const cvLookup = new Map<string, ComicVineIssue[]>();
      for (const cv of cvIssues) {
        const group = cvLookup.get(cv.issue_number) ?? [];
        group.push(cv);
        cvLookup.set(cv.issue_number, group);
      }

      // Step 3: Match and upload each issue (no more CV API calls!)
      for (const issue of seriesIssues) {
        processed++;
        const label = `  [${processed}/${total}] ${seriesName} #${issue.number}`;
        const candidates = cvLookup.get(issue.number);

        if (!candidates || candidates.length === 0) {
          console.log(`${label} -> no match, skipping`);
          skipped++;
          continue;
        }

        // Pick best match by cover_date proximity to keyDate
        let match = candidates[0];
        if (candidates.length > 1 && issue.keyDate) {
          candidates.sort((a, b) => {
            const diffA = a.cover_date
              ? Math.abs(Date.parse(a.cover_date) - Date.parse(issue.keyDate))
              : Infinity;
            const diffB = b.cover_date
              ? Math.abs(Date.parse(b.cover_date) - Date.parse(issue.keyDate))
              : Infinity;
            return diffA - diffB;
          });
          match = candidates[0];
        }

        try {
          const imageUrl = match.image.original_url || match.image.super_url;

          const uploadResult = await cloudinary.uploader.upload(imageUrl, {
            folder: "comics-n-stuff",
            public_id: `issue-${issue.id}`,
          });

          await prisma.issue.update({
            where: { id: issue.id },
            data: {
              coverImageUrl: uploadResult.secure_url,
              comicVineId: match.id,
            },
          });

          console.log(`${label} -> uploaded`);
          uploaded++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : JSON.stringify(err);
          console.error(`${label} -> ERROR: ${msg}`);
          failed++;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      console.error(`  Series ERROR: ${msg}`);
      failed += seriesIssues.length;
      processed += seriesIssues.length;
    }
  }

  console.log(`\nDone! Total: ${total}, Uploaded: ${uploaded}, Skipped: ${skipped}, Failed: ${failed}`);
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
