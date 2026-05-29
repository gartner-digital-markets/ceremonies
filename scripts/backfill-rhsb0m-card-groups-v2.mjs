// v2: groups carry cardIds, not the other way. Build inverse map.

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
const dbCards = await sql`SELECT id, text, category, anonymous_id FROM retro_cards WHERE retro_id = ${retro.id}`;

// Inverse map from cardId → group label (using state)
const cardIdToGroupLabel = new Map();
for (const g of state.groups) {
  for (const cardId of g.cardIds || []) {
    cardIdToGroupLabel.set(cardId, g.label);
  }
}

// stateCardId → state card text (so we can match to dbCard by text+category+anonId)
const stateCards = new Map(state.cards.map((c) => [c.id, c]));
const groupLabelToDbId = new Map(dbGroups.map((g) => [g.label, g.id]));

let updates = 0;
let unmatched = 0;

for (const stateCard of state.cards) {
  const groupLabel = cardIdToGroupLabel.get(stateCard.id);
  if (!groupLabel) {
    console.log(`  ungrouped (no group has cardId ${stateCard.id}): "${stateCard.text}"`);
    continue;
  }
  const dbGroupId = groupLabelToDbId.get(groupLabel);
  if (!dbGroupId) {
    console.log(`  UNMATCHED group label "${groupLabel}" for card "${stateCard.text}"`);
    unmatched++;
    continue;
  }
  const matches = dbCards.filter(
    (c) => c.text === stateCard.text && c.category === stateCard.category && c.anonymous_id === stateCard.anonymousId
  );
  if (matches.length !== 1) {
    console.log(`  AMBIGUOUS card "${stateCard.text}" (${matches.length} matches)`);
    unmatched++;
    continue;
  }
  await sql`UPDATE retro_cards SET group_id = ${dbGroupId} WHERE id = ${matches[0].id}`;
  console.log(`  ✓ "${stateCard.text}" → ${groupLabel}`);
  updates++;
}

const after = await sql`SELECT COUNT(*)::int AS n FROM retro_cards WHERE retro_id = ${retro.id} AND group_id IS NOT NULL`;
console.log(`\nSummary: ${updates} updated, ${unmatched} unmatched.`);
console.log(`After: ${after[0].n}/${dbCards.length} cards now have group_id.`);
