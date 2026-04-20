import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { publishGameEvent } from "@/lib/ably/server";
import { db } from "@/lib/db/client";
import { playerSessions, sessionQuestions, sessions } from "@/lib/db/schema";
import { getLeaderboardTop, recordAnswer } from "@/lib/game/scoring";
import { apiErrorResponse, zodErrorResponse } from "@/lib/apiError";
import { enforceRateLimit } from "@/lib/rateLimit";

const schema = z.object({
  joinCode: z.string().length(6),
  playerId: z.string().uuid(),
  sessionQuestionId: z.string().uuid(),
  answer: z.string().min(1),
  timeToAnswerMs: z.number().int().min(0).max(10 * 60 * 1000),
});

/**
 * Machine-readable error codes the play page can use to decide whether to
 * auto-resync. `STALE_QUESTION` and `LOCKED` are transient and self-healable;
 * the rest are real errors that stop with a toast.
 */
const ERR = {
  STALE_QUESTION: "STALE_QUESTION",
  LOCKED: "LOCKED",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  NOT_IN_SESSION: "NOT_IN_SESSION",
  ALREADY_ANSWERED: "ALREADY_ANSWERED",
  SESSION_PAUSED: "SESSION_PAUSED",
} as const;

function errJson(status: number, error: string, code: string) {
  return NextResponse.json({ error, code }, { status });
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return zodErrorResponse(parsed.error, "Invalid answer payload");
  }

  const body = parsed.data;
  // Rate-limit by playerId so bots can't sidestep the bucket by rotating IPs.
  // The Zod schema already validated this is a real UUID, so it's safe as a key.
  try {
    await enforceRateLimit("publicAnswer", `player:${body.playerId}`);
  } catch (e) {
    return apiErrorResponse(e);
  }

  const code = body.joinCode.toUpperCase();

  const sessionRows = await db
    .select({
      id: sessions.id,
      joinCode: sessions.joinCode,
      pausedAt: sessions.pausedAt,
    })
    .from(sessions)
    .where(eq(sessions.joinCode, code))
    .limit(1);
  const session = sessionRows[0];
  if (!session) {
    return errJson(404, "Session not found", ERR.SESSION_NOT_FOUND);
  }
  if (session.pausedAt) {
    return errJson(423, "Game is paused", ERR.SESSION_PAUSED);
  }

  const ps = await db
    .select({ id: playerSessions.id })
    .from(playerSessions)
    .where(
      and(
        eq(playerSessions.sessionId, session.id),
        eq(playerSessions.playerId, body.playerId)
      )
    )
    .limit(1);
  if (ps.length === 0) {
    return errJson(403, "Player not in session", ERR.NOT_IN_SESSION);
  }

  const sqRows = await db
    .select({ id: sessionQuestions.id, status: sessionQuestions.status })
    .from(sessionQuestions)
    .where(
      and(
        eq(sessionQuestions.id, body.sessionQuestionId),
        eq(sessionQuestions.sessionId, session.id)
      )
    )
    .limit(1);
  const sq = sqRows[0];
  if (!sq) {
    return errJson(409, "Question no longer active — resync and try again", ERR.STALE_QUESTION);
  }
  if (sq.status === "locked") {
    return errJson(423, "Answers are locked", ERR.LOCKED);
  }
  if (sq.status !== "active") {
    return errJson(409, "Question no longer active — resync and try again", ERR.STALE_QUESTION);
  }

  const result = await recordAnswer({
    playerId: body.playerId,
    sessionQuestionId: body.sessionQuestionId,
    answerGiven: body.answer,
    timeToAnswerMs: body.timeToAnswerMs,
  });

  if (result.alreadyAnswered) {
    return errJson(409, "You already answered this one", ERR.ALREADY_ANSWERED);
  }

  const board = await getLeaderboardTop(session.id, 10);
  await publishGameEvent(code, "leaderboard_updated", { top: board });

  return NextResponse.json({ ok: true, isCorrect: result.isCorrect });
}
