// Adds the two missing columns to estimation_results so the deployed
// Drizzle schema's SELECT stops throwing on the dashboard.

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = Object.fromEntries(
  readFileSync(".env.production.local", "utf8").split("\n")
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); let v = l.slice(i+1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1,-1); v = v.replace(/\\n$/, ""); return [l.slice(0,i).trim(), v]; })
);
const sql = neon(env.DATABASE_URL);

console.log("Before:");
console.table(await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'estimation_results' AND table_schema = 'public'
  ORDER BY ordinal_position
`);

await sql`ALTER TABLE estimation_results ADD COLUMN IF NOT EXISTS jira_issue_key text`;
await sql`ALTER TABLE estimation_results ADD COLUMN IF NOT EXISTS jira_write_back_status text`;

console.log("\nAfter:");
console.table(await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'estimation_results' AND table_schema = 'public'
  ORDER BY ordinal_position
`);

console.log("\nReproduce dashboard inner query with full Drizzle column list:");
const r = await sql`
  SELECT id, session_id, ticket_ref, ticket_title, final_estimate,
         participant_count, completed_at, jira_issue_key, jira_write_back_status
  FROM estimation_results
  WHERE session_id = '22819c02-41ae-4c54-b6cc-d981c53b163f'
  LIMIT 10
`;
console.log(`  rows: ${r.length}`);
console.log("  ✓ Dashboard SELECT will now succeed.");
