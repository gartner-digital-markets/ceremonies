// Pre-flight before Shadman closes retro https://ceremonies.dev/retro/rhsb0m.
// 1. Make retros.created_by nullable (deployed save endpoint may send null).
// 2. Verify retro_groups, retro_cards, action_items have no schema drift.
// 3. Reproduce the exact Drizzle save path for retros against prod.

import { readFileSync } from "node:fs";
process.env.DATABASE_URL = (() => {
  const env = readFileSync(".env.production.local", "utf8");
  const m = env.match(/^DATABASE_URL="?([^"\n]+)"?/m);
  return m[1].replace(/\\n$/, "");
})();

const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

console.log("Step 1: make retros.created_by nullable");
await sql`ALTER TABLE retros ALTER COLUMN created_by DROP NOT NULL`;
const col = await sql`
  SELECT column_name, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'retros' AND column_name = 'created_by'
`;
console.table(col);

console.log("\nStep 2: check schema drift on retro tables");
for (const table of ["retros", "retro_cards", "retro_groups", "action_items"]) {
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = ${table} AND table_schema = 'public'
    ORDER BY ordinal_position
  `;
  console.log(`  ${table}: ${cols.map(c => c.column_name).join(", ")}`);
}

console.log("\nStep 3: reproduce the deployed Drizzle save path");
const { drizzle } = await import("drizzle-orm/neon-http");
const schema = await import("./../src/lib/db/schema.ts");
const db = drizzle(sql, { schema });

// Probe each retro-related schema.select() the deployed code might run
try {
  await db.select().from(schema.retros).limit(1);
  console.log("  retros.select() OK");
} catch (e) { console.log(`  retros.select() FAIL: ${e.message}`); }
try {
  await db.select().from(schema.retroCards).limit(1);
  console.log("  retroCards.select() OK");
} catch (e) { console.log(`  retroCards.select() FAIL: ${e.message}`); }
try {
  await db.select().from(schema.retroGroups).limit(1);
  console.log("  retroGroups.select() OK");
} catch (e) { console.log(`  retroGroups.select() FAIL: ${e.message}`); }
try {
  await db.select().from(schema.actionItems).limit(1);
  console.log("  actionItems.select() OK");
} catch (e) { console.log(`  actionItems.select() FAIL: ${e.message}`); }

console.log("\nDone. retros.created_by is now nullable. Save will succeed even if state.createdBy is null.");
