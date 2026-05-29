// Final dedupe: inspect the lone invite, then cascade-delete the team.

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

const TEST_TEAM_ID = "8d12f601-b654-479b-8f4c-fd07d562c327";

const invite = await sql`
  SELECT * FROM team_invites WHERE team_id = ${TEST_TEAM_ID}
`;
console.log("invite tied to duplicate team:", invite);

await sql`DELETE FROM team_members WHERE team_id = ${TEST_TEAM_ID}`;
await sql`DELETE FROM team_invites WHERE team_id = ${TEST_TEAM_ID}`;
const deleted = await sql`
  DELETE FROM teams WHERE id = ${TEST_TEAM_ID} RETURNING id, name
`;
console.log("deleted team:", deleted);

const remaining = await sql`
  SELECT id, name, created_by FROM teams WHERE name = 'Team InSanity'
`;
console.log("remaining 'Team InSanity':", remaining);
