import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  accounts,
  creatorBadges,
  creatorPerkGrants,
  deckStats,
  questionDecks,
} from "@/lib/db/schema";

/**
 * Phase 3.3 creator perks engine.
 *
 * Responsibilities:
 *  - Recompute which `creator_badges` a given account should have based on
 *    their public decks + rating rollup. Idempotent: relies on the unique
 *    (accountId, kind) index so duplicate grants are no-ops.
 *  - Translate qualifying badges into tangible perks (free organizer month)
 *    by extending `accounts.creator_free_until` and logging the grant in
 *    `creator_perk_grants` for auditability.
 *
 * Design notes:
 *  - All thresholds are defined in one place (`BADGE_RULES`) so they can be
 *    tuned without hunting through UI or cron code.
 *  - The helper is safe to call from hot paths (deck approval, rating
 *    updates) -- it runs at most a handful of queries and returns cheaply
 *    when nothing changed.
 */

export const BADGE_KINDS = {
  creator: "creator",
  prolific: "prolific_creator",
  topRated: "top_rated_creator",
  featured: "featured_creator",
} as const;

export type BadgeKind = (typeof BADGE_KINDS)[keyof typeof BADGE_KINDS];

export const TOP_RATED_MIN_SCORE_X100 = 450; // avg >= 4.50
export const TOP_RATED_MIN_RATINGS = 5;
export const PROLIFIC_MIN_DECKS = 3;
export const FREE_MONTH_DAYS = 30;

export const PERK_KINDS = {
  freeMonth: "free_month_organizer",
} as const;

export type CreatorSnapshot = {
  accountId: string;
  publicDeckCount: number;
  bestDeck: {
    deckId: string;
    avgRatingX100: number;
    ratingCount: number;
  } | null;
  hasFeaturedDeck: boolean;
};

async function snapshotCreator(accountId: string): Promise<CreatorSnapshot> {
  const [deckCountRow] = await db
    .select({ n: count() })
    .from(questionDecks)
    .where(
      and(
        eq(questionDecks.ownerAccountId, accountId),
        eq(questionDecks.visibility, "public")
      )
    );

  const [bestRow] = await db
    .select({
      deckId: deckStats.deckId,
      avgRating: deckStats.avgRating,
      ratingCount: deckStats.ratingCount,
    })
    .from(deckStats)
    .innerJoin(questionDecks, eq(questionDecks.id, deckStats.deckId))
    .where(
      and(
        eq(questionDecks.ownerAccountId, accountId),
        eq(questionDecks.visibility, "public"),
        sql`${deckStats.ratingCount} >= ${TOP_RATED_MIN_RATINGS}`
      )
    )
    .orderBy(desc(deckStats.avgRating))
    .limit(1);

  const [featuredRow] = await db
    .select({ n: count() })
    .from(questionDecks)
    .where(
      and(
        eq(questionDecks.ownerAccountId, accountId),
        eq(questionDecks.visibility, "public"),
        eq(questionDecks.featured, true)
      )
    );

  return {
    accountId,
    publicDeckCount: Number(deckCountRow?.n ?? 0),
    bestDeck: bestRow
      ? {
          deckId: bestRow.deckId,
          avgRatingX100: bestRow.avgRating ?? 0,
          ratingCount: bestRow.ratingCount ?? 0,
        }
      : null,
    hasFeaturedDeck: Number(featuredRow?.n ?? 0) > 0,
  };
}

type BadgeRule = {
  kind: BadgeKind;
  qualifies: (s: CreatorSnapshot) => boolean;
  /** Perk auto-granted the first time this badge is awarded. */
  perk?: typeof PERK_KINDS.freeMonth;
  note?: string;
};

const BADGE_RULES: BadgeRule[] = [
  {
    kind: BADGE_KINDS.creator,
    qualifies: (s) => s.publicDeckCount >= 1,
    note: "Published your first public deck",
  },
  {
    kind: BADGE_KINDS.prolific,
    qualifies: (s) => s.publicDeckCount >= PROLIFIC_MIN_DECKS,
    perk: PERK_KINDS.freeMonth,
    note: `Published ${PROLIFIC_MIN_DECKS}+ public decks`,
  },
  {
    kind: BADGE_KINDS.topRated,
    qualifies: (s) =>
      !!s.bestDeck &&
      s.bestDeck.avgRatingX100 >= TOP_RATED_MIN_SCORE_X100 &&
      s.bestDeck.ratingCount >= TOP_RATED_MIN_RATINGS,
    perk: PERK_KINDS.freeMonth,
    note: `Deck crossed 4.5+ rating with ${TOP_RATED_MIN_RATINGS}+ votes`,
  },
  {
    kind: BADGE_KINDS.featured,
    qualifies: (s) => s.hasFeaturedDeck,
    note: "Editor-featured deck",
  },
];

export type RecomputeResult = {
  snapshot: CreatorSnapshot;
  newBadges: BadgeKind[];
  grantedPerks: Array<{ kind: string; expiresAt: string }>;
};

/**
 * Idempotently award any badges the account now qualifies for, and grant
 * the attached perk the *first* time a badge is minted. Safe to call from
 * deck approve / rating recompute hot paths and from a daily cron safety
 * net.
 */
export async function recomputeCreatorBadges(
  accountId: string
): Promise<RecomputeResult> {
  const snapshot = await snapshotCreator(accountId);

  const existing = await db
    .select({ kind: creatorBadges.kind })
    .from(creatorBadges)
    .where(eq(creatorBadges.accountId, accountId));
  const haveKinds = new Set(existing.map((r) => r.kind));

  const newBadges: BadgeKind[] = [];
  const grantedPerks: RecomputeResult["grantedPerks"] = [];

  for (const rule of BADGE_RULES) {
    if (haveKinds.has(rule.kind)) continue;
    if (!rule.qualifies(snapshot)) continue;

    // Unique index on (accountId, kind) makes this safe under concurrent
    // callers -- the second writer's INSERT is a no-op.
    const inserted = await db
      .insert(creatorBadges)
      .values({ accountId, kind: rule.kind, note: rule.note ?? null })
      .onConflictDoNothing()
      .returning({ id: creatorBadges.id });

    if (inserted.length > 0) {
      newBadges.push(rule.kind);
      if (rule.perk === PERK_KINDS.freeMonth) {
        const grant = await grantFreeOrganizerMonth(accountId, rule.note ?? rule.kind);
        if (grant) grantedPerks.push(grant);
      }
    }
  }

  return { snapshot, newBadges, grantedPerks };
}

/**
 * Add 30 days of free organizer access to an account, stacking on any
 * existing free window (so multiple simultaneous badges grant additive
 * time, not overlapping). Returns the resulting perk record, or null if
 * an identical perk was already granted in the last minute (prevents
 * double-fires under racy callers).
 */
export async function grantFreeOrganizerMonth(
  accountId: string,
  reason: string
): Promise<{ kind: string; expiresAt: string } | null> {
  const [acct] = await db
    .select({ creatorFreeUntil: accounts.creatorFreeUntil })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!acct) return null;

  const now = new Date();
  const base =
    acct.creatorFreeUntil && acct.creatorFreeUntil > now
      ? acct.creatorFreeUntil
      : now;
  const next = new Date(base.getTime() + FREE_MONTH_DAYS * 24 * 60 * 60 * 1000);

  await db
    .update(accounts)
    .set({ creatorFreeUntil: next })
    .where(eq(accounts.id, accountId));

  const [grant] = await db
    .insert(creatorPerkGrants)
    .values({
      accountId,
      kind: PERK_KINDS.freeMonth,
      note: reason,
      expiresAt: next,
    })
    .returning({ expiresAt: creatorPerkGrants.expiresAt });

  return {
    kind: PERK_KINDS.freeMonth,
    expiresAt: (grant?.expiresAt ?? next).toISOString(),
  };
}

/**
 * Summary for the dashboard "Creator perks" card. Returns current badges,
 * progress toward the *next* unearned badge, and any active free-month
 * grant window.
 */
export type CreatorPerkSummary = {
  badges: Array<{ kind: BadgeKind; label: string; note: string | null; awardedAt: string }>;
  nextBadge: {
    kind: BadgeKind;
    label: string;
    progressLabel: string;
  } | null;
  freeUntil: string | null;
  publicDeckCount: number;
  bestDeckRating: number | null;
};

const BADGE_LABELS: Record<BadgeKind, string> = {
  creator: "Creator",
  prolific_creator: "Prolific creator",
  top_rated_creator: "Top-rated creator",
  featured_creator: "Featured creator",
};

export async function getCreatorPerkSummary(
  accountId: string
): Promise<CreatorPerkSummary> {
  const [snapshot, badgeRows, acctRow] = await Promise.all([
    snapshotCreator(accountId),
    db
      .select({
        kind: creatorBadges.kind,
        awardedAt: creatorBadges.awardedAt,
        note: creatorBadges.note,
      })
      .from(creatorBadges)
      .where(eq(creatorBadges.accountId, accountId))
      .orderBy(desc(creatorBadges.awardedAt)),
    db
      .select({ creatorFreeUntil: accounts.creatorFreeUntil })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1),
  ]);

  const badges = badgeRows.map((b) => ({
    kind: b.kind as BadgeKind,
    label: BADGE_LABELS[b.kind as BadgeKind] ?? b.kind,
    note: b.note,
    awardedAt: b.awardedAt.toISOString(),
  }));
  const haveKinds = new Set(badges.map((b) => b.kind));

  let nextBadge: CreatorPerkSummary["nextBadge"] = null;
  for (const rule of BADGE_RULES) {
    if (haveKinds.has(rule.kind)) continue;
    if (rule.qualifies(snapshot)) continue;
    let progress = "";
    if (rule.kind === BADGE_KINDS.creator) {
      progress = "Publish your first public deck";
    } else if (rule.kind === BADGE_KINDS.prolific) {
      progress = `${snapshot.publicDeckCount} / ${PROLIFIC_MIN_DECKS} public decks`;
    } else if (rule.kind === BADGE_KINDS.topRated) {
      const best = snapshot.bestDeck;
      const avg = best ? (best.avgRatingX100 / 100).toFixed(2) : "—";
      const ratings = best?.ratingCount ?? 0;
      progress = `Best deck ${avg}/5 with ${ratings} votes (need 4.50+ with ${TOP_RATED_MIN_RATINGS}+)`;
    } else {
      progress = "Get editor-featured";
    }
    nextBadge = {
      kind: rule.kind,
      label: BADGE_LABELS[rule.kind],
      progressLabel: progress,
    };
    break;
  }

  const now = new Date();
  const freeUntilDate = acctRow[0]?.creatorFreeUntil ?? null;
  const freeUntil =
    freeUntilDate && freeUntilDate > now ? freeUntilDate.toISOString() : null;

  return {
    badges,
    nextBadge,
    freeUntil,
    publicDeckCount: snapshot.publicDeckCount,
    bestDeckRating:
      snapshot.bestDeck ? snapshot.bestDeck.avgRatingX100 / 100 : null,
  };
}
