import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  playerStats,
  playerXpEvents,
  questionDecks,
  questions,
  soloQuestions,
  soloSessions,
} from "@/lib/db/schema";
import { recordDailyChallengeCompletion } from "@/lib/game/dailyChallenge";
import {
  STREAK_BONUSES,
  computeAnswerPoints,
  normalizeDifficulty,
} from "@/lib/game/scoring";
import {
  MAX_SOLO_QUESTIONS,
  MIN_SOLO_QUESTIONS,
  SOLO_SPEEDS,
  type SoloSpeed,
} from "@/lib/game/soloConstants";

export {
  SOLO_SPEEDS,
  type SoloSpeed,
  isSoloSpeed,
  MIN_SOLO_QUESTIONS,
  MAX_SOLO_QUESTIONS,
} from "@/lib/game/soloConstants";

/**
 * Solo (single-player) game helpers.
 *
 * Solo sessions are deliberately separate from the hosted-session tables so
 * that analytics, leaderboards, and anti-cheat can treat them independently.
 * They intentionally reuse the vetted-question pool (so the player feels they
 * are "playing the real game") while skipping the venue-history exclusion to
 * avoid running the solo surface dry for power users.
 *
 * Points: identical Kahoot-style curve as hosted sessions, with the same
 * streak bonuses. `timerSeconds` is captured per-session so speed changes
 * can't retroactively alter past games.
 *
 * XP: awarded on session completion, computed from raw score rather than
 * correctness so that speed matters. Solo games are worth a flat 50% of the
 * equivalent hosted score to keep hosted games more rewarding.
 */

export type SoloQuestionPublic = {
  id: string;
  position: number;
  body: string;
  choices: string[];
  category: string;
  subcategory: string;
  difficulty: number;
  timerSeconds: number;
  shownAtMs: number;
  totalQuestions: number;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pull `count` vetted, non-retired questions for a solo session, optionally
 * constrained to one or more category labels or a specific deck. Unlike
 * the hosted smart-pull this does NOT exclude recently-used questions —
 * for an anonymous solo run we don't know the player's history, and for
 * authenticated players we'd rather let them replay than dry out the pool.
 *
 * When `deckId` is supplied we scope to that deck. Decks are usually much
 * smaller than the global pool (often <50 questions), so if the deck has
 * fewer questions than `count` we simply return what we have — the caller
 * sizes the session to the available pool and the CTA wording on
 * `/decks/[id]` makes "play this deck" semantics clear.
 */
async function pickSoloQuestions(input: {
  categoryFilter: string[] | null;
  deckId?: string | null;
  count: number;
}): Promise<Array<typeof questions.$inferSelect>> {
  const where = [eq(questions.vetted, true), eq(questions.retired, false)];
  if (input.deckId) {
    where.push(eq(questions.deckId, input.deckId));
  }
  if (input.categoryFilter && input.categoryFilter.length > 0) {
    where.push(inArray(questions.category, input.categoryFilter));
  }

  // Order by random(); cheap at this scale (single-digit thousands of rows
  // per category) and keeps variety. For larger pools we'd sample via
  // tablesample + filter.
  const rows = await db
    .select()
    .from(questions)
    .where(and(...where))
    .orderBy(sql`random()`)
    .limit(input.count);

  return rows;
}

/** Shuffled choices for a question. Only the 4 options — no indication of correctness. */
function publicChoices(row: typeof questions.$inferSelect): string[] {
  return shuffle([row.correctAnswer, ...row.wrongAnswers]);
}

export async function startSoloSession(input: {
  playerId: string | null;
  guestId: string | null;
  speed: SoloSpeed;
  questionCount: number;
  categoryFilter: string[] | null;
  /**
   * Optional community-deck id. When set, we only draw vetted questions
   * belonging to this deck. Callers must gate on deck visibility first —
   * `/api/solo/start` checks public/owner before handing the id in.
   */
  deckId?: string | null;
}): Promise<{ sessionId: string; timerSeconds: number; totalQuestions: number }> {
  if (!input.playerId && !input.guestId) {
    throw new Error("Must supply playerId or guestId");
  }
  const count = Math.max(
    MIN_SOLO_QUESTIONS,
    Math.min(MAX_SOLO_QUESTIONS, Math.floor(input.questionCount))
  );
  const timerSeconds = SOLO_SPEEDS[input.speed].seconds;

  const picked = await pickSoloQuestions({
    categoryFilter: input.categoryFilter,
    deckId: input.deckId ?? null,
    count,
  });
  if (picked.length === 0) {
    throw new Error(
      input.deckId
        ? "No vetted questions in this deck yet"
        : "No vetted questions match those filters"
    );
  }

  const [session] = await db
    .insert(soloSessions)
    .values({
      playerId: input.playerId,
      guestId: input.guestId,
      speed: input.speed,
      questionCount: picked.length,
      categoryFilter: input.categoryFilter ?? null,
      timerSeconds,
    })
    .returning({ id: soloSessions.id });

  if (!session) {
    throw new Error("Failed to create solo session");
  }

  await db.insert(soloQuestions).values(
    picked.map((q, idx) => ({
      soloSessionId: session.id,
      questionId: q.id,
      position: idx,
    }))
  );

  return {
    sessionId: session.id,
    timerSeconds,
    totalQuestions: picked.length,
  };
}

/**
 * Verify that `session` is owned by the caller (player id or anon guest id).
 * Throws on mismatch so callers can wrap in a 403.
 */
export function assertSoloOwner(
  session: typeof soloSessions.$inferSelect,
  caller: { playerId: string | null; guestId: string | null }
) {
  if (session.playerId && session.playerId === caller.playerId) return;
  if (session.guestId && session.guestId === caller.guestId) return;
  throw new Error("This solo session belongs to someone else");
}

/**
 * Return the next unanswered question in a solo session (by position), or
 * `null` when the session is complete. On first read, `shown_at_ms` is set
 * so the server can score elapsed time regardless of what the client claims.
 */
export async function loadNextSoloQuestion(
  soloSessionId: string
): Promise<SoloQuestionPublic | null> {
  const sessRows = await db
    .select()
    .from(soloSessions)
    .where(eq(soloSessions.id, soloSessionId))
    .limit(1);
  const session = sessRows[0];
  if (!session) return null;
  if (session.status !== "active") return null;

  const sqRows = await db
    .select()
    .from(soloQuestions)
    .where(
      and(eq(soloQuestions.soloSessionId, soloSessionId), eq(soloQuestions.answered, false))
    )
    .orderBy(soloQuestions.position)
    .limit(1);
  const sq = sqRows[0];
  if (!sq) return null;

  const qRows = await db
    .select()
    .from(questions)
    .where(eq(questions.id, sq.questionId))
    .limit(1);
  const q = qRows[0];
  if (!q) return null;

  let shownAt = sq.shownAtMs ?? null;
  if (!shownAt) {
    shownAt = Date.now();
    await db
      .update(soloQuestions)
      .set({ shownAtMs: shownAt })
      .where(eq(soloQuestions.id, sq.id));
  }

  return {
    id: sq.id,
    position: sq.position,
    body: q.body,
    choices: publicChoices(q),
    category: q.category,
    subcategory: q.subcategory,
    difficulty: q.difficulty,
    timerSeconds: session.timerSeconds,
    shownAtMs: shownAt,
    totalQuestions: session.questionCount,
  };
}

/** Internal helper — not exported. Recompute rolling streak for a solo session. */
async function getSoloStreak(soloSessionId: string): Promise<number> {
  const rows = await db
    .select({ correct: soloQuestions.correct, position: soloQuestions.position })
    .from(soloQuestions)
    .where(
      and(
        eq(soloQuestions.soloSessionId, soloSessionId),
        eq(soloQuestions.answered, true)
      )
    )
    .orderBy(desc(soloQuestions.position))
    .limit(1);
  const last = rows[0];
  if (!last) return 0;
  if (!last.correct) return 0;

  // Walk backwards counting consecutive corrects (bounded to ~25).
  const all = await db
    .select({ correct: soloQuestions.correct, position: soloQuestions.position })
    .from(soloQuestions)
    .where(
      and(
        eq(soloQuestions.soloSessionId, soloSessionId),
        eq(soloQuestions.answered, true)
      )
    )
    .orderBy(desc(soloQuestions.position));

  let streak = 0;
  for (const r of all) {
    if (r.correct) streak++;
    else break;
  }
  return streak;
}

export type SoloAnswerResult = {
  correct: boolean;
  correctAnswer: string;
  pointsAwarded: number;
  streak: number;
  alreadyAnswered: boolean;
  complete: boolean;
  totalScore: number;
  correctCount: number;
  totalQuestions: number;
};

/**
 * Record an answer on a solo question. Scoring uses the server-computed
 * elapsed time between `shown_at_ms` and "now", not whatever the client sent.
 * If the solo session is complete after this answer, XP is awarded and
 * `playerStats` is rolled up (only for authenticated players — guests
 * don't earn XP until they link to an account).
 */
export async function submitSoloAnswer(input: {
  soloSessionId: string;
  positionalSoloQuestionId: string;
  answerGiven: string;
}): Promise<SoloAnswerResult> {
  const sessRows = await db
    .select()
    .from(soloSessions)
    .where(eq(soloSessions.id, input.soloSessionId))
    .limit(1);
  const session = sessRows[0];
  if (!session) throw new Error("Solo session not found");
  if (session.status !== "active") {
    throw new Error("Solo session is not active");
  }

  const sqRows = await db
    .select()
    .from(soloQuestions)
    .where(
      and(
        eq(soloQuestions.id, input.positionalSoloQuestionId),
        eq(soloQuestions.soloSessionId, input.soloSessionId)
      )
    )
    .limit(1);
  const sq = sqRows[0];
  if (!sq) throw new Error("Question not in session");

  if (sq.answered) {
    // Idempotent: return the already-recorded result so the client can resync.
    return {
      alreadyAnswered: true,
      correct: sq.correct,
      correctAnswer: "",
      pointsAwarded: 0,
      streak: 0,
      complete: session.status !== "active",
      totalScore: session.totalScore,
      correctCount: session.correctCount,
      totalQuestions: session.questionCount,
    };
  }

  const qRows = await db
    .select({
      correctAnswer: questions.correctAnswer,
      difficulty: questions.difficulty,
    })
    .from(questions)
    .where(eq(questions.id, sq.questionId))
    .limit(1);
  const correctAnswer = qRows[0]?.correctAnswer ?? "";
  const difficulty = normalizeDifficulty(qRows[0]?.difficulty);
  const isCorrect =
    input.answerGiven.trim().toLowerCase() === correctAnswer.trim().toLowerCase();

  const now = Date.now();
  const shownAt = sq.shownAtMs ?? now;
  const elapsedMs = Math.max(0, now - shownAt);

  const previousStreak = await getSoloStreak(input.soloSessionId);
  const breakdown = computeAnswerPoints({
    isCorrect,
    timeToAnswerMs: elapsedMs,
    timerSeconds: session.timerSeconds,
    previousStreak,
    difficulty,
  });

  await db
    .update(soloQuestions)
    .set({
      answered: true,
      correct: isCorrect,
      answerGiven: input.answerGiven,
      timeToAnswerMs: elapsedMs,
      pointsAwarded: breakdown.points,
    })
    .where(eq(soloQuestions.id, sq.id));

  await db
    .update(soloSessions)
    .set({
      totalScore: sql`${soloSessions.totalScore} + ${breakdown.points}`,
      correctCount: sql`${soloSessions.correctCount} + ${isCorrect ? 1 : 0}`,
    })
    .where(eq(soloSessions.id, input.soloSessionId));

  // Check completeness.
  const remaining = await db
    .select({ id: soloQuestions.id })
    .from(soloQuestions)
    .where(
      and(
        eq(soloQuestions.soloSessionId, input.soloSessionId),
        eq(soloQuestions.answered, false)
      )
    )
    .limit(1);

  let complete = false;
  if (remaining.length === 0) {
    complete = true;
    await db
      .update(soloSessions)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(soloSessions.id, input.soloSessionId));

    if (session.playerId) {
      await rollupSoloForPlayer(session.playerId, input.soloSessionId);
    }
  }

  const latest = await db
    .select({ totalScore: soloSessions.totalScore, correctCount: soloSessions.correctCount })
    .from(soloSessions)
    .where(eq(soloSessions.id, input.soloSessionId))
    .limit(1);

  return {
    alreadyAnswered: false,
    correct: isCorrect,
    correctAnswer,
    pointsAwarded: breakdown.points,
    streak: breakdown.newStreak,
    complete,
    totalScore: latest[0]?.totalScore ?? session.totalScore,
    correctCount: latest[0]?.correctCount ?? session.correctCount,
    totalQuestions: session.questionCount,
  };
}

/**
 * On solo-session completion: write an XP event and roll up `playerStats`.
 * Solo XP = floor(totalScore * 0.5) so hosted play stays more rewarding.
 * Also updates longest-streak and fastest-correct rollups using this session's
 * numbers, keeping the player profile consistent across hosted and solo play.
 */
async function rollupSoloForPlayer(playerId: string, soloSessionId: string) {
  const sessRows = await db
    .select()
    .from(soloSessions)
    .where(eq(soloSessions.id, soloSessionId))
    .limit(1);
  const s = sessRows[0];
  if (!s) return;

  const xpAmount = Math.max(0, Math.floor(s.totalScore * 0.5));

  if (xpAmount > 0) {
    await db.insert(playerXpEvents).values({
      playerId,
      kind: "solo_complete",
      amount: xpAmount,
      soloSessionId,
      note: `Solo ${s.speed} · ${s.correctCount}/${s.questionCount}`,
    });
  }

  // Compute longest streak in this session for rollup.
  const qRows = await db
    .select({ correct: soloQuestions.correct, position: soloQuestions.position })
    .from(soloQuestions)
    .where(eq(soloQuestions.soloSessionId, soloSessionId))
    .orderBy(soloQuestions.position);
  let cur = 0;
  let best = 0;
  let fastest: number | null = null;
  const fastRows = await db
    .select({ timeToAnswerMs: soloQuestions.timeToAnswerMs, correct: soloQuestions.correct })
    .from(soloQuestions)
    .where(eq(soloQuestions.soloSessionId, soloSessionId));
  for (const r of qRows) {
    if (r.correct) {
      cur++;
      best = Math.max(best, cur);
    } else {
      cur = 0;
    }
  }
  for (const r of fastRows) {
    if (r.correct && typeof r.timeToAnswerMs === "number") {
      if (fastest == null || r.timeToAnswerMs < fastest) fastest = r.timeToAnswerMs;
    }
  }

  const existing = await db
    .select()
    .from(playerStats)
    .where(eq(playerStats.playerId, playerId))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(playerStats).values({
      playerId,
      totalAnswered: s.questionCount,
      totalCorrect: s.correctCount,
      totalPoints: s.totalScore,
      totalXp: xpAmount,
      totalGames: 1,
      longestStreak: best,
      fastestCorrectMs: fastest,
      lastPlayedAt: new Date(),
    });
  } else {
    const row = existing[0]!;
    const nextLongest = Math.max(row.longestStreak, best);
    const nextFastest =
      fastest != null
        ? row.fastestCorrectMs == null
          ? fastest
          : Math.min(row.fastestCorrectMs, fastest)
        : row.fastestCorrectMs;
    await db
      .update(playerStats)
      .set({
        totalAnswered: sql`${playerStats.totalAnswered} + ${s.questionCount}`,
        totalCorrect: sql`${playerStats.totalCorrect} + ${s.correctCount}`,
        totalPoints: sql`${playerStats.totalPoints} + ${s.totalScore}`,
        totalXp: sql`${playerStats.totalXp} + ${xpAmount}`,
        totalGames: sql`${playerStats.totalGames} + 1`,
        longestStreak: nextLongest,
        fastestCorrectMs: nextFastest,
        lastPlayedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(playerStats.playerId, playerId));
  }

  // Daily challenge rollup — runs *after* the normal rollup so the XP
  // bonus lands on top of the regular solo XP. Safe to call any time;
  // the helper is a no-op for non-daily solo runs (dateKey is null).
  if (s.dailyChallengeDate) {
    await recordDailyChallengeCompletion({
      playerId,
      soloSessionId,
      dateKey: s.dailyChallengeDate,
    });
  }
}

/**
 * Lightweight recap for the end-of-game / share screen. Includes each
 * question's result so the UI can show a per-question breakdown.
 */
export async function loadSoloRecap(soloSessionId: string) {
  const sessRows = await db
    .select()
    .from(soloSessions)
    .where(eq(soloSessions.id, soloSessionId))
    .limit(1);
  const session = sessRows[0];
  if (!session) return null;

  const rows = await db
    .select({
      position: soloQuestions.position,
      correct: soloQuestions.correct,
      answered: soloQuestions.answered,
      timeToAnswerMs: soloQuestions.timeToAnswerMs,
      pointsAwarded: soloQuestions.pointsAwarded,
      body: questions.body,
      correctAnswer: questions.correctAnswer,
      category: questions.category,
      subcategory: questions.subcategory,
    })
    .from(soloQuestions)
    .innerJoin(questions, eq(questions.id, soloQuestions.questionId))
    .where(eq(soloQuestions.soloSessionId, soloSessionId))
    .orderBy(soloQuestions.position);

  return {
    id: session.id,
    status: session.status,
    speed: session.speed,
    totalScore: session.totalScore,
    correctCount: session.correctCount,
    questionCount: session.questionCount,
    timerSeconds: session.timerSeconds,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    /** Non-null when this solo run was the player's daily challenge attempt. */
    dailyChallengeDate: session.dailyChallengeDate ?? null,
    questions: rows,
    maxScorePerQuestion:
      (session.timerSeconds ?? 15) + Math.max(...Object.values(STREAK_BONUSES)),
  };
}
