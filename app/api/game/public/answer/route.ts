import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { publishGameEvent } from "@/lib/ably/server";
import { db } from "@/lib/db/client";
import { answers, playerSessions, sessionQuestions, sessions } from "@/lib/db/schema";
import { getLeaderboardTop, recordAnswer } from "@/lib/game/scoring";

const schema = z.object({
  joinCode: z.string().length(6),
  playerId: z.string().uuid(),
  sessionQuestionId: z.string().uuid(),
  answer: z.string().min(1),
  timeToAnswerMs: z.number().int().min(0).max(10 * 60 * 1000),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;
  const code = body.joinCode.toUpperCase();

  const sessionRows = await db
    .select({ id: sessions.id, joinCode: sessions.joinCode })
    .from(sessions)
    .where(eq(sessions.joinCode, code))
    .limit(1);
  const session = sessionRows[0];
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
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
    return NextResponse.json({ error: "Player not in session" }, { status: 403 });
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
  if (!sq || sq.status !== "active") {
    return NextResponse.json({ error: "Question is not active" }, { status: 400 });
  }

  const existingAnswer = await db
    .select({ id: answers.id })
    .from(answers)
    .where(and(eq(answers.playerId, body.playerId), eq(answers.sessionQuestionId, body.sessionQuestionId)))
    .limit(1);
  if (existingAnswer.length) {
    return NextResponse.json({ error: "Already answered" }, { status: 400 });
  }

  const result = await recordAnswer({
    playerId: body.playerId,
    sessionQuestionId: body.sessionQuestionId,
    answerGiven: body.answer,
    timeToAnswerMs: body.timeToAnswerMs,
  });

  const board = await getLeaderboardTop(session.id, 10);
  await publishGameEvent(code, "leaderboard_updated", { top: board });

  return NextResponse.json({ ok: true, isCorrect: result.isCorrect });
}
