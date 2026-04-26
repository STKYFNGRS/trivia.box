import { auth } from "@clerk/nextjs/server";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { apiErrorResponse } from "@/lib/apiError";
import { db } from "@/lib/db/client";
import { playerSessions, players } from "@/lib/db/schema";
import { assertHostControlsSession } from "@/lib/game/sessionPermissions";

/**
 * Host-only lobby snapshot for a single session. Powers the dashboard
 * lobby surface that the host opens between session creation and the
 * "Start game" click.
 *
 * Returns the join code (already a real 6-char value since creation),
 * the current status, the scheduled start, and the roster of players
 * who have entered the lobby so far. Realtime updates piggy-back on
 * the existing `player_joined` Ably event published by
 * `/api/players/join`.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await getAccountByClerkUserId(userId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 400 });
  }

  const { sessionId } = await ctx.params;

  try {
    const session = await assertHostControlsSession(account, sessionId);

    const roster = await db
      .select({
        playerId: players.id,
        username: players.username,
        joinedAt: playerSessions.joinedAt,
      })
      .from(playerSessions)
      .innerJoin(players, eq(players.id, playerSessions.playerId))
      .where(eq(playerSessions.sessionId, session.id))
      .orderBy(asc(playerSessions.joinedAt));

    return NextResponse.json({
      sessionId: session.id,
      joinCode: session.joinCode,
      status: session.status,
      runMode: session.runMode,
      timerMode: session.timerMode,
      eventStartsAt: session.eventStartsAt
        ? session.eventStartsAt.toISOString()
        : null,
      estimatedEndAt: session.estimatedEndAt
        ? session.estimatedEndAt.toISOString()
        : null,
      onlineMeetingUrl: session.onlineMeetingUrl ?? null,
      players: roster.map((r) => ({
        playerId: r.playerId,
        username: r.username,
        joinedAt: r.joinedAt ? r.joinedAt.toISOString() : null,
      })),
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
