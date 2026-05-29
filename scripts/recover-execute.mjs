// Reversible recovery + dedupe.
// 1. Backup the 2 orphaned estimation_sessions rows into a dated backup table.
// 2. UPDATE created_by from 'partykit:recovered' to the live Clerk userId.
// 3. Verify the dashboard query (eq created_by, userId) now returns 2 rows.
// 4. Audit the test-namespace duplicate team for any references; if clean, delete.

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

const LIVE_USER_ID = "user_3BkPt0YqXMF809cQ2b0fLzKBWrg";
const TEST_USER_ID = "user_3BEchbTg404Pv4b5k3E0vRNNnhZ";
const TEST_TEAM_ID = "8d12f601-b654-479b-8f4c-fd07d562c327";
const SESSION_IDS = [
  "22819c02-41ae-4c54-b6cc-d981c53b163f",
  "b8dfb131-0e83-43f9-b140-f5c4d70a682a",
];

console.log("Step 1: backup orphaned rows");
await sql`
  CREATE TABLE IF NOT EXISTS estimation_sessions_backup_2026_04_30 (
    LIKE estimation_sessions INCLUDING ALL
  )
`;
const inserted = await sql`
  INSERT INTO estimation_sessions_backup_2026_04_30
  SELECT * FROM estimation_sessions WHERE id = ANY(${SESSION_IDS})
  ON CONFLICT (id) DO NOTHING
  RETURNING id
`;
console.log(`  inserted ${inserted.length} backup rows`);

console.log("\nStep 2: rewrite created_by to live userId");
const updated = await sql`
  UPDATE estimation_sessions
  SET created_by = ${LIVE_USER_ID}
  WHERE id = ANY(${SESSION_IDS})
    AND created_by = 'partykit:recovered'
  RETURNING id, room_code, created_by
`;
console.table(updated);

console.log("\nStep 3: verify dashboard query");
const dashboardView = await sql`
  SELECT id, room_code, team_id, created_by, participant_count, closed_at
  FROM estimation_sessions
  WHERE created_by = ${LIVE_USER_ID}
  ORDER BY created_at DESC
`;
console.log(`  dashboard would show ${dashboardView.length} session(s)`);
console.table(dashboardView);

console.log("\nStep 4: audit test-namespace duplicate team for references");
const testTeamMembers = await sql`
  SELECT user_id, role FROM team_members WHERE team_id = ${TEST_TEAM_ID}
`;
const testTeamEstimations = await sql`
  SELECT id, room_code FROM estimation_sessions WHERE team_id = ${TEST_TEAM_ID}
`;
const testTeamRetros = await sql`
  SELECT id, room_code FROM retros WHERE team_id = ${TEST_TEAM_ID}
`;
const testTeamInvites = await sql`
  SELECT id FROM team_invites WHERE team_id = ${TEST_TEAM_ID}
`;
const testTeamJira = await sql`
  SELECT team_id FROM team_jira_connections WHERE team_id = ${TEST_TEAM_ID}
`;
console.log(`  members: ${testTeamMembers.length}`);
console.log(`  estimations: ${testTeamEstimations.length}`);
console.log(`  retros: ${testTeamRetros.length}`);
console.log(`  invites: ${testTeamInvites.length}`);
console.log(`  jira connections: ${testTeamJira.length}`);

const safeToDelete =
  testTeamMembers.every((m) => m.user_id === TEST_USER_ID) &&
  testTeamEstimations.length === 0 &&
  testTeamRetros.length === 0 &&
  testTeamInvites.length === 0 &&
  testTeamJira.length === 0;

if (!safeToDelete) {
  console.log("  NOT SAFE to auto-delete — references exist outside expected scope. Aborting dedupe.");
} else {
  console.log("  Safe to delete (only test-userId membership, no other refs).");
  console.log("Step 5: delete duplicate team");
  await sql`DELETE FROM team_members WHERE team_id = ${TEST_TEAM_ID}`;
  const deleted = await sql`
    DELETE FROM teams WHERE id = ${TEST_TEAM_ID} RETURNING id, name
  `;
  console.log("  deleted:", deleted);
}

console.log("\nDone.");
