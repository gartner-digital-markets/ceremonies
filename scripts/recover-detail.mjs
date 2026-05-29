// Read-only: pull full estimation_results for the 2 orphaned sessions
// and double-check there are no retros anywhere.

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = Object.fromEntries(
  readFileSync(".env.production.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      let v = l.slice(i + 1).trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      v = v.replace(/\\n$/, "");
      return [l.slice(0, i).trim(), v];
    })
);
const sql = neon(env.DATABASE_URL);

const sessionIds = [
  "22819c02-41ae-4c54-b6cc-d981c53b163f",
  "b8dfb131-0e83-43f9-b140-f5c4d70a682a",
];

for (const id of sessionIds) {
  const session = await sql`
    SELECT id, room_code, participant_count, created_at, closed_at
    FROM estimation_sessions WHERE id = ${id}
  `;
  const results = await sql`
    SELECT ticket_ref, ticket_title, final_estimate, participant_count, completed_at
    FROM estimation_results
    WHERE session_id = ${id}
    ORDER BY completed_at ASC
  `;
  console.log(`\nSession ${session[0].room_code} (${id})`);
  console.log("  closed:", session[0].closed_at);
  console.log("  participants:", session[0].participant_count);
  console.log("  tickets:", results.length);
  console.table(results);
}

const retroCount = await sql`SELECT COUNT(*)::int AS n FROM retros`;
const retroCardCount = await sql`SELECT COUNT(*)::int AS n FROM retro_cards`;
const actionItemCount = await sql`SELECT COUNT(*)::int AS n FROM action_items`;
console.log("\nRetro tables global counts:");
console.log("  retros:", retroCount[0].n);
console.log("  retro_cards:", retroCardCount[0].n);
console.log("  action_items:", actionItemCount[0].n);
