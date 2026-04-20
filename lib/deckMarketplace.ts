import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  accounts,
  creatorBadges,
  deckRatings,
  deckStats,
  questionDecks,
  questions,
} from "@/lib/db/schema";

/**
 * Deck marketplace helpers. Decks have two surfaces:
 *  - `/decks` public browse (this file) — anonymous readers discover by
 *    popularity / rating / recency.
 *  - `/dashboard/decks/*` host management (other file) — private-only views
 *    the owner uses to edit, submit, and manage their decks.
 *
 * Stats live in the denormalized `deckStats` table, refreshed by the
 * `bumpDeckStatsForSessionLaunch` / `recomputeDeckRatingRollup` helpers
 * below. Callers that need the freshest number (e.g. rating-change response
 * screens) can call `recomputeDeckRatingRollup` inline; everything else
 * reads the cached rollup.
 */

export type DeckSort = "popular" | "top_rated" | "new";

export type MarketplaceDeck = {
  id: string;
  name: string;
  description: string | null;
  defaultCategory: string | null;
  defaultSubcategory: string | null;
  tags: string[];
  featured: boolean;
  questionCount: number;
  ownerAccountId: string;
  ownerName: string;
  hasCover: boolean;
  coverUpdatedAt: string | null;
  timesUsed: number;
  totalPlayerPlays: number;
  ratingCount: number;
  avgRating: number; // 0..5
  lastUsedAt: string | null;
  createdAt: string;
};

export type MarketplaceListOptions = {
  sort?: DeckSort;
  tag?: string | null;
  category?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
};

export async function listMarketplaceDecks(
  opts: MarketplaceListOptions = {}
): Promise<{ decks: MarketplaceDeck[]; total: number }> {
  const sort: DeckSort = opts.sort ?? "popular";
  const limit = Math.max(1, Math.min(50, opts.limit ?? 24));
  const offset = Math.max(0, opts.offset ?? 0);

  const conditions = [eq(questionDecks.visibility, "public")];
  if (opts.category) {
    conditions.push(eq(questionDecks.defaultCategory, opts.category));
  }
  if (opts.search && opts.search.trim()) {
    const q = `%${opts.search.trim().toLowerCase()}%`;
    conditions.push(sql`lower(${questionDecks.name}) LIKE ${q}`);
  }
  if (opts.tag) {
    const tag = opts.tag.trim();
    conditions.push(sql`${questionDecks.tags} @> ARRAY[${tag}]::text[]`);
  }

  const baseWhere = and(...conditions);

  const ordering = (() => {
    switch (sort) {
      case "top_rated":
        return sql`COALESCE(${deckStats.avgRating}, 0) DESC, COALESCE(${deckStats.ratingCount}, 0) DESC, ${questionDecks.createdAt} DESC`;
      case "new":
        return sql`${questionDecks.createdAt} DESC`;
      case "popular":
      default:
        return sql`COALESCE(${deckStats.timesUsed}, 0) DESC, COALESCE(${deckStats.totalPlayerPlays}, 0) DESC, ${questionDecks.createdAt} DESC`;
    }
  })();

  const rows = await db
    .select({
      id: questionDecks.id,
      name: questionDecks.name,
      description: questionDecks.description,
      defaultCategory: questionDecks.defaultCategory,
      defaultSubcategory: questionDecks.defaultSubcategory,
      tags: questionDecks.tags,
      featured: questionDecks.featured,
      coverUpdatedAt: questionDecks.coverUpdatedAt,
      createdAt: questionDecks.createdAt,
      ownerAccountId: questionDecks.ownerAccountId,
      ownerName: accounts.name,
      timesUsed: deckStats.timesUsed,
      totalPlayerPlays: deckStats.totalPlayerPlays,
      ratingCount: deckStats.ratingCount,
      avgRatingX100: deckStats.avgRating,
      lastUsedAt: deckStats.lastUsedAt,
    })
    .from(questionDecks)
    .innerJoin(accounts, eq(accounts.id, questionDecks.ownerAccountId))
    .leftJoin(deckStats, eq(deckStats.deckId, questionDecks.id))
    .where(baseWhere)
    .orderBy(ordering)
    .limit(limit)
    .offset(offset);

  const ids = rows.map((r) => r.id);
  const [qCounts, coverRows, totalRow] = await Promise.all([
    ids.length
      ? db
          .select({ deckId: questions.deckId, n: count() })
          .from(questions)
          .where(
            and(
              inArray(questions.deckId, ids),
              eq(questions.retired, false),
              eq(questions.vetted, true)
            )
          )
          .groupBy(questions.deckId)
      : Promise.resolve([] as Array<{ deckId: string | null; n: number }>),
    ids.length
      ? db
          .select({
            id: questionDecks.id,
            hasCover: sql<boolean>`${questionDecks.coverImageMime} IS NOT NULL`,
          })
          .from(questionDecks)
          .where(inArray(questionDecks.id, ids))
      : Promise.resolve([] as Array<{ id: string; hasCover: boolean }>),
    db
      .select({ n: count() })
      .from(questionDecks)
      .where(baseWhere),
  ]);

  const qCountMap = new Map<string, number>();
  for (const r of qCounts) {
    if (r.deckId) qCountMap.set(r.deckId, Number(r.n));
  }
  const coverMap = new Map(coverRows.map((r) => [r.id, r.hasCover]));

  const decks: MarketplaceDeck[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    defaultCategory: r.defaultCategory,
    defaultSubcategory: r.defaultSubcategory,
    tags: r.tags ?? [],
    featured: r.featured,
    questionCount: qCountMap.get(r.id) ?? 0,
    ownerAccountId: r.ownerAccountId,
    ownerName: r.ownerName,
    hasCover: coverMap.get(r.id) ?? false,
    coverUpdatedAt: r.coverUpdatedAt ? r.coverUpdatedAt.toISOString() : null,
    timesUsed: r.timesUsed ?? 0,
    totalPlayerPlays: r.totalPlayerPlays ?? 0,
    ratingCount: r.ratingCount ?? 0,
    avgRating: r.avgRatingX100 != null ? (r.avgRatingX100 ?? 0) / 100 : 0,
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));

  return { decks, total: Number(totalRow[0]?.n ?? 0) };
}

export type MarketplaceDeckDetail = MarketplaceDeck & {
  recentRatings: Array<{ score: number; createdAt: string }>;
  badges: Array<{ kind: string; awardedAt: string }>;
};

export async function getMarketplaceDeck(
  deckId: string
): Promise<MarketplaceDeckDetail | null> {
  const rows = await db
    .select({
      id: questionDecks.id,
      name: questionDecks.name,
      description: questionDecks.description,
      defaultCategory: questionDecks.defaultCategory,
      defaultSubcategory: questionDecks.defaultSubcategory,
      tags: questionDecks.tags,
      featured: questionDecks.featured,
      coverUpdatedAt: questionDecks.coverUpdatedAt,
      createdAt: questionDecks.createdAt,
      ownerAccountId: questionDecks.ownerAccountId,
      ownerName: accounts.name,
      timesUsed: deckStats.timesUsed,
      totalPlayerPlays: deckStats.totalPlayerPlays,
      ratingCount: deckStats.ratingCount,
      avgRatingX100: deckStats.avgRating,
      lastUsedAt: deckStats.lastUsedAt,
      visibility: questionDecks.visibility,
      coverMime: questionDecks.coverImageMime,
    })
    .from(questionDecks)
    .innerJoin(accounts, eq(accounts.id, questionDecks.ownerAccountId))
    .leftJoin(deckStats, eq(deckStats.deckId, questionDecks.id))
    .where(and(eq(questionDecks.id, deckId), eq(questionDecks.visibility, "public")))
    .limit(1);

  const r = rows[0];
  if (!r) return null;

  const [questionCountRow, recentRatings, badges] = await Promise.all([
    db
      .select({ n: count() })
      .from(questions)
      .where(
        and(
          eq(questions.deckId, r.id),
          eq(questions.retired, false),
          eq(questions.vetted, true)
        )
      ),
    db
      .select({ score: deckRatings.score, createdAt: deckRatings.createdAt })
      .from(deckRatings)
      .where(eq(deckRatings.deckId, r.id))
      .orderBy(desc(deckRatings.createdAt))
      .limit(5),
    db
      .select({ kind: creatorBadges.kind, awardedAt: creatorBadges.awardedAt })
      .from(creatorBadges)
      .where(eq(creatorBadges.accountId, r.ownerAccountId))
      .orderBy(desc(creatorBadges.awardedAt)),
  ]);

  return {
    id: r.id,
    name: r.name,
    description: r.description,
    defaultCategory: r.defaultCategory,
    defaultSubcategory: r.defaultSubcategory,
    tags: r.tags ?? [],
    featured: r.featured,
    questionCount: Number(questionCountRow[0]?.n ?? 0),
    ownerAccountId: r.ownerAccountId,
    ownerName: r.ownerName,
    hasCover: !!r.coverMime,
    coverUpdatedAt: r.coverUpdatedAt ? r.coverUpdatedAt.toISOString() : null,
    timesUsed: r.timesUsed ?? 0,
    totalPlayerPlays: r.totalPlayerPlays ?? 0,
    ratingCount: r.ratingCount ?? 0,
    avgRating: r.avgRatingX100 != null ? (r.avgRatingX100 ?? 0) / 100 : 0,
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    recentRatings: recentRatings.map((x) => ({
      score: x.score,
      createdAt: x.createdAt.toISOString(),
    })),
    badges: badges.map((b) => ({ kind: b.kind, awardedAt: b.awardedAt.toISOString() })),
  };
}

/**
 * Increment the deck-stats rollup when a session that drew from a given deck
 * launches. Called from `launchSession` so the counts stay warm without
 * requiring a cron.
 *
 * `playerCountAtLaunch` is optional; pass it when you know it (e.g. a hosted
 * game) and we'll fold it into `totalPlayerPlays`. House / autopilot games
 * don't know the final player count at launch, so they pass 0 and rely on
 * `session_completed` to reconcile later.
 */
export async function bumpDeckStatsForSessionLaunch(
  deckIds: string[],
  playerCountAtLaunch: number = 0
) {
  if (deckIds.length === 0) return;
  const unique = Array.from(new Set(deckIds));
  const now = new Date();
  for (const id of unique) {
    await db
      .insert(deckStats)
      .values({
        deckId: id,
        timesUsed: 1,
        totalPlayerPlays: playerCountAtLaunch,
        ratingCount: 0,
        avgRating: 0,
        lastUsedAt: now,
      })
      .onConflictDoUpdate({
        target: deckStats.deckId,
        set: {
          timesUsed: sql`${deckStats.timesUsed} + 1`,
          totalPlayerPlays: sql`${deckStats.totalPlayerPlays} + ${playerCountAtLaunch}`,
          lastUsedAt: now,
          updatedAt: now,
        },
      });
  }
}

/**
 * Recompute rating count + average for a single deck. Called after a rating
 * insert/update/delete. Cheap — one agg query plus one upsert.
 */
export async function recomputeDeckRatingRollup(deckId: string): Promise<void> {
  const [row] = await db
    .select({
      n: count(),
      avg: sql<number>`COALESCE(AVG(${deckRatings.score}) * 100, 0)`,
    })
    .from(deckRatings)
    .where(eq(deckRatings.deckId, deckId));
  const ratingCount = Number(row?.n ?? 0);
  const avgRating = Math.round(Number(row?.avg ?? 0));
  const now = new Date();

  await db
    .insert(deckStats)
    .values({
      deckId,
      timesUsed: 0,
      totalPlayerPlays: 0,
      ratingCount,
      avgRating,
    })
    .onConflictDoUpdate({
      target: deckStats.deckId,
      set: { ratingCount, avgRating, updatedAt: now },
    });
}

/** List most-recent public decks for a creator's profile page. */
export async function listCreatorDecks(
  ownerAccountId: string,
  limit: number = 24
): Promise<MarketplaceDeck[]> {
  const rows = await db
    .select({
      id: questionDecks.id,
      name: questionDecks.name,
      description: questionDecks.description,
      defaultCategory: questionDecks.defaultCategory,
      defaultSubcategory: questionDecks.defaultSubcategory,
      tags: questionDecks.tags,
      featured: questionDecks.featured,
      coverUpdatedAt: questionDecks.coverUpdatedAt,
      createdAt: questionDecks.createdAt,
      ownerAccountId: questionDecks.ownerAccountId,
      ownerName: accounts.name,
      timesUsed: deckStats.timesUsed,
      totalPlayerPlays: deckStats.totalPlayerPlays,
      ratingCount: deckStats.ratingCount,
      avgRatingX100: deckStats.avgRating,
      lastUsedAt: deckStats.lastUsedAt,
      hasCover: sql<boolean>`${questionDecks.coverImageMime} IS NOT NULL`,
    })
    .from(questionDecks)
    .innerJoin(accounts, eq(accounts.id, questionDecks.ownerAccountId))
    .leftJoin(deckStats, eq(deckStats.deckId, questionDecks.id))
    .where(
      and(
        eq(questionDecks.ownerAccountId, ownerAccountId),
        eq(questionDecks.visibility, "public")
      )
    )
    .orderBy(desc(questionDecks.createdAt))
    .limit(limit);

  const ids = rows.map((r) => r.id);
  const qCounts = ids.length
    ? await db
        .select({ deckId: questions.deckId, n: count() })
        .from(questions)
        .where(
          and(
            inArray(questions.deckId, ids),
            eq(questions.retired, false),
            eq(questions.vetted, true)
          )
        )
        .groupBy(questions.deckId)
    : [];
  const qCountMap = new Map<string, number>();
  for (const r of qCounts) if (r.deckId) qCountMap.set(r.deckId, Number(r.n));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    defaultCategory: r.defaultCategory,
    defaultSubcategory: r.defaultSubcategory,
    tags: r.tags ?? [],
    featured: r.featured,
    questionCount: qCountMap.get(r.id) ?? 0,
    ownerAccountId: r.ownerAccountId,
    ownerName: r.ownerName,
    hasCover: r.hasCover,
    coverUpdatedAt: r.coverUpdatedAt ? r.coverUpdatedAt.toISOString() : null,
    timesUsed: r.timesUsed ?? 0,
    totalPlayerPlays: r.totalPlayerPlays ?? 0,
    ratingCount: r.ratingCount ?? 0,
    avgRating: r.avgRatingX100 != null ? (r.avgRatingX100 ?? 0) / 100 : 0,
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getCreatorSummary(ownerAccountId: string) {
  const [acct, badgesRows, publicDecksCount] = await Promise.all([
    db
      .select({ id: accounts.id, name: accounts.name, createdAt: accounts.createdAt })
      .from(accounts)
      .where(eq(accounts.id, ownerAccountId))
      .limit(1),
    db
      .select({ kind: creatorBadges.kind, awardedAt: creatorBadges.awardedAt })
      .from(creatorBadges)
      .where(eq(creatorBadges.accountId, ownerAccountId))
      .orderBy(desc(creatorBadges.awardedAt)),
    db
      .select({ n: count() })
      .from(questionDecks)
      .where(
        and(
          eq(questionDecks.ownerAccountId, ownerAccountId),
          eq(questionDecks.visibility, "public")
        )
      ),
  ]);

  const a = acct[0];
  if (!a) return null;

  return {
    id: a.id,
    name: a.name,
    createdAt: a.createdAt.toISOString(),
    badges: badgesRows.map((b) => ({
      kind: b.kind,
      awardedAt: b.awardedAt.toISOString(),
    })),
    publicDeckCount: Number(publicDecksCount[0]?.n ?? 0),
  };
}

// Imported but not directly referenced: `gte` kept handy for future "new this
// week" carousels without needing another refactor.
void gte;
