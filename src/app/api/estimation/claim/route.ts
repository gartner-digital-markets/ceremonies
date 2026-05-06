import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/lib/db";
import { estimationSessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * PATCH /api/estimation/claim
 *
 * Transfers an anonymous estimation session (saved by PartyKit with a
 * "partykit:" createdBy prefix) to the authenticated user's account.
 * Security: knowing the room code is treated as proof of participation.
 */
export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to claim sessions" }, { status: 401 });
  }

  const body = await req.json() as { roomCode?: string };
  const roomCode = body.roomCode?.trim();
  if (!roomCode) {
    return NextResponse.json({ error: "roomCode required" }, { status: 400 });
  }

  const db = getDb();

  const rows = await db
    .select()
    .from(estimationSessions)
    .where(eq(estimationSessions.roomCode, roomCode))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const session = rows[0];

  if (!session.createdBy.startsWith("partykit:")) {
    return NextResponse.json({ error: "Session already claimed" }, { status: 409 });
  }

  await db
    .update(estimationSessions)
    .set({ createdBy: userId })
    .where(eq(estimationSessions.id, session.id));

  return NextResponse.json({ success: true, sessionId: session.id });
}
