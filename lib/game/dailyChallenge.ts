import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  dailyChallenges,
  playerStats,
  playerXpEvents,
  questions,
  soloQuestions,
  soloSessions,
} from "@/lib/db/schema";

/**
 * Daily challenge + daily-play streak.
 *
 * The daily challenge is a *single global* 5-question run — identical for
 * every player in the same UTC day. That makes it cheap to share and to
 * rank: "you scored 42 on April 19 — here's how everyone else did." We
 * pick 5 vetted, non-retired questions with a balanced 2 easy / 2 medium
 * / 1 hard split (degrading gracefully if any tier is empty).
 *
 * The row for the day is seeded idempotently. In production we call
 * `ensureTodayDailyChallenge()` from the `house-games/tick` cron (same
 * cron, one extra query) and *also* lazily on first read so a missed
 * cron tick never blocks a player.
 *
 * Completion flow re-uses the existing solo pipeline: we create a
 * regular `solo_sessions` row with `dailyChallengeDate` set, drop the
 * five questions into `solo_questions`, and let `submitSoloAnswer` /
 * `rollupSoloForPlayer` do their thing. When the run completes, the
 * caller invokes `recordDailyChallengeCompletion` (wired inside
 * `rollupSoloForPlayer`) to bump `player_stats.daily_streak` +
 * `longest_daily_streak` + `last_daily_play_date`.
 */

export const DAILY_CHALLENGE_QUESTION_COUNT = 5;
/** Shared timer for the daily challenge — middle-of-the-road "standard". */
export const DAILY_CHALLENGE_TIMER_SECONDS = 15;

/** Returns the "YYYY-MM-DD" UTC day for `d`. Stable across tz boundaries. */
export function toUtcDateString(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export type DailyChallengeRow = {
  challengeDate: string;
  questionIds: string[];
  createdAt: Date;
};

async function pickBalancedQuestions(): Promise<string[]> {
  // 2 easy (d=1), 2 medium (d=2), 1 hard (d=3). If a tier is light we
  // top the remaining slots up from the full pool so the day still has
  // exactly 5 questions. Never errors out even on a near-empty corpus.
  const picks: string[] = [];
  const tiers: Array<{ difficulty: number; count: number }> = [
    { difficulty: 1, count: 2 },
    { difficulty: 2, count: 2 },
    { difficulty: 3, count: 1 },
  ];

  for (const tier of tiers) {
    const rows = await db
      .select({ id: questions.id })
      .from(questions)
      .where(
        and(
          eq(questions.vetted, true),
          eq(questions.retired, false),
          eq(questions.difficulty, tier.difficulty),
        ),
      )
      .orderBy(sql`random()`)
      .limit(tier.count);
    for (const r of rows) picks.push(r.id);
  }

  if (picks.length < DAILY_CHALLENGE_QUESTION_COUNT) {
    const fill = await db
      .select({ id: questions.id })
      .from(questions)
      .where(and(eq(questions.vetted, true), eq(questions.retired, false)))
      .orderBy(sql`random()`)
      .limit(DAILY_CHALLENGE_QUESTION_COUNT * 2);
    for (const r of fill) {
      if (picks.length >= DAILY_CHALLENGE_QUESTION_COUNT) break;
      if (!picks.includes(r.id)) picks.push(r.id);
    }
  }

  return picks.slice(0, DAILY_CHALLENGE_QUESTION_COUNT);
}

/**
 * Look up (or create) today's daily challenge. Safe to call from any
 * request path — the insert is a single `ON CONFLICT DO NOTHING` so
 * concurrent callers can't create two rows for the same day.
 */
export async function ensureTodayDailyChallenge(
  now: Date = new Date(),
): Promise<DailyChallengeRow> {
  const dateKey = toUtcDateString(now);

  const existing = await db
    .select()
    .from(dailyChallenges)
    .where(eq(dailyChallenges.challengeDate, dateKey))
    .limit(1);
  if (existing[0]) return existing[0];

  const questionIds = await pickBalancedQuestions();
  if (questionIds.length === 0) {
    throw new Error("No vetted questions available to seed daily challenge");
  }

  await db
    .insert(dailyChallenges)
    .values({ challengeDate: dateKey, questionIds })
    .onConflictDoNothing({ target: dailyChallenges.challengeDate });

  const reread = await db
    .select()
    .from(dailyChallenges)
    .where(eq(dailyChallenges.challengeDate, dateKey))
    .limit(1);
  const row = reread[0];
  if (!row) {
    throw new Error("Failed to seed or read daily challenge");
  }
  return row;
}

/**
 * Has this player already taken today's daily challenge? Returns the
 * completed solo session id if they have, else null. Prevents the
 * `/play/daily` CTA from double-starting a run.
 */
export async function getPlayerDailyAttempt(
  playerId: string,
  dateKey: string,
): Promise<{ soloSessionId: string; status: string } | null> {
  const rows = await db
    .select({ id: soloSessions.id, status: soloSessions.status })
    .from(soloSessions)
    .where(
      and(
        eq(soloSessions.playerId, playerId),
        eq(soloSessions.dailyChallengeDate, dateKey),
      ),
    )
    .orderBy(sql`${soloSessions.startedAt} desc`)
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { soloSessionId: row.id, status: row.status };
}

/**
 * Create a solo session whose questions come from today's daily
 * challenge. Refuses to start if the (signed-in) player has already
 * taken today's attempt.
 *
 * Mirrors `startSoloSession` at the return shape so the existing
 * `/play/solo/[id]` UI can drive the run with no changes.
 */
export async function startDailyChallengeSession(input: {
  playerId: string | null;
  guestId: string | null;
  now?: Date;
}): Promise<{
  sessionId: string;
  timerSeconds: number;
  totalQuestions: number;
  alreadyStarted: boolean;
}> {
  if (!input.playerId && !input.guestId) {
    throw new Error("Must supply playerId or guestId");
  }
  const now = input.now ?? new Date();
  const challenge = await ensureTodayDailyChallenge(now);

  if (input.playerId) {
    const prior = await getPlayerDailyAttempt(input.playerId, challenge.challengeDate);
    if (prior) {
      return {
        sessionId: prior.soloSessionId,
        timerSeconds: DAILY_CHALLENGE_TIMER_SECONDS,
        totalQuestions: DAILY_CHALLENGE_QUESTION_COUNT,
        alreadyStarted: true,
      };
    }
  }

  const qRows = await db
    .select({ id: questions.id })
    .from(questions)
    .where(inArray(questions.id, challenge.questionIds));
  const orderedIds = challenge.questionIds.filter((id) =>
    qRows.some((q) => q.id === id),
  );
  if (orderedIds.length === 0) {
    throw new Error("Daily challenge questions are missing from the pool");
  }

  const [session] = await db
    .insert(soloSessions)
    .values({
      playerId: input.playerId,
      guestId: input.guestId,
      speed: "standard",
      questionCount: orderedIds.length,
      categoryFilter: null,
      timerSeconds: DAILY_CHALLENGE_TIMER_SECONDS,
      dailyChallengeDate: challenge.challengeDate,
    })
    .returning({ id: soloSessions.id });

  if (!session) {
    throw new Error("Failed to create daily challenge session");
  }

  await db.insert(soloQuestions).values(
    orderedIds.map((questionId, idx) => ({
      soloSessionId: session.id,
      questionId,
      position: idx,
    })),
  );

  return {
    sessionId: session.id,
    timerSeconds: DAILY_CHALLENGE_TIMER_SECONDS,
    totalQuestions: orderedIds.length,
    alreadyStarted: false,
  };
}

/**
 * Called from the solo rollup once a daily-challenge run finishes. Bumps
 * the player's `player_stats.daily_streak`:
 *
 *  - First play ever → streak = 1.
 *  - Played yesterday (UTC) → streak += 1.
 *  - Otherwise (gap ≥ 2 days, or already played today) → clamp to 1.
 *
 * Also updates `longest_daily_streak` and writes a small XP bonus event
 * so the activity feed shows "🔥 Daily streak bonus" on the profile.
 */
export async function recordDailyChallengeCompletion(input: {
  playerId: string;
  soloSessionId: string;
  dateKey: string;
}): Promise<{ dailyStreak: number; longestDailyStreak: number; xpBonus: number }> {
  const rows = await db
    .select({
      lastDailyPlayDate: playerStats.lastDailyPlayDate,
      dailyStreak: playerStats.dailyStreak,
      longestDailyStreak: playerStats.longestDailyStreak,
    })
    .from(playerStats)
    .where(eq(playerStats.playerId, input.playerId))
    .limit(1);
  const row = rows[0];

  let nextStreak = 1;
  const today = input.dateKey;
  if (row) {
    if (row.lastDailyPlayDate === today) {
      nextStreak = row.dailyStreak;
    } else if (row.lastDailyPlayDate) {
      const lastMs = Date.parse(row.lastDailyPlayDate + "T00:00:00Z");
      const todayMs = Date.parse(today + "T00:00:00Z");
      const diffDays = Math.round((todayMs - lastMs) / (24 * 60 * 60 * 1000));
      nextStreak = diffDays === 1 ? row.dailyStreak + 1 : 1;
    } else {
      nextStreak = 1;
    }
  }

  const nextLongest = Math.max(row?.longestDailyStreak ?? 0, nextStreak);
  // XP bonus rewards consistency — capped at 50/day (streak 10+ nets a flat 50).
  const xpBonus = Math.min(50, nextStreak * 5);

  if (row) {
    await db
      .update(playerStats)
      .set({
        dailyStreak: nextStreak,
        longestDailyStreak: nextLongest,
        lastDailyPlayDate: today,
        updatedAt: new Date(),
      })
      .where(eq(playerStats.playerId, input.playerId));
  } else {
    await db.insert(playerStats).values({
      playerId: input.playerId,
      dailyStreak: nextStreak,
      longestDailyStreak: nextLongest,
      lastDailyPlayDate: today,
    });
  }

  if (xpBonus > 0) {
    await db.insert(playerXpEvents).values({
      playerId: input.playerId,
      kind: "daily_streak",
      amount: xpBonus,
      soloSessionId: input.soloSessionId,
      note: `Daily streak × ${nextStreak}`,
    });
    await db
      .update(playerStats)
      .set({
        totalXp: sql`${playerStats.totalXp} + ${xpBonus}`,
        updatedAt: new Date(),
      })
      .where(eq(playerStats.playerId, input.playerId));
  }

  return {
    dailyStreak: nextStreak,
    longestDailyStreak: nextLongest,
    xpBonus,
  };
}

/**
 * Read helper for the flame pills / "come back tomorrow" nudges.
 * Returns a *derived* currentStreak — if the player hasn't played today
 * *or* yesterday, the stored streak is considered broken for display
 * purposes (stored value stays stable until the next completion).
 */
export async function getDailyStreak(
  playerId: string,
  now: Date = new Date(),
): Promise<{
  current: number;
  longest: number;
  playedToday: boolean;
  lastPlayDate: string | null;
}> {
  const rows = await db
    .select({
      dailyStreak: playerStats.dailyStreak,
      longestDailyStreak: playerStats.longestDailyStreak,
      lastDailyPlayDate: playerStats.lastDailyPlayDate,
    })
    .from(playerStats)
    .where(eq(playerStats.playerId, playerId))
    .limit(1);
  const row = rows[0];

  if (!row) {
    return { current: 0, longest: 0, playedToday: false, lastPlayDate: null };
  }

  const today = toUtcDateString(now);
  const last = row.lastDailyPlayDate;
  let displayCurrent = row.dailyStreak;
  if (last) {
    const lastMs = Date.parse(last + "T00:00:00Z");
    const todayMs = Date.parse(today + "T00:00:00Z");
    const diffDays = Math.round((todayMs - lastMs) / (24 * 60 * 60 * 1000));
    if (diffDays > 1) displayCurrent = 0;
  } else {
    displayCurrent = 0;
  }

  return {
    current: displayCurrent,
    longest: row.longestDailyStreak,
    playedToday: last === today,
    lastPlayDate: last,
  };
}
