// Backfill retro_cards.group_id for rhsb0m using the parachute JSON.
// Match each card by (text, category, anonymous_id) → state.cards entry → state group → DB group label.

import { readFileSync } from "node:fs";
process.env.DATABASE_URL = (() => {
  const env = readFileSync(".env.production.local", "utf8");
  return env.match(/^DATABASE_URL="?([^"\n]+)/m)[1].replace(/\\n$/, "");
})();

const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);

const state = JSON.parse(readFileSync("scripts/parachutes/rhsb0m-retro-state.json", "utf8"));

const [retro] = await sql`SELECT id FROM retros WHERE room_code = 'rhsb0m'`;
const dbGroups = await sql`SELECT id, label FROM retro_groups WHERE retro_id = ${retro.id}`;
const dbCards = await sql`SELECT id, text, category, anonymous_id, group_id FROM retro_cards WHERE retro_id = ${retro.id}`;

const groupLabelToDbId = new Map(dbGroups.map((g) => [g.label, g.id]));
const stateGroupIdToLabel = new Map(state.groups.map((g) => [g.id, g.label]));

console.log(`retro: ${retro.id}`);
console.log(`db groups: ${dbGroups.length}`);
console.log(`db cards: ${dbCards.length}`);
console.log(`cards currently with NULL group_id: ${dbCards.filter((c) => c.group_id === null).length}`);
console.log("");

let updates = 0;
let skipped = 0;
let unmatched = 0;

for (const stateCard of state.cards) {
  const groupLabel = stateGroupIdToLabel.get(stateCard.groupId);
  if (!groupLabel) {
    console.log(`  SKIP card "${stateCard.text}" (state group ${stateCard.groupId} not found)`);
    skipped++;
    continue;
  }
  const dbGroupId = groupLabelToDbId.get(groupLabel);
  if (!dbGroupId) {
    console.log(`  UNMATCHED card "${stateCard.text}" (DB has no group with label "${groupLabel}")`);
    unmatched++;
    continue;
  }
  const matchingDbCards = dbCards.filter(
    (c) => c.text === stateCard.text && c.category === stateCard.category && c.anonymous_id === stateCard.anonymousId
  );
  if (matchingDbCards.length !== 1) {
    console.log(`  AMBIGUOUS card "${stateCard.text}" (matched ${matchingDbCards.length} DB rows)`);
    unmatched++;
    continue;
  }
  await sql`UPDATE retro_cards SET group_id = ${dbGroupId} WHERE id = ${matchingDbCards[0].id}`;
  console.log(`  ✓ "${stateCard.text}" → ${groupLabel}`);
  updates++;
}

console.log("");
console.log(`Summary: ${updates} updated, ${skipped} skipped (no state group), ${unmatched} unmatched`);

const after = await sql`SELECT COUNT(*)::int AS n FROM retro_cards WHERE retro_id = ${retro.id} AND group_id IS NOT NULL`;
console.log(`After: ${after[0].n}/${dbCards.length} cards have group_id set.`);
