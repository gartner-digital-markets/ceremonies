// Run the EXACT Drizzle query the dashboard runs, end-to-end, against prod.
// If this returns 2 rows with results, the runtime should also.

import { readFileSync } from "node:fs";
process.env.DATABASE_URL = (() => {
  const env = readFileSync(".env.production.local", "utf8");
  const m = env.match(/^DATABASE_URL="?([^"\n]+)"?/m);
  return m[1].replace(/\\n$/, "");
})();

const { drizzle } = await import("drizzle-orm/neon-http");
const { neon } = await import("@neondatabase/serverless");
const schema = await import("./../src/lib/db/schema.ts");
const { eq, desc } = await import("drizzle-orm");

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema });

const userId = "user_3BkPt0YqXMF809cQ2b0fLzKBWrg";
const teamId = "e5468d22-2270-409a-a3f2-e9bb2f907da0";

console.log("Mirroring fetchEstimations(userId, teamId):");
const sessions = await db
  .select()
  .from(schema.estimationSessions)
  .where(eq(schema.estimationSessions.teamId, teamId))
  .orderBy(desc(schema.estimationSessions.createdAt))
  .limit(20);

console.log(`  outer: ${sessions.length} sessions`);

const result = await Promise.all(
  sessions.map(async (session) => {
    const results = await db
      .select()
      .from(schema.estimationResults)
      .where(eq(schema.estimationResults.sessionId, session.id));
    return { roomCode: session.roomCode, ticketCount: results.length, sample: results[0] };
  })
);
console.table(result);
console.log("\nIf this prints 2 rows with ticketCount > 0, the runtime should too.");
