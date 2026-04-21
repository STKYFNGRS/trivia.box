import { auth } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import {
  accounts,
  playerSessions,
  playerStats,
  sessions,
  venueProfiles,
} from "@/lib/db/schema";
import { listPlayerAchievements } from "@/lib/game/achievements";
import { getPlayerByAccountId } from "@/lib/players";
import { xpToLevel } from "@/lib/xp";

/**
 * GET /api/me/player/stats
 *
 * Returns the denormalized `player_stats` rollup, recent sessions joined to
 * their venues, and earned achievements. Powers the player dashboard.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const account = await getAccountByClerkUserId(userId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  const player = await getPlayerByAccountId(account.id);
  if (!player) {
    return NextResponse.json({ error: "Player profile missing" }, { status: 404 });
  }

  const statsRows = await db
    .select()
    .from(playerStats)
    .where(eq(playerStats.playerId, player.id))
    .limit(1);
  const stats = statsRows[0] ?? null;

  const recent = await db
    .select({
      sessionId: sessions.id,
      joinCode: sessions.joinCode,
      status: sessions.status,
      eventStartsAt: sessions.eventStartsAt,
      score: playerSessions.score,
      rank: playerSessions.rank,
      joinedAt: playerSessions.joinedAt,
      venueDisplayName: venueProfiles.displayName,
      venueSlug: venueProfiles.slug,
      venueName: accounts.name,
    })
    .from(playerSessions)
    .innerJoin(sessions, eq(sessions.id, playerSessions.sessionId))
    .innerJoin(accounts, eq(accounts.id, sessions.venueAccountId))
    .leftJoin(venueProfiles, eq(venueProfiles.accountId, sessions.venueAccountId))
    .where(eq(playerSessions.playerId, player.id))
    .orderBy(desc(playerSessions.joinedAt))
    .limit(10);

  const achievements = await listPlayerAchievements(player.id);

  return NextResponse.json({
    player: {
      id: player.id,
      username: player.username,
    },
    stats: stats
      ? (() => {
          const totalXp = Number(stats.totalXp ?? 0);
          // `xpToLevel` is the canonical curve (`XpLevelBadge` uses it too)
          // — including the derived shape here means clients can render a
          // level pill without re-implementing the math.
          const level = xpToLevel(totalXp);
          // Same "display streak only if still warm" logic as
          // `publicPlayerStats` — a gap ≥ 2 days means the flame is cold
          // until they play the next daily.
          const todayKey = new Date().toISOString().slice(0, 10);
          let displayDailyStreak = stats.dailyStreak ?? 0;
          if (stats.lastDailyPlayDate) {
            const diff = Math.round(
              (Date.parse(todayKey + "T00:00:00Z") -
                Date.parse(stats.lastDailyPlayDate + "T00:00:00Z")) /
                (24 * 60 * 60 * 1000),
            );
            if (diff > 1) displayDailyStreak = 0;
          } else {
            displayDailyStreak = 0;
          }
          return {
            totalAnswered: stats.totalAnswered,
            totalCorrect: stats.totalCorrect,
            totalPoints: Number(stats.totalPoints ?? 0),
            totalXp,
            totalGames: stats.totalGames,
            bestRank: stats.bestRank,
            longestStreak: stats.longestStreak,
            fastestCorrectMs: stats.fastestCorrectMs,
            lastPlayedAt: stats.lastPlayedAt,
            level: level.level,
            levelProgress: level.progress,
            xpIntoLevel: level.current,
            xpNeededForLevel: level.needed,
            dailyStreak: displayDailyStreak,
            longestDailyStreak: stats.longestDailyStreak ?? 0,
            lastDailyPlayDate: stats.lastDailyPlayDate,
          };
        })()
      : null,
    recentSessions: recent.map((r) => ({
      sessionId: r.sessionId,
      joinCode: r.joinCode,
      status: r.status,
      eventStartsAt: r.eventStartsAt,
      score: r.score,
      rank: r.rank,
      joinedAt: r.joinedAt,
      venue: {
        displayName: r.venueDisplayName ?? r.venueName,
        slug: r.venueSlug,
      },
    })),
    achievements,
  });
}
