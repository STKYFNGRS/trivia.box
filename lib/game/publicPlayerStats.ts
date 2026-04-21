import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  accounts,
  achievementDefinitions,
  answers,
  playerAchievementGrants,
  playerSessions,
  playerStats,
  playerVenues,
  players,
  prizeClaims,
  questions,
  sessionQuestions,
  sessions,
  venueProfiles,
} from "@/lib/db/schema";

/**
 * Shape returned to both the owner dashboard (`/dashboard/player`) and the
 * public profile (`/u/[username]`). The public profile never exposes
 * `claimCode`, so the prize shape here omits it at the type level — every
 * caller reuses the exact same fields.
 *
 * Kept as a single server round-trip of small, indexed queries (8 of them,
 * all on `player_id` keys) so the profile page stays a cheap server
 * component and we don't need to denormalize yet.
 */
export type PublicPlayerStats = {
  player: { id: string; username: string; createdAt: Date };
  gamesPlayed: number;
  totalAnswers: number;
  correctAnswers: number;
  accuracy: number;
  wins: number;
  second: number;
  third: number;
  bestCategory: string;
  venuesVisited: number;
  lastSession: { joinedAt: Date; score: number; rank: number | null } | null;
  rollup: {
    totalXp: number;
    totalPoints: number;
    longestStreak: number;
    bestRank: number | null;
    fastestCorrectMs: number | null;
    totalGames: number;
    totalCorrect: number;
    dailyStreak: number;
    longestDailyStreak: number;
    lastDailyPlayDate: string | null;
  };
  achievements: {
    slug: string;
    title: string;
    description: string | null;
    icon: string | null;
    earnedAt: Date;
  }[];
  prizes: {
    prizeLabel: string;
    venueName: string;
    finalRank: number;
    status: string;
    expiresAt: Date | null;
    createdAt: Date;
  }[];
  recentGames: {
    sessionId: string;
    status: string;
    eventStartsAt: Date | null;
    score: number | null;
    rank: number | null;
    venueSlug: string | null;
    venueName: string | null;
  }[];
};

export async function getPublicPlayerStats(
  username: string,
): Promise<PublicPlayerStats | null> {
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

  const rollupRows = await db
    .select({
      totalXp: playerStats.totalXp,
      totalPoints: playerStats.totalPoints,
      longestStreak: playerStats.longestStreak,
      bestRank: playerStats.bestRank,
      fastestCorrectMs: playerStats.fastestCorrectMs,
      totalGames: playerStats.totalGames,
      totalCorrect: playerStats.totalCorrect,
      dailyStreak: playerStats.dailyStreak,
      longestDailyStreak: playerStats.longestDailyStreak,
      lastDailyPlayDate: playerStats.lastDailyPlayDate,
    })
    .from(playerStats)
    .where(eq(playerStats.playerId, player.id))
    .limit(1);
  const rollupRow = rollupRows[0];

  // Derive the *display* daily streak — a stored streak is only "alive"
  // until the end of the day after `lastDailyPlayDate`. If the player
  // missed yesterday, the flame is visually cold even though the stored
  // number waits for their next completion to reset.
  const todayKey = new Date().toISOString().slice(0, 10);
  let displayDailyStreak = rollupRow?.dailyStreak ?? 0;
  if (rollupRow?.lastDailyPlayDate) {
    const lastMs = Date.parse(rollupRow.lastDailyPlayDate + "T00:00:00Z");
    const todayMs = Date.parse(todayKey + "T00:00:00Z");
    const diff = Math.round((todayMs - lastMs) / (24 * 60 * 60 * 1000));
    if (diff > 1) displayDailyStreak = 0;
  } else {
    displayDailyStreak = 0;
  }

  const rollup = {
    totalXp: Number(rollupRow?.totalXp ?? 0),
    totalPoints: Number(rollupRow?.totalPoints ?? 0),
    longestStreak: rollupRow?.longestStreak ?? 0,
    bestRank: rollupRow?.bestRank ?? null,
    fastestCorrectMs: rollupRow?.fastestCorrectMs ?? null,
    totalGames: rollupRow?.totalGames ?? gamesPlayed,
    totalCorrect: rollupRow?.totalCorrect ?? correctAnswers,
    dailyStreak: displayDailyStreak,
    longestDailyStreak: rollupRow?.longestDailyStreak ?? 0,
    lastDailyPlayDate: rollupRow?.lastDailyPlayDate ?? null,
  };

  const achievementRows = await db
    .select({
      slug: achievementDefinitions.slug,
      title: achievementDefinitions.title,
      description: achievementDefinitions.description,
      icon: achievementDefinitions.icon,
      earnedAt: playerAchievementGrants.earnedAt,
    })
    .from(playerAchievementGrants)
    .innerJoin(
      achievementDefinitions,
      eq(achievementDefinitions.id, playerAchievementGrants.achievementId),
    )
    .where(eq(playerAchievementGrants.playerId, player.id))
    .orderBy(desc(playerAchievementGrants.earnedAt));

  // Public surfaces never read `claimCode` — we stop the field at the DB
  // boundary by not selecting it. If anyone ever tries to render a code
  // on the public profile, TypeScript will fail first.
  const prizeRows = await db
    .select({
      prizeLabel: prizeClaims.prizeLabel,
      venueName: accounts.name,
      finalRank: prizeClaims.finalRank,
      status: prizeClaims.status,
      expiresAt: prizeClaims.expiresAt,
      createdAt: prizeClaims.createdAt,
    })
    .from(prizeClaims)
    .innerJoin(accounts, eq(accounts.id, prizeClaims.venueAccountId))
    .where(eq(prizeClaims.playerId, player.id))
    .orderBy(desc(prizeClaims.createdAt))
    .limit(24);

  const recentGameRows = await db
    .select({
      sessionId: sessions.id,
      status: sessions.status,
      eventStartsAt: sessions.eventStartsAt,
      score: playerSessions.score,
      rank: playerSessions.rank,
      venueSlug: venueProfiles.slug,
      venueDisplayName: venueProfiles.displayName,
      venueName: accounts.name,
    })
    .from(playerSessions)
    .innerJoin(sessions, eq(sessions.id, playerSessions.sessionId))
    .innerJoin(accounts, eq(accounts.id, sessions.venueAccountId))
    .leftJoin(venueProfiles, eq(venueProfiles.accountId, sessions.venueAccountId))
    .where(eq(playerSessions.playerId, player.id))
    .orderBy(desc(playerSessions.joinedAt))
    .limit(10);

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
    rollup,
    achievements: achievementRows,
    prizes: prizeRows,
    recentGames: recentGameRows.map((g) => ({
      sessionId: g.sessionId,
      status: g.status,
      eventStartsAt: g.eventStartsAt,
      score: g.score,
      rank: g.rank,
      venueSlug: g.venueSlug,
      venueName: g.venueDisplayName ?? g.venueName,
    })),
  };
}
