import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { answers, playerSessions, playerVenues, players, questions, sessionQuestions } from "@/lib/db/schema";

export async function getPublicPlayerStats(username: string) {
  const playerRows = await db
    .select({ id: players.id, username: players.username, createdAt: players.createdAt })
    .from(players)
    .where(eq(players.username, username))
    .limit(1);

  const player = playerRows[0];
  if (!player) return null;

  const gamesPlayedRows = await db
    .select({ value: count() })
    .from(playerSessions)
    .where(eq(playerSessions.playerId, player.id));
  const gamesPlayed = gamesPlayedRows[0]?.value ?? 0;

  const totalAnswersRows = await db
    .select({ value: count() })
    .from(answers)
    .where(eq(answers.playerId, player.id));
  const totalAnswers = totalAnswersRows[0]?.value ?? 0;

  const correctAnswersRows = await db
    .select({ value: count() })
    .from(answers)
    .where(and(eq(answers.playerId, player.id), eq(answers.isCorrect, true)));
  const correctAnswers = correctAnswersRows[0]?.value ?? 0;

  const accuracy = totalAnswers === 0 ? 0 : Math.round((correctAnswers / totalAnswers) * 1000) / 10;

  const podiumRows = await db
    .select({
      wins: sql<number>`coalesce(sum(case when ${playerSessions.rank} = 1 then 1 else 0 end), 0)::int`,
      second: sql<number>`coalesce(sum(case when ${playerSessions.rank} = 2 then 1 else 0 end), 0)::int`,
      third: sql<number>`coalesce(sum(case when ${playerSessions.rank} = 3 then 1 else 0 end), 0)::int`,
    })
    .from(playerSessions)
    .where(eq(playerSessions.playerId, player.id));

  const venuesVisitedRows = await db
    .select({ value: count() })
    .from(playerVenues)
    .where(eq(playerVenues.playerId, player.id));
  const venuesVisited = venuesVisitedRows[0]?.value ?? 0;

  const bestCategoryRows = await db
    .select({
      category: questions.category,
      correct: sql<number>`sum(case when ${answers.isCorrect} then 1 else 0 end)::int`,
    })
    .from(answers)
    .innerJoin(sessionQuestions, eq(sessionQuestions.id, answers.sessionQuestionId))
    .innerJoin(questions, eq(questions.id, sessionQuestions.questionId))
    .where(eq(answers.playerId, player.id))
    .groupBy(questions.category)
    .orderBy(desc(sql`sum(case when ${answers.isCorrect} then 1 else 0 end)`))
    .limit(1);

  const lastSessionRows = await db
    .select({ joinedAt: playerSessions.joinedAt, score: playerSessions.score, rank: playerSessions.rank })
    .from(playerSessions)
    .where(eq(playerSessions.playerId, player.id))
    .orderBy(desc(playerSessions.joinedAt))
    .limit(1);

  return {
    player,
    gamesPlayed,
    totalAnswers,
    correctAnswers,
    accuracy,
    wins: podiumRows[0]?.wins ?? 0,
    second: podiumRows[0]?.second ?? 0,
    third: podiumRows[0]?.third ?? 0,
    bestCategory: bestCategoryRows[0]?.category ?? "—",
    venuesVisited,
    lastSession: lastSessionRows[0] ?? null,
  };
}
