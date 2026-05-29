import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { estimationResults, estimationSessions, teamMembers } from "@/lib/db/schema";

/**
 * DELETE /api/estimation/[sessionId]
 * Delete an estimation session owned by the signed-in user.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const db = getDb();

  const [session] = await db
    .select({
      id: estimationSessions.id,
      teamId: estimationSessions.teamId,
      createdBy: estimationSessions.createdBy,
    })
    .from(estimationSessions)
    .where(eq(estimationSessions.id, sessionId))
    .limit(1);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const ownsSession = session.createdBy === userId;
  const isTeamOwner = session.teamId
    ? await userOwnsTeam(userId, session.teamId)
    : false;

  if (!ownsSession && !isTeamOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db
    .delete(estimationResults)
    .where(eq(estimationResults.sessionId, sessionId));
  await db.delete(estimationSessions).where(eq(estimationSessions.id, sessionId));

  return NextResponse.json({ deleted: true });
}

async function userOwnsTeam(userId: string, teamId: string): Promise<boolean> {
  const db = getDb();
  const [membership] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.userId, userId),
        eq(teamMembers.role, "owner"),
      ),
    )
    .limit(1);

  return Boolean(membership);
}
