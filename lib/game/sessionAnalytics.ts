/**
 * Post-game analytics for a completed session.
 *
 * Returns a compact object the host recap page renders without any
 * extra round-trips. Everything is computed in SQL via aggregates so
 * we can afford to run this on-demand for any finished game — no
 * materialized tables needed yet.
 */

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  answers,
  players,
  playerSessions,
  questions,
  sessionQuestions,
  sessions,
} from "@/lib/db/schema";

export type SessionAnalyticsRow = {
  session: {
    id: string;
    joinCode: string;
    status: string;
    startedAt: Date | null;
    endedAt: Date | null;
    theme: string | null;
    houseGame: boolean;
    venueAccountId: string | null;
    hostAccountId: string | null;
  };
  attendance: {
    joined: number;
    questionsAsked: number;
  };
  scoring: {
    answersGraded: number;
    correctAnswers: number;
    accuracyPct: number;
    medianResponseMs: number | null;
  };
  topPlayers: Array<{
    playerId: string;
    username: string;
    totalPoints: number;
    correctCount: number;
    answered: number;
  }>;
  perQuestion: Array<{
    sessionQuestionId: string;
    orderIndex: number;
    prompt: string;
    category: string;
    subcategory: string | null;
    difficulty: number;
    answered: number;
    correct: number;
    accuracyPct: number;
    medianResponseMs: number | null;
  }>;
};

/**
 * Fail-soft helper — returns `null` when the session doesn't exist or
 * the caller's authorization layer hasn't granted access. The route
 * that wraps this is responsible for authentication.
 */
export async function getSessionAnalytics(
  sessionId: string
): Promise<SessionAnalyticsRow | null> {
  const [session] = await db
    .select({
      id: sessions.id,
      joinCode: sessions.joinCode,
      status: sessions.status,
      startedAt: sessions.eventStartsAt,
      endedAt: sessions.estimatedEndAt,
      theme: sessions.theme,
      houseGame: sessions.houseGame,
      venueAccountId: sessions.venueAccountId,
      hostAccountId: sessions.hostAccountId,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!session) return null;

  // ---- Attendance ----
  const [attendance] = await db
    .select({
      joined: sql<number>`count(*)::int`,
    })
    .from(playerSessions)
    .where(eq(playerSessions.sessionId, sessionId));

  const [questionsAsked] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sessionQuestions)
    .where(eq(sessionQuestions.sessionId, sessionId));

  // ---- Scoring rollup (percentile-agnostic) ----
  const [scoring] = await db
    .select({
      answersGraded: sql<number>`count(*)::int`,
      correctAnswers: sql<number>`sum(case when ${answers.isCorrect} then 1 else 0 end)::int`,
      // Use time-bucket aggregate that's safe in the absence of true
      // percentile_cont — postgres has it natively via
      // percentile_cont but keeping a portable median via sort + avg of
      // the middle values would require a window function. We lean on
      // the built-in aggregate function for production clarity.
      medianResponseMs: sql<number | null>`percentile_cont(0.5) within group (order by coalesce(${answers.serverElapsedMs}, ${answers.timeToAnswerMs}))`,
    })
    .from(answers)
    .innerJoin(
      sessionQuestions,
      eq(sessionQuestions.id, answers.sessionQuestionId)
    )
    .where(
      and(
        eq(sessionQuestions.sessionId, sessionId),
        sql`${answers.disqualifiedAt} is null`
      )
    );

  const answersGraded = scoring?.answersGraded ?? 0;
  const correctAnswers = scoring?.correctAnswers ?? 0;
  const accuracyPct = answersGraded > 0
    ? Math.round((correctAnswers / answersGraded) * 100)
    : 0;

  // ---- Top 10 players ----
  const topPlayersRows = await db
    .select({
      playerId: players.id,
      username: players.username,
      totalPoints: sql<number>`coalesce(sum(${answers.pointsAwarded}), 0)::int`,
      correctCount: sql<number>`coalesce(sum(case when ${answers.isCorrect} then 1 else 0 end), 0)::int`,
      answered: sql<number>`count(${answers.id})::int`,
    })
    .from(playerSessions)
    .innerJoin(players, eq(players.id, playerSessions.playerId))
    .leftJoin(
      sessionQuestions,
      eq(sessionQuestions.sessionId, playerSessions.sessionId)
    )
    .leftJoin(
      answers,
      and(
        eq(answers.playerId, playerSessions.playerId),
        eq(answers.sessionQuestionId, sessionQuestions.id),
        sql`${answers.disqualifiedAt} is null`
      )
    )
    .where(eq(playerSessions.sessionId, sessionId))
    .groupBy(players.id, players.username)
    .orderBy(desc(sql`coalesce(sum(${answers.pointsAwarded}), 0)`))
    .limit(10);

  // ---- Per-question breakdown ----
  const perQuestionRows = await db
    .select({
      sessionQuestionId: sessionQuestions.id,
      orderIndex: sessionQuestions.questionOrder,
      prompt: questions.body,
      category: questions.category,
      subcategory: questions.subcategory,
      difficulty: questions.difficulty,
      answered: sql<number>`count(${answers.id})::int`,
      correct: sql<number>`sum(case when ${answers.isCorrect} then 1 else 0 end)::int`,
      medianResponseMs: sql<number | null>`percentile_cont(0.5) within group (order by coalesce(${answers.serverElapsedMs}, ${answers.timeToAnswerMs}))`,
    })
    .from(sessionQuestions)
    .innerJoin(questions, eq(questions.id, sessionQuestions.questionId))
    .leftJoin(
      answers,
      and(
        eq(answers.sessionQuestionId, sessionQuestions.id),
        sql`${answers.disqualifiedAt} is null`
      )
    )
    .where(eq(sessionQuestions.sessionId, sessionId))
    .groupBy(
      sessionQuestions.id,
      sessionQuestions.questionOrder,
      questions.body,
      questions.category,
      questions.subcategory,
      questions.difficulty
    )
    .orderBy(asc(sessionQuestions.questionOrder));

  return {
    session: {
      id: session.id,
      joinCode: session.joinCode,
      status: session.status,
      startedAt: session.startedAt ?? null,
      endedAt: session.endedAt ?? null,
      theme: session.theme ?? null,
      houseGame: session.houseGame,
      venueAccountId: session.venueAccountId,
      hostAccountId: session.hostAccountId,
    },
    attendance: {
      joined: attendance?.joined ?? 0,
      questionsAsked: questionsAsked?.n ?? 0,
    },
    scoring: {
      answersGraded,
      correctAnswers,
      accuracyPct,
      medianResponseMs: scoring?.medianResponseMs
        ? Math.round(Number(scoring.medianResponseMs))
        : null,
    },
    topPlayers: topPlayersRows.map((row) => ({
      playerId: row.playerId,
      username: row.username,
      totalPoints: Number(row.totalPoints),
      correctCount: Number(row.correctCount),
      answered: Number(row.answered),
    })),
    perQuestion: perQuestionRows.map((row) => {
      const answered = Number(row.answered);
      const correct = Number(row.correct);
      return {
        sessionQuestionId: row.sessionQuestionId,
        orderIndex: row.orderIndex,
        prompt: row.prompt,
        category: row.category,
        subcategory: row.subcategory,
        difficulty: row.difficulty,
        answered,
        correct,
        accuracyPct: answered > 0 ? Math.round((correct / answered) * 100) : 0,
        medianResponseMs: row.medianResponseMs
          ? Math.round(Number(row.medianResponseMs))
          : null,
      };
    }),
  };
}
