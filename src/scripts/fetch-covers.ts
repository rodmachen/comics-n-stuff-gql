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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\s+comic\s*book$/i, "")
    .replace(/\s*\[.*?\]\s*/g, " ")
    .replace(/\s+'?\d{2,4}$/, "")
    .replace(/[/:,]\s*/g, " ")
    .replace(/\s+/g, " ")
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

/** Find volume IDs matching a series name and start year.
 *  Returns { preferred, all } — preferred are year-matched, all includes every name match. */
async function getVolumeIds(
  seriesName: string,
  yearBegan: number
): Promise<{ preferred: number[]; all: number[] }> {
  const normalized = normalizeName(seriesName);

  // Try exact name first, then variants
  const searchNames = new Set([seriesName]);
  searchNames.add(seriesName.replace(/^The\s+/i, ""));
  searchNames.add(seriesName.replace(/\s+Comic\s*Book$/i, ""));
  // Try swapping separators: "/" -> ":" and "," and vice versa
  if (/\s*\/\s*/.test(seriesName)) {
    searchNames.add(seriesName.replace(/\s*\/\s*/, ": "));
    searchNames.add(seriesName.replace(/\s*\/\s*/, ", "));
  }
  if (/:\s*/.test(seriesName)) searchNames.add(seriesName.replace(/:\s*/, " / "));
  // Strip diacritics (e.g., Rōnin -> Ronin)
  const ascii = seriesName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (ascii !== seriesName) searchNames.add(ascii);
  // Strip bracketed suffixes: "Legionnaires Three [Legionnaires 3]" -> "Legionnaires Three"
  const noBrackets = seriesName.replace(/\s*\[.*?\]\s*$/, "").trim();
  if (noBrackets !== seriesName) searchNames.add(noBrackets);
  // Strip year suffixes: "L.E.G.I.O.N. '89" -> "L.E.G.I.O.N."
  const noYear = seriesName.replace(/\s+'?\d{2,4}$/, "").trim();
  if (noYear !== seriesName) searchNames.add(noYear);
  // Known name mappings (GCD -> Comic Vine)
  const nameMap: Record<string, string[]> = {
    "firestorm the nuclear man": ["Firestorm the Nuclear Man", "The Fury of Firestorm"],
    "swamp thing": ["The Saga of the Swamp Thing", "Swamp Thing"],
    "who's who update '88": ["Update '88"],
    "legionnaires three [legionnaires 3]": ["Legionnaires 3"],
    "science fiction graphic novel": ["DC Science Fiction Graphic Novels"],
  };
  const mapped = nameMap[seriesName.toLowerCase()];
  if (mapped) mapped.forEach((n) => searchNames.add(n));

  for (const query of searchNames) {
    const url = new URL(`${COMIC_VINE_BASE}/volumes/`);
    url.searchParams.set("api_key", COMIC_VINE_API_KEY!);
    url.searchParams.set("format", "json");
    url.searchParams.set("filter", `name:${query}`);
    url.searchParams.set("field_list", "id,name,start_year");
    url.searchParams.set("limit", "100");

    const data = await cvFetch(url.toString());
    const results: { id: number; name: string; start_year: string | null }[] =
      data.results ?? [];

    // Filter by name match (exact or normalized)
    const nameMatches = results.filter(
      (v) =>
        v.name.toLowerCase() === query.toLowerCase() ||
        normalizeName(v.name) === normalized
    );

    if (nameMatches.length === 0) {
      await sleep(CV_DELAY_MS);
      continue;
    }

    // Prefer volumes whose start_year matches yearBegan (±2 years)
    const yearMatches = nameMatches.filter(
      (v) => v.start_year && Math.abs(parseInt(v.start_year) - yearBegan) <= 2
    );

    const preferred = yearMatches.length > 0 ? yearMatches.map((v) => v.id) : nameMatches.map((v) => v.id);
    const all = nameMatches.map((v) => v.id);

    return { preferred, all };
  }

  return { preferred: [], all: [] };
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

async function fetchIssuesForVolumes(volumeIds: number[]): Promise<ComicVineIssue[]> {
  const issues: ComicVineIssue[] = [];
  for (const volumeId of volumeIds) {
    const volumeIssues = await fetchAllVolumeIssues(volumeId);
    issues.push(...volumeIssues);
    await sleep(CV_DELAY_MS);
  }
  return issues;
}

function buildLookup(cvIssues: ComicVineIssue[]): Map<string, ComicVineIssue[]> {
  const lookup = new Map<string, ComicVineIssue[]>();
  for (const cv of cvIssues) {
    const group = lookup.get(cv.issue_number) ?? [];
    group.push(cv);
    lookup.set(cv.issue_number, group);
  }
  return lookup;
}

// ─── Main ────────────────────────────────────────────────────────────────────

interface DbIssue {
  id: number;
  number: string;
  keyDate: string;
  series: { id: number; name: string; yearBegan: number };
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
  const skippedList: string[] = [];
  const failedList: string[] = [];

  for (const [seriesId, seriesIssues] of bySeries) {
    seriesIdx++;
    const seriesName = seriesIssues[0].series.name;
    console.log(`\n--- [Series ${seriesIdx}/${bySeries.size}] ${seriesName} (${seriesIssues.length} issues) ---`);

    try {
      // Step 1: Find volume IDs (1 API call, cached by name normalization)
      const { preferred, all } = await getVolumeIds(seriesName, seriesIssues[0].series.yearBegan);

      if (all.length === 0) {
        console.log(`  No volume found on Comic Vine, skipping series`);
        for (const si of seriesIssues) skippedList.push(`${seriesName} #${si.number}`);
        skipped += seriesIssues.length;
        processed += seriesIssues.length;
        continue;
      }

      // Step 2: Fetch issues — try preferred (year-matched) volumes first
      const cvIssues = await fetchIssuesForVolumes(preferred);

      console.log(`  Found ${cvIssues.length} issues on Comic Vine across ${preferred.length} volume(s)`);

      // Build lookup: issue_number -> ComicVineIssue[]
      let cvLookup = buildLookup(cvIssues);

      // If no issue numbers match, try ALL name-matched volumes
      const hasAnyMatch = seriesIssues.some((i) => cvLookup.has(i.number));
      const remainingVolumeIds = all.filter((id) => !preferred.includes(id));

      if (!hasAnyMatch && remainingVolumeIds.length > 0) {
        console.log(`  No matches, trying ${remainingVolumeIds.length} other volume(s)...`);
        const fallbackIssues = await fetchIssuesForVolumes(remainingVolumeIds);
        cvIssues.push(...fallbackIssues);
        cvLookup = buildLookup(cvIssues);
        console.log(`  Now ${cvIssues.length} total issues`);
      }

      // Step 3: Match and upload each issue (no more CV API calls!)
      for (const issue of seriesIssues) {
        processed++;
        const label = `  [${processed}/${total}] ${seriesName} #${issue.number}`;
        let candidates = cvLookup.get(issue.number);

        // Handle non-standard issue numbers
        if (!candidates || candidates.length === 0) {
          const num = issue.number;
          if (num === "[nn]" || num.startsWith("[")) {
            // Unnumbered: try "1", or use sole issue if only one exists
            if (cvIssues.length === 1) {
              candidates = [cvIssues[0]];
            } else {
              candidates = cvLookup.get("1") ?? undefined;
            }
          } else if (/^[A-Z]+\s+\d+$/i.test(num)) {
            // Strip alpha prefix: "SF 1" -> "1"
            const stripped = num.replace(/^[A-Z]+\s+/i, "");
            candidates = cvLookup.get(stripped) ?? undefined;
          }
        }

        if (!candidates || candidates.length === 0) {
          console.log(`${label} -> no match, skipping`);
          skippedList.push(`${seriesName} #${issue.number}`);
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
          let uploadResult;
          try {
            uploadResult = await cloudinary.uploader.upload(match.image.original_url, {
              folder: "comics-n-stuff",
              public_id: `issue-${issue.id}`,
              transformation: { width: 2048, crop: "limit" },
            });
          } catch {
            const fallbackUrl = match.image.original_url.replace("/original/", "/scale_large/");
            console.log(`${label} -> original too large, trying scale_large`);
            uploadResult = await cloudinary.uploader.upload(fallbackUrl, {
              folder: "comics-n-stuff",
              public_id: `issue-${issue.id}`,
              transformation: { width: 2048, crop: "limit" },
            });
          }

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
          failedList.push(`${seriesName} #${issue.number}: ${msg}`);
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

  if (skippedList.length > 0) {
    console.log(`\n--- Skipped (${skippedList.length}) ---`);
    for (const s of skippedList) console.log(`  ${s}`);
  }

  if (failedList.length > 0) {
    console.log(`\n--- Failed (${failedList.length}) ---`);
    for (const f of failedList) console.log(`  ${f}`);
  }
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
