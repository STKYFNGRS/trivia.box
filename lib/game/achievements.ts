import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  accounts,
  achievementDefinitions,
  answers,
  playerAchievementGrants,
  playerSessions,
  playerStats,
  questions,
  sessionQuestions,
  sessions,
  venueProfiles,
} from "@/lib/db/schema";
import { slugifyText } from "@/lib/slug";

/**
 * Baseline achievement catalog. These always seed; per-category and per-venue
 * achievements are granted on-the-fly and their definitions upserted as they
 * are triggered (so the list stays aligned with the live taxonomy without a
 * migration every time a category is added).
 */
export const BASELINE_ACHIEVEMENTS: Array<{
  slug: string;
  title: string;
  description: string;
  icon: string;
}> = [
  { slug: "first_correct", title: "First blood", description: "Answer a question correctly.", icon: "star" },
  { slug: "ten_correct", title: "Sharpshooter", description: "Ten correct answers.", icon: "target" },
  { slug: "century_club", title: "Century club", description: "One hundred correct answers.", icon: "crown" },
  { slug: "first_game", title: "Rookie", description: "Finish your first game.", icon: "ribbon" },
  { slug: "quickdraw", title: "Quickdraw", description: "Answer correctly in under 3 seconds.", icon: "zap" },
  { slug: "lightning", title: "Lightning", description: "Answer correctly in under 1 second.", icon: "bolt" },
  { slug: "hot_streak", title: "Hot streak", description: "Three correct answers in a row.", icon: "flame" },
  { slug: "on_fire", title: "On fire", description: "Five correct answers in a row.", icon: "fire" },
  { slug: "marksman", title: "Marksman", description: "Ten correct answers in a row.", icon: "bullseye" },
  { slug: "podium", title: "Podium finish", description: "Finish a game in the top three.", icon: "medal" },
  { slug: "champion", title: "Champion", description: "Win a game (rank 1).", icon: "trophy" },
];

const SCHOLAR_CORRECT_THRESHOLD = 25;
const REGULAR_GAMES_THRESHOLD = 5;
const LOCAL_LEGEND_GAMES_THRESHOLD = 15;

function toSlugSafe(input: string): string {
  return slugifyText(input, { maxLength: 40 });
}

async function getOrCreateDefinition(input: {
  slug: string;
  title: string;
  description: string;
  icon: string;
}): Promise<string | null> {
  const existing = await db
    .select({ id: achievementDefinitions.id })
    .from(achievementDefinitions)
    .where(eq(achievementDefinitions.slug, input.slug))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const inserted = await db
    .insert(achievementDefinitions)
    .values({
      slug: input.slug,
      title: input.title,
      description: input.description,
      icon: input.icon,
    })
    .onConflictDoNothing({ target: achievementDefinitions.slug })
    .returning({ id: achievementDefinitions.id });
  if (inserted[0]) return inserted[0].id;

  // Lost race to another caller — re-read.
  const after = await db
    .select({ id: achievementDefinitions.id })
    .from(achievementDefinitions)
    .where(eq(achievementDefinitions.slug, input.slug))
    .limit(1);
  return after[0]?.id ?? null;
}

async function grant(
  playerId: string,
  def: { slug: string; title: string; description: string; icon: string },
  metadata?: Record<string, unknown>
): Promise<boolean> {
  const defId = await getOrCreateDefinition(def);
  if (!defId) return false;

  const inserted = await db
    .insert(playerAchievementGrants)
    .values({
      playerId,
      achievementId: defId,
      metadata: metadata ? JSON.stringify(metadata) : null,
    })
    .onConflictDoNothing({
      target: [playerAchievementGrants.playerId, playerAchievementGrants.achievementId],
    })
    .returning({ id: playerAchievementGrants.id });
  return inserted.length > 0;
}

/**
 * Inline achievements checked immediately after a player answers. Fast-path
 * checks only: speed/streak/first-correct/category-scholar. Anything that
 * needs session rankings runs in `tryGrantAchievementsAfterSession`.
 */
export async function tryGrantAchievementsAfterAnswer(input: {
  playerId: string;
  sessionId: string;
  questionId: string;
  isCorrect: boolean;
  timeToAnswerMs: number;
  streak: number;
  pointsAwarded: number;
}): Promise<void> {
  const { playerId, isCorrect, timeToAnswerMs, streak } = input;

  if (!isCorrect) return;

  // First correct
  await grant(playerId, BASELINE_ACHIEVEMENTS.find((a) => a.slug === "first_correct")!, {
    sessionId: input.sessionId,
  });

  // Ten / century thresholds based on all-time correct count.
  const correctRows = await db
    .select({ value: count() })
    .from(answers)
    .where(and(eq(answers.playerId, playerId), eq(answers.isCorrect, true)));
  const correct = correctRows[0]?.value ?? 0;
  if (correct >= 10) {
    await grant(playerId, BASELINE_ACHIEVEMENTS.find((a) => a.slug === "ten_correct")!);
  }
  if (correct >= 100) {
    await grant(playerId, BASELINE_ACHIEVEMENTS.find((a) => a.slug === "century_club")!);
  }

  if (timeToAnswerMs <= 3000) {
    await grant(playerId, BASELINE_ACHIEVEMENTS.find((a) => a.slug === "quickdraw")!);
  }
  if (timeToAnswerMs <= 1000) {
    await grant(playerId, BASELINE_ACHIEVEMENTS.find((a) => a.slug === "lightning")!);
  }

  if (streak >= 3) {
    await grant(playerId, BASELINE_ACHIEVEMENTS.find((a) => a.slug === "hot_streak")!);
  }
  if (streak >= 5) {
    await grant(playerId, BASELINE_ACHIEVEMENTS.find((a) => a.slug === "on_fire")!);
  }
  if (streak >= 10) {
    await grant(playerId, BASELINE_ACHIEVEMENTS.find((a) => a.slug === "marksman")!);
  }

  // Category scholar: N correct answers in a single category across all sessions.
  const categoryRows = await db
    .select({ category: questions.category })
    .from(questions)
    .where(eq(questions.id, input.questionId))
    .limit(1);
  const category = categoryRows[0]?.category;
  if (category) {
    const byCat = await db
      .select({ value: count() })
      .from(answers)
      .innerJoin(sessionQuestions, eq(sessionQuestions.id, answers.sessionQuestionId))
      .innerJoin(questions, eq(questions.id, sessionQuestions.questionId))
      .where(
        and(
          eq(answers.playerId, playerId),
          eq(answers.isCorrect, true),
          eq(questions.category, category)
        )
      );
    const count_ = byCat[0]?.value ?? 0;
    if (count_ >= SCHOLAR_CORRECT_THRESHOLD) {
      const slugPart = toSlugSafe(category);
      await grant(
        playerId,
        {
          slug: `scholar_${slugPart}`,
          title: `${category} scholar`,
          description: `Answer ${SCHOLAR_CORRECT_THRESHOLD} ${category} questions correctly.`,
          icon: "book",
        },
        { category }
      );
    }
  }
}

/**
 * Session-end achievements. Called after a session transitions to completed
 * and `recomputeSessionRanks` has finalized ranks / `playerSessions.score`.
 *
 * Grants podium/champion, per-venue regular / local legend, and updates
 * `player_stats.totalGames` + `bestRank`.
 */
export async function tryGrantAchievementsAfterSession(sessionId: string): Promise<void> {
  const sessionRows = await db
    .select({
      id: sessions.id,
      venueAccountId: sessions.venueAccountId,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const session = sessionRows[0];
  if (!session) return;

  const venueRows = await db
    .select({
      displayName: venueProfiles.displayName,
      slug: venueProfiles.slug,
      accountName: accounts.name,
    })
    .from(accounts)
    .leftJoin(venueProfiles, eq(venueProfiles.accountId, accounts.id))
    .where(eq(accounts.id, session.venueAccountId))
    .limit(1);
  const venueName = venueRows[0]?.displayName ?? venueRows[0]?.accountName ?? "Venue";
  const venueSlug = venueRows[0]?.slug ?? toSlugSafe(venueName);

  const ps = await db
    .select({
      playerId: playerSessions.playerId,
      rank: playerSessions.rank,
    })
    .from(playerSessions)
    .where(eq(playerSessions.sessionId, sessionId));

  for (const row of ps) {
    const rank = row.rank ?? null;

    // first_game: on completing your very first session.
    const gamesRows = await db
      .select({ value: count() })
      .from(playerSessions)
      .where(eq(playerSessions.playerId, row.playerId));
    const games = gamesRows[0]?.value ?? 0;

    if (games >= 1) {
      await grant(row.playerId, BASELINE_ACHIEVEMENTS.find((a) => a.slug === "first_game")!);
    }

    if (rank != null) {
      if (rank <= 3) {
        await grant(row.playerId, BASELINE_ACHIEVEMENTS.find((a) => a.slug === "podium")!, {
          sessionId,
          rank,
        });
      }
      if (rank === 1) {
        await grant(row.playerId, BASELINE_ACHIEVEMENTS.find((a) => a.slug === "champion")!, {
          sessionId,
        });
      }
    }

    // Venue regulars: number of sessions played at this venue.
    const venueVisitRows = await db
      .select({ value: count() })
      .from(playerSessions)
      .innerJoin(sessions, eq(sessions.id, playerSessions.sessionId))
      .where(
        and(
          eq(playerSessions.playerId, row.playerId),
          eq(sessions.venueAccountId, session.venueAccountId)
        )
      );
    const visits = venueVisitRows[0]?.value ?? 0;

    if (visits >= REGULAR_GAMES_THRESHOLD) {
      await grant(
        row.playerId,
        {
          slug: `regular_${venueSlug}`,
          title: `${venueName} regular`,
          description: `Play ${REGULAR_GAMES_THRESHOLD} games at ${venueName}.`,
          icon: "home",
        },
        { venueSlug, visits }
      );
    }
    if (visits >= LOCAL_LEGEND_GAMES_THRESHOLD) {
      await grant(
        row.playerId,
        {
          slug: `local_legend_${venueSlug}`,
          title: `${venueName} legend`,
          description: `Play ${LOCAL_LEGEND_GAMES_THRESHOLD} games at ${venueName}.`,
          icon: "star-burst",
        },
        { venueSlug, visits }
      );
    }

    // player_stats rollup: totalGames + bestRank.
    const existing = await db
      .select({ bestRank: playerStats.bestRank })
      .from(playerStats)
      .where(eq(playerStats.playerId, row.playerId))
      .limit(1);
    const nextBest =
      rank == null
        ? existing[0]?.bestRank ?? null
        : existing[0]?.bestRank == null
          ? rank
          : Math.min(existing[0].bestRank, rank);

    if (!existing[0]) {
      await db
        .insert(playerStats)
        .values({
          playerId: row.playerId,
          totalGames: 1,
          bestRank: nextBest,
          lastPlayedAt: new Date(),
        })
        .onConflictDoNothing({ target: playerStats.playerId });
    } else {
      await db
        .update(playerStats)
        .set({
          totalGames: sql`${playerStats.totalGames} + 1`,
          bestRank: nextBest,
          lastPlayedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(playerStats.playerId, row.playerId));
    }
  }
}

/**
 * Read-only helper for the player dashboard: returns the player's earned
 * achievements most-recently-earned first.
 */
export async function listPlayerAchievements(playerId: string) {
  return db
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
      eq(achievementDefinitions.id, playerAchievementGrants.achievementId)
    )
    .where(eq(playerAchievementGrants.playerId, playerId))
    .orderBy(desc(playerAchievementGrants.earnedAt));
}
