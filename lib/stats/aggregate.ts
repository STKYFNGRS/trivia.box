import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  accounts,
  answers,
  playerSessions,
  playerStats,
  players,
  questions,
  sessionQuestions,
  sessions,
  venueProfiles,
} from "@/lib/db/schema";

/**
 * Cross-session, cross-venue rollups used by the public `/leaderboards` and
 * `/api/stats/global` endpoints. Queries are kept to the rollup tables
 * (`player_stats`, `player_sessions`) plus a few lightweight aggregates so
 * the page stays responsive without a materialized view in this pass.
 */

export type GlobalStatsSnapshot = {
  totals: {
    completedGames: number;
    activeGames: number;
    totalPlayers: number;
    totalAnswers: number;
  };
  topCategories: Array<{ category: string; attempts: number; accuracy: number }>;
  topPlayers: Array<{
    username: string;
    totalPoints: number;
    totalGames: number;
    totalCorrect: number;
    totalAnswered: number;
    bestRank: number | null;
  }>;
};

export async function getGlobalStats(): Promise<GlobalStatsSnapshot> {
  const [completed] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sessions)
    .where(eq(sessions.status, "completed"));
  const [active] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sessions)
    .where(eq(sessions.status, "active"));
  const [totalPlayers] = await db.select({ n: sql<number>`count(*)::int` }).from(players);
  const [totalAnswers] = await db.select({ n: sql<number>`count(*)::int` }).from(answers);

  const topCategoryRows = await db
    .select({
      category: questions.category,
      attempts: sql<number>`count(*)::int`,
      correct: sql<number>`sum(case when ${answers.isCorrect} then 1 else 0 end)::int`,
    })
    .from(answers)
    .innerJoin(sessionQuestions, eq(sessionQuestions.id, answers.sessionQuestionId))
    .innerJoin(questions, eq(questions.id, sessionQuestions.questionId))
    .groupBy(questions.category)
    .having(sql`count(*) >= 20`)
    .orderBy(desc(sql`count(*)`))
    .limit(12);

  const topCategories = topCategoryRows.map((r) => ({
    category: r.category,
    attempts: Number(r.attempts),
    accuracy:
      Number(r.attempts) === 0 ? 0 : Math.round((Number(r.correct) / Number(r.attempts)) * 1000) / 10,
  }));

  // Top players by lifetime points from the rollup table; avoids scanning all answers.
  const topPlayers = await db
    .select({
      username: players.username,
      totalPoints: playerStats.totalPoints,
      totalGames: playerStats.totalGames,
      totalCorrect: playerStats.totalCorrect,
      totalAnswered: playerStats.totalAnswered,
      bestRank: playerStats.bestRank,
    })
    .from(playerStats)
    .innerJoin(players, eq(players.id, playerStats.playerId))
    .orderBy(desc(playerStats.totalPoints))
    .limit(100);

  return {
    totals: {
      completedGames: completed?.n ?? 0,
      activeGames: active?.n ?? 0,
      totalPlayers: totalPlayers?.n ?? 0,
      totalAnswers: totalAnswers?.n ?? 0,
    },
    topCategories,
    topPlayers: topPlayers.map((r) => ({
      username: r.username,
      totalPoints: Number(r.totalPoints ?? 0),
      totalGames: r.totalGames,
      totalCorrect: r.totalCorrect,
      totalAnswered: r.totalAnswered,
      bestRank: r.bestRank,
    })),
  };
}

export type VenueStatsSnapshot = {
  venue: {
    slug: string;
    displayName: string;
    hasImage: boolean;
    imageUpdatedAt: Date | null;
  };
  totals: {
    completedGames: number;
    uniquePlayers: number;
    totalAnswers: number;
    averageScore: number;
  };
  topCategories: Array<{ category: string; attempts: number; accuracy: number }>;
  topPlayers: Array<{ username: string; totalScore: number; games: number; bestRank: number | null }>;
  recentSessions: Array<{
    sessionId: string;
    status: string;
    eventStartsAt: Date;
    playerCount: number;
  }>;
};

export async function getVenueStats(venueAccountId: string): Promise<VenueStatsSnapshot | null> {
  const [profile] = await db
    .select()
    .from(venueProfiles)
    .where(eq(venueProfiles.accountId, venueAccountId))
    .limit(1);
  if (!profile) return null;

  const [completed] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sessions)
    .where(and(eq(sessions.venueAccountId, venueAccountId), eq(sessions.status, "completed")));
  const [uniquePlayers] = await db
    .select({ n: sql<number>`count(distinct ${playerSessions.playerId})::int` })
    .from(playerSessions)
    .where(eq(playerSessions.venueAccountId, venueAccountId));
  const [totalAnswers] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(answers)
    .innerJoin(sessionQuestions, eq(sessionQuestions.id, answers.sessionQuestionId))
    .innerJoin(sessions, eq(sessions.id, sessionQuestions.sessionId))
    .where(eq(sessions.venueAccountId, venueAccountId));
  const [avgScore] = await db
    .select({ avg: sql<number>`coalesce(avg(${playerSessions.score}), 0)::float` })
    .from(playerSessions)
    .where(eq(playerSessions.venueAccountId, venueAccountId));

  const topCategoryRows = await db
    .select({
      category: questions.category,
      attempts: sql<number>`count(*)::int`,
      correct: sql<number>`sum(case when ${answers.isCorrect} then 1 else 0 end)::int`,
    })
    .from(answers)
    .innerJoin(sessionQuestions, eq(sessionQuestions.id, answers.sessionQuestionId))
    .innerJoin(sessions, eq(sessions.id, sessionQuestions.sessionId))
    .innerJoin(questions, eq(questions.id, sessionQuestions.questionId))
    .where(eq(sessions.venueAccountId, venueAccountId))
    .groupBy(questions.category)
    .orderBy(desc(sql`count(*)`))
    .limit(8);

  const topPlayers = await db
    .select({
      username: players.username,
      totalScore: sql<number>`coalesce(sum(${playerSessions.score}), 0)::int`,
      games: sql<number>`count(*)::int`,
      bestRank: sql<number | null>`min(${playerSessions.rank})`,
    })
    .from(playerSessions)
    .innerJoin(players, eq(players.id, playerSessions.playerId))
    .where(eq(playerSessions.venueAccountId, venueAccountId))
    .groupBy(players.username)
    .orderBy(desc(sql`sum(${playerSessions.score})`))
    .limit(50);

  const recentSessions = await db
    .select({
      sessionId: sessions.id,
      status: sessions.status,
      eventStartsAt: sessions.eventStartsAt,
      playerCount: sql<number>`(select count(*) from ${playerSessions} ps where ps.session_id = ${sessions.id})::int`,
    })
    .from(sessions)
    .where(and(eq(sessions.venueAccountId, venueAccountId), eq(sessions.status, "completed")))
    .orderBy(desc(sessions.eventStartsAt))
    .limit(15);

  return {
    venue: {
      slug: profile.slug,
      displayName: profile.displayName,
      hasImage: Boolean(profile.imageBytes),
      imageUpdatedAt: profile.imageUpdatedAt,
    },
    totals: {
      completedGames: completed?.n ?? 0,
      uniquePlayers: uniquePlayers?.n ?? 0,
      totalAnswers: totalAnswers?.n ?? 0,
      averageScore: Math.round(Number(avgScore?.avg ?? 0)),
    },
    topCategories: topCategoryRows.map((r) => ({
      category: r.category,
      attempts: Number(r.attempts),
      accuracy:
        Number(r.attempts) === 0
          ? 0
          : Math.round((Number(r.correct) / Number(r.attempts)) * 1000) / 10,
    })),
    topPlayers: topPlayers.map((r) => ({
      username: r.username,
      totalScore: Number(r.totalScore),
      games: Number(r.games),
      bestRank: r.bestRank ?? null,
    })),
    recentSessions: recentSessions.map((r) => ({
      sessionId: r.sessionId,
      status: r.status,
      eventStartsAt: r.eventStartsAt,
      playerCount: Number(r.playerCount),
    })),
  };
}

/**
 * Tier 2.E — time-scoped global leaderboard.
 *
 * Lifetime ranks from `player_stats` hide fresh talent behind power users
 * who have been grinding for months. To give daily/weekly visitors a
 * reason to come back, we roll up `answers.points_awarded` inside a
 * window (24h / 7d) and group by player.
 *
 * Uses `answers` rather than `player_sessions` so solo play counts too —
 * keeps the scoped ladder honest for players who mostly play `/play/daily`.
 * The `null` scope path falls back to the existing lifetime rollup.
 */
export type LeaderboardScope = "today" | "week" | "season" | "all";

export type ScopedLeaderboardRow = {
  username: string;
  playerId: string;
  totalPoints: number;
  totalCorrect: number;
  totalAnswered: number;
};

export type ScopedLeaderboard = {
  scope: LeaderboardScope;
  /** Window start used by the query — `null` for lifetime. */
  since: Date | null;
  rows: ScopedLeaderboardRow[];
};

async function scopeWindowStart(
  scope: LeaderboardScope,
  now = new Date()
): Promise<{ since: Date | null; label?: string }> {
  if (scope === "today")
    return { since: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
  if (scope === "week")
    return { since: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
  if (scope === "season") {
    // Dynamic import avoids a circular dep with `lib/seasons.ts` at module
    // load time (seasons table lives in the shared schema module too).
    const { ensureCurrentSeason } = await import("@/lib/seasons");
    const season = await ensureCurrentSeason(now);
    return { since: season.startsAt, label: season.label };
  }
  return { since: null };
}

export async function getScopedLeaderboard(
  scope: LeaderboardScope,
  limit = 100
): Promise<ScopedLeaderboard> {
  const { since } = await scopeWindowStart(scope);

  if (since == null) {
    // "All-time": keep using the denormalized rollup to avoid scanning the
    // full answers table on every page hit.
    const rows = await db
      .select({
        username: players.username,
        playerId: playerStats.playerId,
        totalPoints: playerStats.totalPoints,
        totalCorrect: playerStats.totalCorrect,
        totalAnswered: playerStats.totalAnswered,
      })
      .from(playerStats)
      .innerJoin(players, eq(players.id, playerStats.playerId))
      .orderBy(desc(playerStats.totalPoints))
      .limit(limit);
    return {
      scope,
      since,
      rows: rows.map((r) => ({
        username: r.username,
        playerId: r.playerId,
        totalPoints: Number(r.totalPoints ?? 0),
        totalCorrect: r.totalCorrect,
        totalAnswered: r.totalAnswered,
      })),
    };
  }

  const rows = await db
    .select({
      username: players.username,
      playerId: players.id,
      totalPoints: sql<number>`sum(${answers.pointsAwarded})::int`,
      totalCorrect: sql<number>`sum(case when ${answers.isCorrect} then 1 else 0 end)::int`,
      totalAnswered: sql<number>`count(*)::int`,
    })
    .from(answers)
    .innerJoin(players, eq(players.id, answers.playerId))
    .where(
      and(
        gte(answers.createdAt, since),
        sql`${answers.disqualifiedAt} is null`
      )
    )
    .groupBy(players.id, players.username)
    .orderBy(desc(sql`sum(${answers.pointsAwarded})`))
    .limit(limit);

  return {
    scope,
    since,
    rows: rows.map((r) => ({
      username: r.username,
      playerId: r.playerId,
      totalPoints: Number(r.totalPoints ?? 0),
      totalCorrect: Number(r.totalCorrect ?? 0),
      totalAnswered: Number(r.totalAnswered ?? 0),
    })),
  };
}

/**
 * Compute a single viewer's rank + score in a given scope. Used by the
 * "You rank #N" chip on `/leaderboards` — we don't want to page through
 * all 100 results to find the viewer, and ranks can be ≥ 100 anyway.
 *
 * Returns `null` when the player has no activity in-window (so we hide
 * the chip instead of saying "You rank #–").
 */
export async function getScopedPlayerRank(
  scope: LeaderboardScope,
  playerId: string
): Promise<{ rank: number; totalPoints: number } | null> {
  const { since } = await scopeWindowStart(scope);

  if (since == null) {
    const [self] = await db
      .select({ totalPoints: playerStats.totalPoints })
      .from(playerStats)
      .where(eq(playerStats.playerId, playerId))
      .limit(1);
    if (!self) return null;
    const points = Number(self.totalPoints ?? 0);
    if (points <= 0) return null;
    const [ahead] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(playerStats)
      .where(sql`${playerStats.totalPoints} > ${points}`);
    return { rank: (ahead?.n ?? 0) + 1, totalPoints: points };
  }

  // Scoped: self score from in-window answers, then count players with a
  // strictly higher in-window total. One extra aggregate round-trip is
  // cheaper than paging through the whole leaderboard.
  const [self] = await db
    .select({
      totalPoints: sql<number>`coalesce(sum(${answers.pointsAwarded}), 0)::int`,
    })
    .from(answers)
    .where(
      and(
        eq(answers.playerId, playerId),
        gte(answers.createdAt, since),
        sql`${answers.disqualifiedAt} is null`
      )
    );
  const points = Number(self?.totalPoints ?? 0);
  if (points <= 0) return null;

  const perPlayer = db
    .select({
      playerId: answers.playerId,
      totalPoints: sql<number>`sum(${answers.pointsAwarded})::int`.as(
        "total_points"
      ),
    })
    .from(answers)
    .where(
      and(
        gte(answers.createdAt, since),
        sql`${answers.disqualifiedAt} is null`
      )
    )
    .groupBy(answers.playerId)
    .as("per_player");

  const [ahead] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(perPlayer)
    .where(sql`${perPlayer.totalPoints} > ${points}`);
  return { rank: (ahead?.n ?? 0) + 1, totalPoints: points };
}

/**
 * Host-only ops view: all public stats plus a funnel of pending vs launched
 * sessions, average fill, swap rate. Useful for the host dashboard to see
 * operational health of their venue.
 */
export async function getHostVenueOpsStats(venueAccountId: string) {
  const [pending] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sessions)
    .where(and(eq(sessions.venueAccountId, venueAccountId), eq(sessions.status, "pending")));
  const [active] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sessions)
    .where(and(eq(sessions.venueAccountId, venueAccountId), eq(sessions.status, "active")));
  const [completed] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sessions)
    .where(and(eq(sessions.venueAccountId, venueAccountId), eq(sessions.status, "completed")));
  // A "no-show" is a session that was never launched past its start time + 3h
  // (matches `LAUNCH_LATE_MS` in launchSession). Kept simple here: count
  // pending sessions whose event has passed.
  const [noShows] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sessions)
    .where(
      and(
        eq(sessions.venueAccountId, venueAccountId),
        eq(sessions.status, "pending"),
        sql`${sessions.eventStartsAt} < now()`
      )
    );
  const [avgFill] = await db
    .select({
      avg: sql<number>`coalesce(avg((select count(*) from ${playerSessions} ps where ps.session_id = ${sessions.id})), 0)::float`,
    })
    .from(sessions)
    .where(and(eq(sessions.venueAccountId, venueAccountId), eq(sessions.status, "completed")));

  // Identity import used implicitly in correlated subquery above.
  void accounts;

  return {
    sessionFunnel: {
      pending: pending?.n ?? 0,
      active: active?.n ?? 0,
      completed: completed?.n ?? 0,
      noShows: noShows?.n ?? 0,
    },
    averagePlayersPerGame: Math.round(Number(avgFill?.avg ?? 0) * 10) / 10,
  };
}
