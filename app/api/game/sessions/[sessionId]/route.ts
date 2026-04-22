import { auth } from "@clerk/nextjs/server";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { apiErrorResponse } from "@/lib/apiError";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";
import { assertHostControlsSession } from "@/lib/game/sessionPermissions";

/**
 * Remove a session from the host's dashboard.
 *
 * Wired to both the **Remove** button on Recent games *and* the **Cancel**
 * button on Active & upcoming at `/dashboard/games`. Semantics depend on the
 * session's current status:
 *
 *   - `completed` / `cancelled` / `draft` → soft-hide via `host_hidden_at`.
 *     Player history (leaderboards, `/u/[username]`, recap links) is kept
 *     intact; only the host's own dashboard forgets about it.
 *   - `pending` → cancel: flip `status` to `cancelled` *and* soft-hide the
 *     row in the same statement so it drops out of "Active & upcoming"
 *     immediately. This also takes the session out of the auto-launch
 *     cron's query (which only picks up `pending` rows), so the scheduled
 *     start is effectively undone.
 *   - `active` / `paused` → 409; the host has to end the game first. Killing
 *     a live session mid-question would leave connected players stranded
 *     and is intentionally not a dashboard action.
 *
 * The soft-hide is by design. Everything downstream (`player_sessions`,
 * `answers`, `player_xp_events`, `prize_claims`, the leaderboards,
 * `/u/[username]` history) still references the row, so the action is
 * invisible to players. A hard delete would need to be a separate admin
 * tool that cascades through history explicitly.
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

    if (session.status === "active" || session.status === "paused") {
      return NextResponse.json(
        {
          error:
            "End the game first — active or paused sessions can't be removed from the dashboard.",
          code: "SESSION_NOT_HIDABLE",
          status: session.status,
        },
        { status: 409 }
      );
    }

    if (session.status === "pending") {
      // Cancel + hide in one write so the dashboard drops the card and the
      // auto-launch cron stops picking it up on the next tick.
      await db
        .update(sessions)
        .set({ status: "cancelled", hostHiddenAt: sql`now()` })
        .where(eq(sessions.id, sessionId));
      return NextResponse.json({ ok: true, cancelled: true });
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
