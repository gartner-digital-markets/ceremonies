// Manually save the rhsb0m retro by POSTing to the deployed /api/retros/save
// endpoint with the X-Internal-Secret header. Bypasses PartyKit entirely.
// Uses the parachute JSON we captured before any save attempt.

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.production.local", "utf8").split("\n")
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); let v = l.slice(i+1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1,-1); v = v.replace(/\\n$/, ""); return [l.slice(0,i).trim(), v]; })
);

const state = JSON.parse(readFileSync("scripts/parachutes/rhsb0m-retro-state.json", "utf8"));

const body = {
  roomCode: "rhsb0m",
  teamId: state.teamId ?? "",
  createdBy: state.createdBy,
  state,
};

console.log("Posting to /api/retros/save:");
console.log("  roomCode:", body.roomCode);
console.log("  teamId:", body.teamId || "(null)");
console.log("  createdBy:", body.createdBy);
console.log("  cards:", state.cards.length);
console.log("  groups:", state.groups.length);
console.log("  actionItems:", state.actionItems.length);

const res = await fetch("https://ceremonies.dev/api/retros/save", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Internal-Secret": env.INTERNAL_API_SECRET,
  },
  body: JSON.stringify(body),
});

const text = await res.text();
console.log(`\nStatus: ${res.status}`);
console.log(`Body: ${text}`);

if (!res.ok) {
  console.error("\n❌ Save failed. Will need to hand-INSERT from JSON.");
  process.exit(1);
}

console.log("\n✓ Save endpoint accepted. Verifying DB rows landed...");

const { neon } = await import("@neondatabase/serverless");
const sql = neon(env.DATABASE_URL);

const retro = await sql`SELECT id, room_code, status, created_by, card_count, group_count, action_count FROM retros WHERE room_code = 'rhsb0m'`;
console.log("\nretros row:");
console.table(retro);

if (retro.length === 0) {
  console.error("❌ retros row not found despite 200 OK. Investigate.");
  process.exit(1);
}

const cards = await sql`SELECT count(*)::int AS n FROM retro_cards WHERE retro_id = ${retro[0].id}`;
const groups = await sql`SELECT count(*)::int AS n FROM retro_groups WHERE retro_id = ${retro[0].id}`;
const actions = await sql`SELECT count(*)::int AS n FROM action_items WHERE retro_id = ${retro[0].id}`;

console.log(`\nrelated rows landed:`);
console.log(`  retro_cards: ${cards[0].n} (expected ${state.cards.length})`);
console.log(`  retro_groups: ${groups[0].n} (expected ${state.groups.length})`);
console.log(`  action_items: ${actions[0].n} (expected ${state.actionItems.length})`);

const ok = cards[0].n === state.cards.length && groups[0].n === state.groups.length && actions[0].n === state.actionItems.length;
console.log(ok ? "\n✓ ALL ROWS MATCH. Retro saved end-to-end." : "\n⚠ Mismatch — investigate.");
