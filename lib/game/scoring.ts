import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { publishGameEvent } from "@/lib/ably/server";
import { track } from "@/lib/analytics/server";
import { db } from "@/lib/db/client";
import {
  answers,
  playerSessions,
  playerStats,
  players,
  questions,
  sessionQuestions,
  sessions,
} from "@/lib/db/schema";
import { tryGrantAchievementsAfterAnswer } from "@/lib/game/achievements";
import { awardCorrectAnswerXp } from "@/lib/xp";

/** Streak bonus thresholds. If a correct answer brings the player to one of
 *  these streak counts, add the value on top of the speed-based base. Sized
 *  to roughly match a typical fast correct answer (~10 pts) so streaks feel
 *  rewarding without distorting the per-question economy. */
export const STREAK_BONUSES: Record<number, number> = {
  3: 3,
  5: 5,
  7: 10,
  10: 15,
};

/** Fallback "base" used only when the session has no valid timer to subtract
 *  elapsed seconds from. Rare; manual-timer sessions with no round override.
 *  Kept small to stay within the new economy. */
export const NO_TIMER_FALLBACK_POINTS = 5;

/**
 * Difficulty multipliers applied to the speed-based `basePoints` after the
 * elapsed-seconds subtraction (order B from the design: *subtract, then
 * scale*, rounded to whole points). A hard question pays out the full
 * remaining seconds; medium is 2/3; easy is 1/3. This keeps a 30s easy
 * from ever out-scoring a 10s hard:
 *
 *   hard 10s, 4s elapsed → (10-4) * 1.00 = 6
 *   medium 10s, 4s elapsed → (10-4) * 0.67 = 4 (rounded from 4.0)
 *   easy 10s, 4s elapsed → (10-4) * 0.33 = 2 (rounded from 2.0)
 *   easy 30s, 10s elapsed → (30-10) * 0.33 = 7
 *
 * Exact fractions (1/3, 2/3, 1) instead of decimal approximations keep the
 * rounding stable across the range of timer sizes we actually use. */
export const DIFFICULTY_POINT_WEIGHTS: Record<1 | 2 | 3, number> = {
  1: 1 / 3,
  2: 2 / 3,
  3: 1,
};

export type Difficulty = 1 | 2 | 3;

/**
 * Coerce an arbitrary `questions.difficulty` read (historically `integer`,
 * so in principle any int) into the `1|2|3` tuple scoring expects. Anything
 * outside that set falls back to medium. Centralized here so `recordAnswer`
 * and `recordSoloAnswer` share the same guard.
 */
export function normalizeDifficulty(raw: number | null | undefined): Difficulty {
  if (raw === 1 || raw === 2 || raw === 3) return raw;
  return 2;
}

export type PointsBreakdown = {
  points: number;
  basePoints: number;
  streakBonus: number;
  newStreak: number;
  /** Elapsed-vs-timer ratio remaining at answer time, in [0, 1]. Telemetry. */
  fraction: number;
  /** Difficulty multiplier applied to `basePoints`. Telemetry. */
  difficultyWeight: number;
};

/**
 * Speed-weighted, difficulty-scaled scoring.
 *
 * - Wrong / unanswered → 0 points, streak resets to 0.
 * - Correct → `round(max(0, timerSeconds - floor(elapsedMs / 1000)) *
 *   DIFFICULTY_POINT_WEIGHTS[difficulty])`. So a hard 15s answered in 2s
 *   gives 13 points; medium gives 9 (13 × 2/3 ≈ 8.67, rounded); easy gives
 *   4 (13 × 1/3 ≈ 4.33, rounded).
 * - When the new streak matches a threshold in `STREAK_BONUSES`, the flat
 *   bonus is added on top. Streak bonuses are **not** difficulty-scaled —
 *   they already ride on top of a difficulty-scaled base, and scaling them
 *   twice would make medium/easy streaks feel punitive.
 *
 * `timerSeconds` may be null/0 in degenerate cases (manual-timer sessions
 * with no round override). We award a flat `NO_TIMER_FALLBACK_POINTS`,
 * also scaled by difficulty, so correctness still pays out without a
 * divide-by-zero.
 */
export function computeAnswerPoints(input: {
  isCorrect: boolean;
  timeToAnswerMs: number;
  timerSeconds: number | null | undefined;
  previousStreak: number;
  /**
   * Question difficulty (1=easy, 2=medium, 3=hard). Required going forward
   * so scoring reflects the curated difficulty. Callers that only know the
   * question id must join `questions.difficulty` before scoring (see
   * `recordAnswer` below and `recordSoloAnswer` in `lib/game/solo.ts`).
   */
  difficulty: Difficulty;
}): PointsBreakdown {
  const previousStreak = Math.max(0, input.previousStreak | 0);
  const weight =
    DIFFICULTY_POINT_WEIGHTS[input.difficulty] ?? DIFFICULTY_POINT_WEIGHTS[2];

  if (!input.isCorrect) {
    return {
      points: 0,
      basePoints: 0,
      streakBonus: 0,
      newStreak: 0,
      fraction: 0,
      difficultyWeight: weight,
    };
  }

  const timerS =
    typeof input.timerSeconds === "number" && input.timerSeconds > 0
      ? input.timerSeconds
      : 0;

  let basePoints: number;
  let fraction: number;
  if (timerS > 0) {
    const elapsedS = Math.min(
      timerS,
      Math.floor(Math.max(0, input.timeToAnswerMs) / 1000)
    );
    const remaining = Math.max(0, timerS - elapsedS);
    basePoints = Math.round(remaining * weight);
    fraction = (timerS - elapsedS) / timerS;
  } else {
    basePoints = Math.round(NO_TIMER_FALLBACK_POINTS * weight);
    fraction = 0.5;
  }

  const newStreak = previousStreak + 1;
  const streakBonus = STREAK_BONUSES[newStreak] ?? 0;

  return {
    points: basePoints + streakBonus,
    basePoints,
    streakBonus,
    newStreak,
    fraction,
    difficultyWeight: weight,
  };
}

/**
 * Recomputes per-player ranks for a session.
 *
 * Tie-break order:
 *   1. higher score
 *   2. lower total-time on correct answers
 *   3. stable by playerId
 */
export async function recomputeSessionRanks(sessionId: string) {
  const totalTimeSq = db
    .select({
      playerId: answers.playerId,
      totalMs: sql<number>`COALESCE(SUM(${answers.timeToAnswerMs}) FILTER (WHERE ${answers.isCorrect}), 0)`.as(
        "total_ms"
      ),
    })
    .from(answers)
    .innerJoin(sessionQuestions, eq(sessionQuestions.id, answers.sessionQuestionId))
    .where(eq(sessionQuestions.sessionId, sessionId))
    .groupBy(answers.playerId)
    .as("tt");

  const rows = await db
    .select({
      id: playerSessions.id,
      playerId: playerSessions.playerId,
      score: playerSessions.score,
      totalMs: sql<number>`COALESCE(${totalTimeSq.totalMs}, 0)`,
    })
    .from(playerSessions)
    .leftJoin(totalTimeSq, eq(totalTimeSq.playerId, playerSessions.playerId))
    .where(eq(playerSessions.sessionId, sessionId))
    .orderBy(
      desc(playerSessions.score),
      asc(sql`COALESCE(${totalTimeSq.totalMs}, 0)`),
      asc(playerSessions.playerId)
    );

  let rank = 1;
  for (const row of rows) {
    await db.update(playerSessions).set({ rank }).where(eq(playerSessions.id, row.id));
    rank += 1;
  }
}

/**
 * Look up the player's current streak for a session (highest streak_at_answer
 * on any previous answer, reset to 0 if the most recent answer was wrong).
 */
async function getCurrentStreak(
  playerId: string,
  sessionId: string
): Promise<number> {
  const rows = await db
    .select({
      isCorrect: answers.isCorrect,
      streakAtAnswer: answers.streakAtAnswer,
      createdAt: answers.createdAt,
    })
    .from(answers)
    .innerJoin(sessionQuestions, eq(sessionQuestions.id, answers.sessionQuestionId))
    .where(
      and(eq(answers.playerId, playerId), eq(sessionQuestions.sessionId, sessionId))
    )
    .orderBy(desc(answers.createdAt))
    .limit(1);

  const latest = rows[0];
  if (!latest) return 0;
  if (!latest.isCorrect) return 0;
  return latest.streakAtAnswer ?? 0;
}

async function upsertPlayerStats(
  playerId: string,
  delta: {
    answeredDelta: number;
    correctDelta: number;
    pointsDelta: number;
    streakCandidate: number;
    fastestCorrectMs: number | null;
  }
) {
  const existingRows = await db
    .select({
      playerId: playerStats.playerId,
      longestStreak: playerStats.longestStreak,
      fastestCorrectMs: playerStats.fastestCorrectMs,
    })
    .from(playerStats)
    .where(eq(playerStats.playerId, playerId))
    .limit(1);
  const existing = existingRows[0];

  const nextLongest = Math.max(existing?.longestStreak ?? 0, delta.streakCandidate);
  const nextFastest =
    delta.fastestCorrectMs != null
      ? existing?.fastestCorrectMs == null
        ? delta.fastestCorrectMs
        : Math.min(existing.fastestCorrectMs, delta.fastestCorrectMs)
      : (existing?.fastestCorrectMs ?? null);

  if (!existing) {
    await db
      .insert(playerStats)
      .values({
        playerId,
        totalAnswered: delta.answeredDelta,
        totalCorrect: delta.correctDelta,
        totalPoints: delta.pointsDelta,
        longestStreak: nextLongest,
        fastestCorrectMs: nextFastest,
        lastPlayedAt: new Date(),
      })
      .onConflictDoNothing({ target: playerStats.playerId });
    return;
  }

  await db
    .update(playerStats)
    .set({
      totalAnswered: sql`${playerStats.totalAnswered} + ${delta.answeredDelta}`,
      totalCorrect: sql`${playerStats.totalCorrect} + ${delta.correctDelta}`,
      totalPoints: sql`${playerStats.totalPoints} + ${delta.pointsDelta}`,
      longestStreak: nextLongest,
      fastestCorrectMs: nextFastest,
      lastPlayedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(playerStats.playerId, playerId));
}

export async function recordAnswer(input: {
  playerId: string;
  sessionQuestionId: string;
  answerGiven: string;
  /** Client-reported elapsed (telemetry only when server elapsed is available). */
  timeToAnswerMs: number;
  /**
   * Server-derived elapsed from `timerStartedAtMs`. When provided, takes
   * precedence over `timeToAnswerMs` for scoring. Populated by the hosted
   * public-answer route; solo answer route leaves this unset.
   */
  serverElapsedMs?: number | null;
  /** Cheat-prevention fingerprints. All three are already hashed. */
  ipHash?: string | null;
  uaHash?: string | null;
  deviceId?: string | null;
}) {
  const sqRows = await db
    .select({
      sessionId: sessionQuestions.sessionId,
      questionId: sessionQuestions.questionId,
      timerSeconds: sessionQuestions.timerSeconds,
    })
    .from(sessionQuestions)
    .where(eq(sessionQuestions.id, input.sessionQuestionId))
    .limit(1);

  const sq = sqRows[0];
  if (!sq) {
    throw new Error("Session question not found");
  }

  // Difficulty lives on `questions`, not denormalized onto `session_questions`
  // — pulled alongside `correctAnswer` so scoring can apply the difficulty
  // weight without a second round-trip.
  const qRows = await db
    .select({
      correctAnswer: questions.correctAnswer,
      difficulty: questions.difficulty,
    })
    .from(questions)
    .where(eq(questions.id, sq.questionId))
    .limit(1);
  const correct = qRows[0]?.correctAnswer ?? "";
  const difficulty = normalizeDifficulty(qRows[0]?.difficulty);

  const isCorrect =
    input.answerGiven.trim().toLowerCase() === String(correct).trim().toLowerCase();

  const previousStreak = await getCurrentStreak(input.playerId, sq.sessionId);

  // Phase 4.3: score from server-derived elapsed when available. Client
  // `timeToAnswerMs` is still stored for telemetry / dispute resolution.
  const scoringElapsed =
    typeof input.serverElapsedMs === "number" && input.serverElapsedMs >= 0
      ? input.serverElapsedMs
      : input.timeToAnswerMs;

  const breakdown = computeAnswerPoints({
    isCorrect,
    timeToAnswerMs: scoringElapsed,
    timerSeconds: sq.timerSeconds,
    previousStreak,
    difficulty,
  });

  // Insert-or-skip on the (player, sessionQuestion) unique index. The DB is
  // the source of truth for "already answered"; concurrent POSTs can't
  // double-score.
  const inserted = await db
    .insert(answers)
    .values({
      playerId: input.playerId,
      sessionQuestionId: input.sessionQuestionId,
      answerGiven: input.answerGiven,
      isCorrect,
      timeToAnswerMs: input.timeToAnswerMs,
      serverElapsedMs:
        typeof input.serverElapsedMs === "number" ? input.serverElapsedMs : null,
      pointsAwarded: breakdown.points,
      streakAtAnswer: breakdown.newStreak,
      ipHash: input.ipHash ?? null,
      uaHash: input.uaHash ?? null,
      deviceId: input.deviceId ?? null,
    })
    .onConflictDoNothing({ target: [answers.playerId, answers.sessionQuestionId] })
    .returning({ id: answers.id });

  if (inserted.length === 0) {
    return {
      isCorrect,
      sessionId: sq.sessionId,
      alreadyAnswered: true,
      pointsAwarded: 0,
      streak: previousStreak,
    };
  }

  if (breakdown.points > 0) {
    await db
      .update(playerSessions)
      .set({ score: sql`${playerSessions.score} + ${breakdown.points}` })
      .where(
        and(
          eq(playerSessions.sessionId, sq.sessionId),
          eq(playerSessions.playerId, input.playerId)
        )
      );
  }

  await recomputeSessionRanks(sq.sessionId);

  await upsertPlayerStats(input.playerId, {
    answeredDelta: 1,
    correctDelta: isCorrect ? 1 : 0,
    pointsDelta: breakdown.points,
    streakCandidate: breakdown.newStreak,
    fastestCorrectMs: isCorrect ? input.timeToAnswerMs : null,
  });

  // Fire-and-forget: broadcast the updated answered-count / total-players so the
  // host dashboard can show a live tally without each client polling.
  void (async () => {
    try {
      const joinRows = await db
        .select({ joinCode: sessions.joinCode })
        .from(sessions)
        .where(eq(sessions.id, sq.sessionId))
        .limit(1);
      const code = joinRows[0]?.joinCode;
      if (!code) return;

      const answeredRows = await db
        .select({ value: count() })
        .from(answers)
        .where(eq(answers.sessionQuestionId, input.sessionQuestionId));
      const totalRows = await db
        .select({ value: count() })
        .from(playerSessions)
        .where(eq(playerSessions.sessionId, sq.sessionId));

      await publishGameEvent(code, "answer_received", {
        sessionQuestionId: input.sessionQuestionId,
        answeredCount: answeredRows[0]?.value ?? 0,
        totalPlayers: totalRows[0]?.value ?? 0,
      });
    } catch {
      // swallow: the live tally is a UX nicety, not critical.
    }
  })();

  void tryGrantAchievementsAfterAnswer({
    playerId: input.playerId,
    sessionId: sq.sessionId,
    questionId: sq.questionId,
    isCorrect,
    timeToAnswerMs: input.timeToAnswerMs,
    streak: breakdown.newStreak,
    pointsAwarded: breakdown.points,
  }).catch(() => {});

  // Difficulty-weighted XP per correct answer (easy/medium/hard → 1/2/3).
  // The `answers` unique constraint on (player, sessionQuestion) makes the
  // surrounding insert idempotent, so we only fire XP on the initial
  // successful write.
  if (isCorrect) {
    void awardCorrectAnswerXp({
      playerId: input.playerId,
      sessionId: sq.sessionId,
      questionId: sq.questionId,
      difficulty,
    }).catch((err) => {
      console.error("awardCorrectAnswerXp failed", err);
    });
  }

  // 10% sample — per-answer events would be expensive and noisy. We still
  // get a statistically useful accuracy/latency distribution and rely on
  // session_completed for per-session rollups.
  if (Math.random() < 0.1) {
    void track("question_answered", {
      distinctId: `player:${input.playerId}`,
      properties: {
        sessionId: sq.sessionId,
        sessionQuestionId: input.sessionQuestionId,
        questionId: sq.questionId,
        isCorrect,
        timeToAnswerMs: input.timeToAnswerMs,
        pointsAwarded: breakdown.points,
        streak: breakdown.newStreak,
      },
    });
  }

  return {
    isCorrect,
    sessionId: sq.sessionId,
    alreadyAnswered: false,
    pointsAwarded: breakdown.points,
    streak: breakdown.newStreak,
  };
}

export async function getLeaderboardTop(sessionId: string, limit = 10) {
  return db
    .select({
      playerId: playerSessions.playerId,
      username: players.username,
      score: playerSessions.score,
      rank: playerSessions.rank,
    })
    .from(playerSessions)
    .innerJoin(players, eq(players.id, playerSessions.playerId))
    .where(eq(playerSessions.sessionId, sessionId))
    .orderBy(asc(playerSessions.rank), asc(playerSessions.playerId))
    .limit(limit);
}
