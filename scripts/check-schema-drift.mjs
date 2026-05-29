// Compare DB columns against what Drizzle schema expects.

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = Object.fromEntries(
  readFileSync(".env.production.local", "utf8").split("\n")
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); let v = l.slice(i+1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1,-1); v = v.replace(/\\n$/, ""); return [l.slice(0,i).trim(), v]; })
);
const sql = neon(env.DATABASE_URL);

const tables = ["estimation_sessions", "estimation_results", "retros", "retro_cards", "action_items", "teams", "team_members", "team_invites"];

for (const t of tables) {
  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = ${t} AND table_schema = 'public'
    ORDER BY ordinal_position
  `;
  console.log(`\n=== ${t} (${cols.length} cols) ===`);
  console.table(cols);
}

// Try the EXACT query the deployed dashboard runs against estimation_results
console.log("\n=== reproduce dashboard inner query (select * from estimation_results for one session) ===");
try {
  const r = await sql`SELECT * FROM estimation_results WHERE session_id = '22819c02-41ae-4c54-b6cc-d981c53b163f' LIMIT 1`;
  console.log("rows:", r.length);
  console.log("first row keys:", r.length ? Object.keys(r[0]) : "(none)");
} catch (e) {
  console.log("ERROR:", e.message);
}
