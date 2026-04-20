import { auth } from "@clerk/nextjs/server";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { apiErrorResponse } from "@/lib/apiError";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";
import { assertHostControlsSession } from "@/lib/game/sessionPermissions";

/**
 * Soft-hide a past session from the host's dashboard.
 *
 * Wired to the **Remove** button on the Recent games list at
 * `/dashboard/games`. Only completed, cancelled, or draft sessions are
 * eligible so a host can't accidentally hide a pending / active game mid-
 * stream. Active or paused sessions reply 409 to surface the guard in the
 * UI.
 *
 * This is a *soft* delete by design — we only stamp `host_hidden_at` and
 * let the dashboard query filter by it. Everything downstream
 * (`player_sessions`, `answers`, `player_xp_events`, `prize_claims`, the
 * leaderboards, `/u/[username]` history) still references the row, so the
 * action is invisible to players. If we ever need a hard delete it should
 * be a separate admin-only tool that cascades through the history tables
 * explicitly.
 */
export async function DELETE(
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

    const hidable = new Set(["completed", "cancelled", "draft"]);
    if (!hidable.has(session.status)) {
      return NextResponse.json(
        {
          error:
            "Only completed, cancelled, or draft sessions can be removed. End the game first.",
          code: "SESSION_NOT_HIDABLE",
          status: session.status,
        },
        { status: 409 }
      );
    }

    await db
      .update(sessions)
      .set({ hostHiddenAt: sql`now()` })
      .where(eq(sessions.id, sessionId));

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
