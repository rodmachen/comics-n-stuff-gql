#!/usr/bin/env tsx
/**
 * Queries all gcd_series rows from DO, generates a deterministic slug for each,
 * detects same-(name,year) collisions and appends -id as tiebreaker, then
 * writes id,slug pairs to /tmp/slugs.csv (or the path in argv[2]).
 *
 * Usage:
 *   DATABASE_URL=$DO_DATABASE_URL npx tsx scripts/compute-slugs.ts
 *   DATABASE_URL=$DO_DATABASE_URL npx tsx scripts/compute-slugs.ts /tmp/slugs.csv
 */

import { createWriteStream } from "node:fs";
import pg from "pg";
import { seriesSlug } from "../src/lib/slug.js";

const outPath = process.argv[2] ?? "/tmp/slugs.csv";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const { rows } = await pool.query<{ id: number; name: string; year_began: number }>(
  "SELECT id, name, year_began FROM gcd_series WHERE deleted = 0 ORDER BY id"
);
await pool.end();

// First pass: generate base slugs and detect collisions
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
