// Delete the duplicate test-namespace "Team InSanity" team safely.
// Audit references (excluding tables not yet deployed), then delete if clean.

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

const TEST_USER_ID = "user_3BEchbTg404Pv4b5k3E0vRNNnhZ";
const TEST_TEAM_ID = "8d12f601-b654-479b-8f4c-fd07d562c327";

const tablesPresent = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
`;
const present = new Set(tablesPresent.map((r) => r.table_name));
console.log("tables present:", [...present].sort());

const members = await sql`SELECT user_id, role FROM team_members WHERE team_id = ${TEST_TEAM_ID}`;
const ests = await sql`SELECT id FROM estimation_sessions WHERE team_id = ${TEST_TEAM_ID}`;
const retros = await sql`SELECT id FROM retros WHERE team_id = ${TEST_TEAM_ID}`;
const invites = present.has("team_invites")
  ? await sql`SELECT id FROM team_invites WHERE team_id = ${TEST_TEAM_ID}`
  : [];

console.log("members:", members);
console.log("estimations:", ests.length);
console.log("retros:", retros.length);
console.log("invites:", invites.length);

const safe =
  members.every((m) => m.user_id === TEST_USER_ID) &&
  ests.length === 0 &&
  retros.length === 0 &&
  invites.length === 0;

if (!safe) {
  console.log("ABORT: references outside expected scope");
  process.exit(1);
}

await sql`DELETE FROM team_members WHERE team_id = ${TEST_TEAM_ID}`;
const deleted = await sql`DELETE FROM teams WHERE id = ${TEST_TEAM_ID} RETURNING id, name`;
console.log("deleted team:", deleted);

const remainingTeams = await sql`
  SELECT id, name, created_by FROM teams WHERE name = 'Team InSanity'
`;
console.log("\nremaining 'Team InSanity' rows:", remainingTeams);
