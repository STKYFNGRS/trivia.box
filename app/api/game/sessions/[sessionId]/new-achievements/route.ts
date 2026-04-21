import { auth } from "@clerk/nextjs/server";
import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { apiErrorResponse } from "@/lib/apiError";
import { db } from "@/lib/db/client";
import {
  answers,
  playerSessions,
  sessionQuestions,
  sessions,
} from "@/lib/db/schema";
import { listAchievementsEarnedSince } from "@/lib/game/achievementCatalog";
import { getPlayerByAccountId } from "@/lib/players";
import { clientIpFromRequest, enforceRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/game/sessions/[sessionId]/new-achievements
 *
 * Returns achievements the *authenticated viewer* earned during a given
 * session — powers the post-game "You unlocked X!" toast on the play
 * page.
 *
 * Guardrails:
 *   - must be signed in (anonymous players can't earn achievements),
 *   - must have a `player_sessions` row for that session (so we don't
 *     expose other players' unlocks), and
 *   - session must be `completed` (live sessions would give the UI
 *     stuttered partial results; we want a single end-of-game toast).
 *
 * "Earned during" is computed as `grant.earnedAt >= firstAnswerAt`
 * where `firstAnswerAt` is the player's earliest answer row in this
 * session. That correctly excludes long-dormant grants while still
 * catching the `tryGrantAchievementsAfterSession` ones that land a few
 * seconds after the last answer.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await enforceRateLimit("anonymous", `ip:${clientIpFromRequest(req)}`);
  } catch (e) {
    return apiErrorResponse(e);
  }

  const { sessionId } = await params;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const account = await getAccountByClerkUserId(userId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  const player = await getPlayerByAccountId(account.id);
  if (!player) {
    return NextResponse.json(
      { error: "Player profile missing" },
      { status: 404 }
    );
  }

  const sessionRows = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const session = sessionRows[0];
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.status !== "completed") {
    // We only surface end-of-game unlocks. A still-running session would
    // hand out stuttered partial results; easier to just say "not yet".
    return NextResponse.json({ achievements: [], pending: true });
  }

  const psRows = await db
    .select({ id: playerSessions.id })
    .from(playerSessions)
    .where(
      and(
        eq(playerSessions.sessionId, sessionId),
        eq(playerSessions.playerId, player.id)
      )
    )
    .limit(1);
  if (!psRows[0]) {
    return NextResponse.json(
      { error: "Not in session" },
      { status: 403 }
    );
  }

  // Use the player's first answer *in this session* as the "start" marker
  // — handles late joiners cleanly and excludes anything earned in
  // earlier games. Fall back to `sessions.createdAt` if they somehow
  // have no answers (ghost join row).
  const firstAnswerRows = await db
    .select({ createdAt: answers.createdAt })
    .from(answers)
    .innerJoin(
      sessionQuestions,
      eq(sessionQuestions.id, answers.sessionQuestionId)
    )
    .where(
      and(
        eq(answers.playerId, player.id),
        eq(sessionQuestions.sessionId, sessionId)
      )
    )
    .orderBy(asc(answers.createdAt))
    .limit(1);
  const since = firstAnswerRows[0]?.createdAt ?? session.createdAt;

  const earned = await listAchievementsEarnedSince(player.id, since);

  return NextResponse.json({
    achievements: earned.map((a) => ({
      slug: a.slug,
      title: a.title,
      description: a.description,
      icon: a.icon,
      earnedAt: a.earnedAt,
    })),
    pending: false,
  });
}
