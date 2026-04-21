/**
 * Seasons — named reset windows for the leaderboard tab. A season is simply
 * a (starts_at, ends_at) pair; `ensureCurrentSeason()` lazily seeds a
 * 90-day default if the operator hasn't curated any rows yet, so the
 * product still works in a fresh install.
 */

import { and, asc, desc, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { seasons } from "@/lib/db/schema";

export type SeasonRow = typeof seasons.$inferSelect;

/**
 * Build a season label like "2026 S2" based on the calendar quarter of
 * `at`. Used when we lazily seed the first row on an empty table.
 */
function defaultSeasonFor(at: Date): {
  slug: string;
  label: string;
  startsAt: Date;
  endsAt: Date;
} {
  const year = at.getUTCFullYear();
  const month = at.getUTCMonth(); // 0-based
  const quarter = Math.floor(month / 3) + 1;
  const startsAt = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
  const endsAt = new Date(Date.UTC(year, quarter * 3, 1));
  return {
    slug: `${year}-s${quarter}`,
    label: `${year} S${quarter}`,
    startsAt,
    endsAt,
  };
}

export async function ensureCurrentSeason(
  at: Date = new Date()
): Promise<SeasonRow> {
  const existing = await getCurrentSeason(at);
  if (existing) return existing;
  const seed = defaultSeasonFor(at);
  const [row] = await db
    .insert(seasons)
    .values(seed)
    .onConflictDoNothing({ target: seasons.slug })
    .returning();
  if (row) return row;
  // Race: another request inserted it first — re-read and return that.
  const after = await getCurrentSeason(at);
  if (!after) {
    throw new Error("Failed to seed current season");
  }
  return after;
}

export async function getCurrentSeason(
  at: Date = new Date()
): Promise<SeasonRow | null> {
  const rows = await db
    .select()
    .from(seasons)
    .where(and(lte(seasons.startsAt, at), gte(seasons.endsAt, at)))
    .orderBy(asc(seasons.startsAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listRecentSeasons(limit = 6): Promise<SeasonRow[]> {
  return db
    .select()
    .from(seasons)
    .orderBy(desc(seasons.startsAt))
    .limit(limit);
}
