// Read-only discovery for Shadman's orphaned ceremonies data.
// Resolves Clerk userIds for connectshadman@gmail.com in BOTH the live and test
// instances, then lists every estimation/retro row that plausibly belongs to him.
// No writes. Output is a JSON dump for review.

import { readFileSync, writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { createClerkClient } from "@clerk/backend";

const TARGET_EMAIL = "connectshadman@gmail.com";

const envFile = (path) =>
  Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const idx = l.indexOf("=");
        let v = l.slice(idx + 1).trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        v = v.replace(/\\n$/, "");
        return [l.slice(0, idx).trim(), v];
      })
  );

const prod = envFile(".env.production.local");
const local = envFile(".env.local");

const liveClerk = createClerkClient({ secretKey: prod.CLERK_SECRET_KEY });
const testClerk = local.CLERK_SECRET_KEY
  ? createClerkClient({ secretKey: local.CLERK_SECRET_KEY })
  : null;

async function lookupUsers(client, label) {
  if (!client) return [];
  try {
    const res = await client.users.getUserList({ emailAddress: [TARGET_EMAIL] });
    const list = Array.isArray(res) ? res : res.data ?? [];
    return list.map((u) => ({
      env: label,
      id: u.id,
      primaryEmail: u.emailAddresses?.[0]?.emailAddress,
      createdAt: u.createdAt,
    }));
  } catch (e) {
    return [{ env: label, error: String(e.message ?? e) }];
  }
}

const liveUsers = await lookupUsers(liveClerk, "live");
const testUsers = await lookupUsers(testClerk, "test");
const allUsers = [...liveUsers, ...testUsers];

console.log("Clerk users for", TARGET_EMAIL);
console.table(allUsers);

const userIds = allUsers.filter((u) => u.id).map((u) => u.id);

const sql = neon(prod.DATABASE_URL);

const teams = await sql`
  SELECT t.id, t.name, t.created_by, t.created_at
  FROM teams t
  WHERE t.created_by = ANY(${userIds})
  ORDER BY t.created_at DESC
`;
const teamIds = teams.map((t) => t.id);

const memberships = await sql`
  SELECT tm.team_id, tm.user_id, tm.role, t.name AS team_name
  FROM team_members tm
  JOIN teams t ON t.id = tm.team_id
  WHERE tm.user_id = ANY(${userIds})
  ORDER BY tm.joined_at DESC
`;
const memberTeamIds = [...new Set(memberships.map((m) => m.team_id))];
const allReachableTeamIds = [...new Set([...teamIds, ...memberTeamIds])];

const estByUser = await sql`
  SELECT id, room_code, team_id, created_by, participant_count, created_at, closed_at
  FROM estimation_sessions
  WHERE created_by = ANY(${userIds})
  ORDER BY created_at DESC
`;

const estByTeam = allReachableTeamIds.length
  ? await sql`
      SELECT id, room_code, team_id, created_by, participant_count, created_at, closed_at
      FROM estimation_sessions
      WHERE team_id = ANY(${allReachableTeamIds})
        AND NOT (created_by = ANY(${userIds}))
      ORDER BY created_at DESC
    `
  : [];

const estPartykit = await sql`
  SELECT id, room_code, team_id, created_by, participant_count, created_at, closed_at
  FROM estimation_sessions
  WHERE created_by LIKE 'partykit:%'
  ORDER BY created_at DESC
`;

const retrosByUser = await sql`
  SELECT id, room_code, team_id, created_by, card_count, action_count, created_at, closed_at
  FROM retros
  WHERE created_by = ANY(${userIds})
  ORDER BY created_at DESC
`;

const retrosByTeam = allReachableTeamIds.length
  ? await sql`
      SELECT id, room_code, team_id, created_by, card_count, action_count, created_at, closed_at
      FROM retros
      WHERE team_id = ANY(${allReachableTeamIds})
        AND NOT (created_by = ANY(${userIds}))
      ORDER BY created_at DESC
    `
  : [];

const retrosPartykit = await sql`
  SELECT id, room_code, team_id, created_by, card_count, action_count, created_at, closed_at
  FROM retros
  WHERE created_by LIKE 'partykit:%' OR created_by IS NULL
  ORDER BY created_at DESC
`;

const distinctCreators = await sql`
  SELECT created_by, COUNT(*)::int AS estimation_rows
  FROM estimation_sessions
  GROUP BY created_by
  ORDER BY estimation_rows DESC
`;

const distinctRetroCreators = await sql`
  SELECT created_by, COUNT(*)::int AS retro_rows
  FROM retros
  GROUP BY created_by
  ORDER BY retro_rows DESC
`;

const report = {
  target: TARGET_EMAIL,
  clerkUsers: allUsers,
  ownedTeams: teams,
  memberOfTeams: memberships,
  estimationsMatchingUserId: estByUser,
  estimationsInUserTeamsButOtherCreator: estByTeam,
  estimationsAllPartykitOrphans: estPartykit,
  retrosMatchingUserId: retrosByUser,
  retrosInUserTeamsButOtherCreator: retrosByTeam,
  retrosAllPartykitOrphans: retrosPartykit,
  globalCreatorBreakdownEstimations: distinctCreators,
  globalCreatorBreakdownRetros: distinctRetroCreators,
};

writeFileSync(
  "scripts/recovery-report.json",
  JSON.stringify(report, null, 2)
);

console.log("\nSummary");
console.log("  Clerk users found:", allUsers.length);
console.log("  Owned teams:", teams.length);
console.log("  Member of teams:", memberships.length);
console.log("  Estimations matching userId:", estByUser.length);
console.log("  Estimations in your teams (other creator):", estByTeam.length);
console.log("  Estimations with partykit:* createdBy (global):", estPartykit.length);
console.log("  Retros matching userId:", retrosByUser.length);
console.log("  Retros in your teams (other creator):", retrosByTeam.length);
console.log("  Retros with partykit:* or null createdBy (global):", retrosPartykit.length);
console.log("\nFull report written to scripts/recovery-report.json");
