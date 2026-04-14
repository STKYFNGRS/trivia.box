import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { accounts, questions, rounds, sessionQuestions, sessions } from "@/lib/db/schema";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  if (!code || code.length !== 6) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const sessionRows = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      timerMode: sessions.timerMode,
      secondsPerQuestion: sessions.secondsPerQuestion,
      joinCode: sessions.joinCode,
      hostAccountId: sessions.hostAccountId,
      venueAccountId: sessions.venueAccountId,
    })
    .from(sessions)
    .where(eq(sessions.joinCode, code.toUpperCase()))
    .limit(1);

  const session = sessionRows[0];
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const host = await db
    .select({ name: accounts.name })
    .from(accounts)
    .where(eq(accounts.id, session.hostAccountId))
    .limit(1);
  const venue = await db
    .select({ name: accounts.name })
    .from(accounts)
    .where(eq(accounts.id, session.venueAccountId))
    .limit(1);

  const ordered = await db
    .select({
      sqId: sessionQuestions.id,
      status: sessionQuestions.status,
      questionOrder: sessionQuestions.questionOrder,
      roundNumber: rounds.roundNumber,
    })
    .from(sessionQuestions)
    .innerJoin(rounds, eq(rounds.id, sessionQuestions.roundId))
    .where(eq(sessionQuestions.sessionId, session.id))
    .orderBy(asc(rounds.roundNumber), asc(sessionQuestions.questionOrder));

  const active = ordered.find((q) => q.status === "active");
  let currentQuestion: {
    sessionQuestionId: string;
    body: string;
    choices: string[];
  } | null = null;

  if (active) {
    const qRows = await db
      .select({
        body: questions.body,
        correctAnswer: questions.correctAnswer,
        wrongAnswers: questions.wrongAnswers,
      })
      .from(sessionQuestions)
      .innerJoin(questions, eq(questions.id, sessionQuestions.questionId))
      .where(eq(sessionQuestions.id, active.sqId))
      .limit(1);
    const q = qRows[0];
    if (q) {
      const choices = [q.correctAnswer, ...(q.wrongAnswers ?? [])].sort(() => Math.random() - 0.5);
      currentQuestion = { sessionQuestionId: active.sqId, body: q.body, choices };
    }
  }

  return NextResponse.json({
    sessionId: session.id,
    status: session.status,
    timerMode: session.timerMode,
    secondsPerQuestion: session.secondsPerQuestion,
    hostName: host[0]?.name ?? "Host",
    venueName: venue[0]?.name ?? "Venue",
    currentQuestion,
  });
}
