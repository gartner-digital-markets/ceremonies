// Adds the third missing column I missed.

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = Object.fromEntries(
  readFileSync(".env.production.local", "utf8").split("\n")
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); let v = l.slice(i+1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1,-1); v = v.replace(/\\n$/, ""); return [l.slice(0,i).trim(), v]; })
);
const sql = neon(env.DATABASE_URL);

await sql`ALTER TABLE estimation_results ADD COLUMN IF NOT EXISTS jira_write_back_at timestamp`;

console.log("After:");
console.table(await sql`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'estimation_results' AND table_schema = 'public'
  ORDER BY ordinal_position
`);

// Reproduce the EXACT failing query
console.log("\nReproducing exact deployed query:");
try {
  const r = await sql`
    SELECT id, session_id, ticket_ref, ticket_title, final_estimate,
           participant_count, completed_at, jira_issue_key,
           jira_write_back_status, jira_write_back_at
    FROM estimation_results
    WHERE session_id = '22819c02-41ae-4c54-b6cc-d981c53b163f'
  `;
  console.log(`  ✓ Query succeeded, ${r.length} rows`);
} catch (e) {
  console.log(`  ✗ Still failing: ${e.message}`);
}
