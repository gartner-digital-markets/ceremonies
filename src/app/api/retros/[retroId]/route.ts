import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  actionItemJiraLinks,
  actionItems,
  retroCards,
  retroGroups,
  retros,
  teamMembers,
} from "@/lib/db/schema";

/**
 * DELETE /api/retros/[retroId]
 * Delete a retro owned by the signed-in user.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ retroId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { retroId } = await params;
  const db = getDb();

  const [retro] = await db
    .select({ id: retros.id, teamId: retros.teamId, createdBy: retros.createdBy })
    .from(retros)
    .where(eq(retros.id, retroId))
    .limit(1);

  if (!retro) {
    return NextResponse.json({ error: "Retro not found" }, { status: 404 });
  }

  const ownsRetro = retro.createdBy === userId;
  const isTeamOwner = retro.teamId ? await userOwnsTeam(userId, retro.teamId) : false;

  if (!ownsRetro && !isTeamOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const actions = await db
    .select({ id: actionItems.id })
    .from(actionItems)
    .where(eq(actionItems.retroId, retroId));
  const actionIds = actions.map((action) => action.id);

  if (actionIds.length > 0) {
    await db
      .delete(actionItemJiraLinks)
      .where(inArray(actionItemJiraLinks.actionItemId, actionIds));
  }

  await db.delete(actionItems).where(eq(actionItems.retroId, retroId));
  await db.delete(retroCards).where(eq(retroCards.retroId, retroId));
  await db.delete(retroGroups).where(eq(retroGroups.retroId, retroId));
  await db.delete(retros).where(eq(retros.id, retroId));

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
