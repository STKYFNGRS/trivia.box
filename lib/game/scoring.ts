import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { answers, playerSessions, players, questions, sessionQuestions } from "@/lib/db/schema";

export async function recomputeSessionRanks(sessionId: string) {
  const rows = await db
    .select({
      id: playerSessions.id,
      score: playerSessions.score,
    })
    .from(playerSessions)
    .where(eq(playerSessions.sessionId, sessionId))
    .orderBy(desc(playerSessions.score));

  let rank = 1;
  for (const row of rows) {
    await db.update(playerSessions).set({ rank }).where(eq(playerSessions.id, row.id));
    rank += 1;
  }
}

export async function recordAnswer(input: {
  playerId: string;
  sessionQuestionId: string;
  answerGiven: string;
  timeToAnswerMs: number;
}) {
  const sqRows = await db
    .select({
      sessionId: sessionQuestions.sessionId,
      questionId: sessionQuestions.questionId,
    })
    .from(sessionQuestions)
    .where(eq(sessionQuestions.id, input.sessionQuestionId))
    .limit(1);

  const sq = sqRows[0];
  if (!sq) {
    throw new Error("Session question not found");
  }

  const qRows = await db
    .select({ correctAnswer: questions.correctAnswer })
    .from(questions)
    .where(eq(questions.id, sq.questionId))
    .limit(1);
  const correct = qRows[0]?.correctAnswer ?? "";

  const isCorrect =
    input.answerGiven.trim().toLowerCase() === String(correct).trim().toLowerCase();

  await db.insert(answers).values({
    playerId: input.playerId,
    sessionQuestionId: input.sessionQuestionId,
    answerGiven: input.answerGiven,
    isCorrect,
    timeToAnswerMs: input.timeToAnswerMs,
  });

  if (isCorrect) {
    await db
      .update(playerSessions)
      .set({ score: sql`${playerSessions.score} + 1` })
      .where(
        and(eq(playerSessions.sessionId, sq.sessionId), eq(playerSessions.playerId, input.playerId))
      );
  }

  await recomputeSessionRanks(sq.sessionId);

  return { isCorrect, sessionId: sq.sessionId };
}

export async function getLeaderboardTop(sessionId: string, limit = 10) {
  return db
    .select({
      username: players.username,
      score: playerSessions.score,
      rank: playerSessions.rank,
    })
    .from(playerSessions)
    .innerJoin(players, eq(players.id, playerSessions.playerId))
    .where(eq(playerSessions.sessionId, sessionId))
    .orderBy(desc(playerSessions.score))
    .limit(limit);
}
