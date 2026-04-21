import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  achievementDefinitions,
  playerAchievementGrants,
  playerStats,
} from "@/lib/db/schema";
import { BASELINE_ACHIEVEMENTS } from "@/lib/game/achievements";

/**
 * Baseline-catalog UI helpers.
 *
 * The runtime achievement system (see `tryGrantAchievementsAfterAnswer`
 * / `tryGrantAchievementsAfterSession`) is purely insert-on-first-hit.
 * It doesn't know how to show a locked achievement with a "8/10" bar.
 *
 * Tier 2.D needs that bar, so this module layers two things on top:
 *
 *  1. A static catalog (`BASELINE_ACHIEVEMENT_CATALOG`) that pairs each
 *     baseline slug with the metric + target used by the in-flight
 *     checks — all sourced from `playerStats` (no re-scan of `answers`).
 *  2. `computePlayerAchievementCatalog(playerId)` which merges the
 *     player's grants + current `playerStats` row into a sorted
 *     "earned, then closest-to-earning, then long-tail" list the
 *     dashboard + post-game toast both render from.
 */

export type AchievementProgressMetric =
  | "totalCorrect"
  | "totalGames"
  | "longestStreak"
  | "fastestCorrectMsInverseMax" // lower = better, so we flip the bar
  | "bestRankInverseMax";

type CatalogEntry = {
  slug: string;
  title: string;
  description: string;
  icon: string;
  metric: AchievementProgressMetric;
  /** Target the metric must reach (or beat, for inverse metrics). */
  target: number;
};

const BASELINE_BY_SLUG = new Map(BASELINE_ACHIEVEMENTS.map((a) => [a.slug, a]));

/**
 * The baseline catalog, in the order we want it to render when nothing
 * is earned yet. Keep this list aligned with the checks inside
 * `tryGrantAchievementsAfterAnswer` / `tryGrantAchievementsAfterSession`
 * — if those thresholds change, update here too.
 */
export const BASELINE_ACHIEVEMENT_CATALOG: CatalogEntry[] = [
  entry("first_correct", "totalCorrect", 1),
  entry("ten_correct", "totalCorrect", 10),
  entry("century_club", "totalCorrect", 100),
  entry("first_game", "totalGames", 1),
  entry("hot_streak", "longestStreak", 3),
  entry("on_fire", "longestStreak", 5),
  entry("marksman", "longestStreak", 10),
  entry("quickdraw", "fastestCorrectMsInverseMax", 3000),
  entry("lightning", "fastestCorrectMsInverseMax", 1000),
  entry("podium", "bestRankInverseMax", 3),
  entry("champion", "bestRankInverseMax", 1),
];

function entry(
  slug: string,
  metric: AchievementProgressMetric,
  target: number
): CatalogEntry {
  const baseline = BASELINE_BY_SLUG.get(slug);
  if (!baseline) {
    throw new Error(
      `achievementCatalog: unknown baseline slug "${slug}" — add it to BASELINE_ACHIEVEMENTS first.`
    );
  }
  return {
    slug,
    title: baseline.title,
    description: baseline.description,
    icon: baseline.icon,
    metric,
    target,
  };
}

export type PlayerAchievementRow = {
  slug: string;
  title: string;
  description: string;
  icon: string;
  earned: boolean;
  earnedAt: Date | null;
  /** 0..1 — how close the player is to earning this. 1 once earned. */
  progress: number;
  /** Human-readable label, e.g. "7 / 10" or "fastest 4.2s · goal 3.0s". */
  progressLabel: string;
};

/**
 * Build the full baseline catalog for a single player, merging the
 * sparse `playerAchievementGrants` rows against `playerStats` so locked
 * entries render with a progress bar.
 *
 * Order: earned (newest first) → locked & closest to target → locked &
 * furthest away. This mirrors how we want the dashboard grid + the
 * post-game toast stream to feel.
 */
export async function computePlayerAchievementCatalog(
  playerId: string
): Promise<PlayerAchievementRow[]> {
  const [statsRow] = await db
    .select({
      totalCorrect: playerStats.totalCorrect,
      totalGames: playerStats.totalGames,
      longestStreak: playerStats.longestStreak,
      fastestCorrectMs: playerStats.fastestCorrectMs,
      bestRank: playerStats.bestRank,
    })
    .from(playerStats)
    .where(eq(playerStats.playerId, playerId))
    .limit(1);

  const stats = {
    totalCorrect: statsRow?.totalCorrect ?? 0,
    totalGames: statsRow?.totalGames ?? 0,
    longestStreak: statsRow?.longestStreak ?? 0,
    fastestCorrectMs: statsRow?.fastestCorrectMs ?? null,
    bestRank: statsRow?.bestRank ?? null,
  };

  const grants = await db
    .select({
      slug: achievementDefinitions.slug,
      earnedAt: playerAchievementGrants.earnedAt,
    })
    .from(playerAchievementGrants)
    .innerJoin(
      achievementDefinitions,
      eq(achievementDefinitions.id, playerAchievementGrants.achievementId)
    )
    .where(eq(playerAchievementGrants.playerId, playerId));
  const earnedAtBySlug = new Map(grants.map((g) => [g.slug, g.earnedAt]));

  const rows: PlayerAchievementRow[] = BASELINE_ACHIEVEMENT_CATALOG.map(
    (def) => {
      const earnedAt = earnedAtBySlug.get(def.slug) ?? null;
      const earned = Boolean(earnedAt);
      const { progress, progressLabel } = computeProgress(def, stats, earned);
      return {
        slug: def.slug,
        title: def.title,
        description: def.description,
        icon: def.icon,
        earned,
        earnedAt,
        progress: earned ? 1 : progress,
        progressLabel,
      };
    }
  );

  rows.sort((a, b) => {
    if (a.earned && !b.earned) return -1;
    if (!a.earned && b.earned) return 1;
    if (a.earned && b.earned) {
      // Newest earned first.
      const at = a.earnedAt?.getTime() ?? 0;
      const bt = b.earnedAt?.getTime() ?? 0;
      return bt - at;
    }
    // Both locked — closer-to-target first.
    return b.progress - a.progress;
  });

  return rows;
}

function computeProgress(
  def: CatalogEntry,
  stats: {
    totalCorrect: number;
    totalGames: number;
    longestStreak: number;
    fastestCorrectMs: number | null;
    bestRank: number | null;
  },
  earned: boolean
): { progress: number; progressLabel: string } {
  if (earned) {
    return { progress: 1, progressLabel: "Unlocked" };
  }
  switch (def.metric) {
    case "totalCorrect":
      return linearBar(stats.totalCorrect, def.target, "correct");
    case "totalGames":
      return linearBar(stats.totalGames, def.target, "games");
    case "longestStreak":
      return linearBar(stats.longestStreak, def.target, "in a row");
    case "fastestCorrectMsInverseMax": {
      // Lower fastest = better. Flip into a 0..1 bar that's 0 when the
      // player has no correct yet, 1 at target, and interpolates in the
      // 0..6000ms window so tantalizingly-close runs still fill ~halfway.
      const { fastestCorrectMs } = stats;
      if (fastestCorrectMs == null) {
        return {
          progress: 0,
          progressLabel: `Fastest ≤ ${formatSeconds(def.target)}`,
        };
      }
      if (fastestCorrectMs <= def.target) {
        return { progress: 1, progressLabel: "Unlocked" };
      }
      const windowHigh = Math.max(def.target * 2, 6000);
      const clamped = Math.min(fastestCorrectMs, windowHigh);
      const ratio = (windowHigh - clamped) / (windowHigh - def.target);
      return {
        progress: clamp(ratio, 0, 0.95),
        progressLabel: `Fastest ${formatSeconds(fastestCorrectMs)} · goal ${formatSeconds(def.target)}`,
      };
    }
    case "bestRankInverseMax": {
      const { bestRank } = stats;
      if (bestRank == null) {
        return {
          progress: 0,
          progressLabel:
            def.target === 1 ? "Win a game" : `Finish in top ${def.target}`,
        };
      }
      if (bestRank <= def.target) {
        return { progress: 1, progressLabel: "Unlocked" };
      }
      const base = 15; // "far from the podium" anchor
      const capped = Math.min(bestRank, base);
      const ratio = (base - capped) / (base - def.target);
      return {
        progress: clamp(ratio, 0, 0.9),
        progressLabel:
          def.target === 1
            ? `Best finish #${bestRank} · win to unlock`
            : `Best finish #${bestRank} · need top ${def.target}`,
      };
    }
  }
}

function linearBar(
  current: number,
  target: number,
  noun: string
): { progress: number; progressLabel: string } {
  const safeCurrent = Math.max(0, Math.min(current, target));
  const progress = target === 0 ? 1 : safeCurrent / target;
  return {
    progress: clamp(progress, 0, 1),
    progressLabel: `${current.toLocaleString()} / ${target.toLocaleString()} ${noun}`,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
}

/**
 * Return achievements the player earned strictly after the given
 * timestamp — used by `/api/game/sessions/[id]/new-achievements` to
 * power the post-game toast stream on the play page.
 */
export async function listAchievementsEarnedSince(
  playerId: string,
  since: Date
): Promise<
  Array<{ slug: string; title: string; description: string; icon: string | null; earnedAt: Date }>
> {
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
    .where(
      and(
        eq(playerAchievementGrants.playerId, playerId),
        gte(playerAchievementGrants.earnedAt, since)
      )
    )
    .orderBy(playerAchievementGrants.earnedAt);
}

/**
 * Resolve a set of slugs into their full definitions (title /
 * description / icon). Used by the post-game toast path when we want
 * to enrich a list of newly-earned slugs without re-joining by id.
 */
export async function resolveAchievementsBySlug(slugs: string[]) {
  if (slugs.length === 0) return [];
  return db
    .select({
      slug: achievementDefinitions.slug,
      title: achievementDefinitions.title,
      description: achievementDefinitions.description,
      icon: achievementDefinitions.icon,
    })
    .from(achievementDefinitions)
    .where(inArray(achievementDefinitions.slug, slugs));
}
