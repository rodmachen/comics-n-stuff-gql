#!/usr/bin/env tsx
/**
 * Generates deterministic slugs for all gcd_series rows and writes id,slug
 * pairs to a CSV file. Reads series data from a local CSV (produced by the
 * caller via SSH) rather than connecting to the DB directly.
 *
 * Usage (called by apply-series-slugs.sh):
 *   npx tsx scripts/compute-slugs.ts <input-csv> <output-csv>
 *
 *   input-csv  — CSV with header: id,name,year_began  (fetched via SSH)
 *   output-csv — destination for id,slug pairs
 */

import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { seriesSlug } from "../src/lib/slug.js";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("Usage: compute-slugs.ts <input-csv> <output-csv>");
  process.exit(1);
}

interface SeriesRow { id: number; name: string; year_began: number }

async function readCsv(path: string): Promise<SeriesRow[]> {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  const rows: SeriesRow[] = [];
  let header = true;
  for await (const line of rl) {
    if (header) { header = false; continue; }
    if (!line.trim()) continue;
    // id is first, name may contain commas — split on first and last comma
    const firstComma = line.indexOf(",");
    const lastComma = line.lastIndexOf(",");
    const id = parseInt(line.slice(0, firstComma), 10);
    const name = line.slice(firstComma + 1, lastComma);
    const year_began = parseInt(line.slice(lastComma + 1), 10);
    rows.push({ id, name, year_began });
  }
  return rows;
}

const rows = await readCsv(inPath);

// First pass: detect base-slug collisions
const baseSlugs = new Map<string, number[]>();
for (const row of rows) {
  const base = seriesSlug({ name: row.name, yearBegan: row.year_began });
  const ids = baseSlugs.get(base) ?? [];
  ids.push(row.id);
  baseSlugs.set(base, ids);
}

// Second pass: assign final slugs (append -id only for collisions)
const out = createWriteStream(outPath);
out.write("id,slug\n");
for (const row of rows) {
  const base = seriesSlug({ name: row.name, yearBegan: row.year_began });
  const collisions = baseSlugs.get(base)!;
  const slug = collisions.length > 1
    ? seriesSlug({ name: row.name, yearBegan: row.year_began, id: row.id })
    : base;
  out.write(`${row.id},${slug}\n`);
}
out.end();
await new Promise((resolve, reject) => out.on("finish", resolve).on("error", reject));

console.log(`Wrote ${rows.length} slugs to ${outPath}`);
const collisionCount = [...baseSlugs.values()].filter(ids => ids.length > 1).length;
if (collisionCount > 0) {
  console.log(`${collisionCount} base-slug collision group(s) resolved with -id suffix`);
} else {
  console.log("No base-slug collisions — all slugs are unique without -id suffix");
}
