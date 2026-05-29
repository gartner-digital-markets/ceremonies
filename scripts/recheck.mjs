import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = Object.fromEntries(
  readFileSync("/Users/connectshadman/Documents/VibeCoding/_opensource/ceremonies/.env.production.local", "utf8")
    .split("\n").filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); let v = l.slice(i+1).trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1,-1); v = v.replace(/\\n$/, ""); return [l.slice(0,i).trim(), v]; })
);
const sql = neon(env.DATABASE_URL);

const userId = "user_3BkPt0YqXMF809cQ2b0fLzKBWrg";
console.log("=== teams membership for live userId ===");
console.table(await sql`
  SELECT tm.team_id, tm.role, t.name FROM team_members tm
  JOIN teams t ON t.id = tm.team_id WHERE tm.user_id = ${userId}
`);
console.log("\n=== estimations matching dashboard query (by createdBy) ===");
console.table(await sql`SELECT id, room_code, team_id, created_by FROM estimation_sessions WHERE created_by = ${userId}`);
console.log("\n=== estimations matching dashboard query (by teamId of live Team InSanity) ===");
console.table(await sql`SELECT id, room_code, team_id, created_by FROM estimation_sessions WHERE team_id = 'e5468d22-2270-409a-a3f2-e9bb2f907da0'`);
console.log("\n=== ALL teams named 'Team InSanity' ===");
console.table(await sql`SELECT id, name, created_by FROM teams WHERE name ILIKE '%insanity%'`);
