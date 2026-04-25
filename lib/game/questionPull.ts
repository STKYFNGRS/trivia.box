import { and, count, eq, gte, inArray, notInArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { questionVenueHistory, questions } from "@/lib/db/schema";
import { shuffleArray } from "@/lib/game/shuffleChoices";

export type PulledQuestion = typeof questions.$inferSelect;

/** Load vetted questions by explicit IDs (order preserved). Throws if any ID missing or not vetted. */
export async function getVettedQuestionsByOrderedIds(
  ids: string[],
  opts?: { expectedCategory?: string }
): Promise<PulledQuestion[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(questions)
    .where(
      and(
        inArray(questions.id, ids),
        eq(questions.vetted, true),
        eq(questions.retired, false)
      )
    );
  const map = new Map(rows.map((r) => [r.id, r]));
  const ordered: PulledQuestion[] = [];
  for (const id of ids) {
    const q = map.get(id);
    if (!q) {
      throw new Error(`Question not found or not vetted: ${id}`);
    }
    if (opts?.expectedCategory && q.category !== opts.expectedCategory) {
      throw new Error(
        `Question ${id} is category "${q.category}" but this round expects "${opts.expectedCategory}"`
      );
    }
    ordered.push(q);
  }
  return ordered;
}

function roundBoost(roundNumber: number): number {
  return 1 + Math.min(3, Math.max(0, roundNumber - 1)) * 0.15;
}

/** Count of vetted questions in `category` eligible for smart pull (same filters as `smartPullQuestions` base set). */
export async function countSmartPullEligible(input: {
  venueAccountId: string;
  category: string;
  /** Optional narrower filter (e.g. "90s movies") used by themed house games. */
  subcategory?: string;
  excludeQuestionIds: string[];
}): Promise<number> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const recentRows = await db
    .select({ questionId: questionVenueHistory.questionId })
    .from(questionVenueHistory)
    .where(
      and(
        eq(questionVenueHistory.venueAccountId, input.venueAccountId),
        gte(questionVenueHistory.usedAt, since)
      )
    );

  const recentSet = new Set(recentRows.map((r) => r.questionId));
  const exclude = new Set([...input.excludeQuestionIds, ...recentSet]);
  const excludeList = [...exclude];

  const [row] = await db
    .select({ n: count() })
    .from(questions)
    .where(
      and(
        eq(questions.vetted, true),
        eq(questions.retired, false),
        eq(questions.category, input.category),
        input.subcategory ? eq(questions.subcategory, input.subcategory) : undefined,
        excludeList.length ? notInArray(questions.id, excludeList) : undefined
      )
    );

  return row?.n ?? 0;
}

/**
 * Smart pull: vetted, not retired, not used at venue in last 90 days,
 * max 2 per subcategory (soft constraint, relaxed if needed), harder bias in later rounds.
 *
 * When `subcategory` is provided, all candidates are narrowed to that topic —
 * used by themed house games so every round sticks to the same subject. The
 * max-2-per-subcategory soft constraint is skipped in that case (every row
 * shares a single subcategory, so the constraint would starve the round).
 */
export async function smartPullQuestions(input: {
  venueAccountId: string;
  roundNumber: number;
  category: string;
  /** Optional narrower filter (e.g. "90s movies") used by themed house games. */
  subcategory?: string;
  count: number;
  excludeQuestionIds: string[];
}): Promise<PulledQuestion[]> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const recentRows = await db
    .select({ questionId: questionVenueHistory.questionId })
    .from(questionVenueHistory)
    .where(
      and(
        eq(questionVenueHistory.venueAccountId, input.venueAccountId),
        gte(questionVenueHistory.usedAt, since)
      )
    );

  const recentSet = new Set(recentRows.map((r) => r.questionId));
  const exclude = new Set([...input.excludeQuestionIds, ...recentSet]);
  const excludeList = [...exclude];

  const base = await db
    .select()
    .from(questions)
    .where(
      and(
        eq(questions.vetted, true),
        eq(questions.retired, false),
        eq(questions.category, input.category),
        input.subcategory ? eq(questions.subcategory, input.subcategory) : undefined,
        excludeList.length ? notInArray(questions.id, excludeList) : undefined
      )
    );

  if (base.length === 0) {
    return [];
  }

  const boost = roundBoost(input.roundNumber);
  const weighted = base.map((q) => ({
    q,
    w: Math.random() + (q.difficulty - 1) * 0.25 * boost,
  }));
  weighted.sort((a, b) => b.w - a.w);
  const ordered = weighted.map((x) => x.q);

  // Themed pulls collapse to the chosen subcategory, so the max-2-per-subcat
  // guard would starve them. Skip the guard in that mode.
  const enforceSubcatCap = !input.subcategory;

  const picked: PulledQuestion[] = [];
  const subcatCounts = new Map<string, number>();

  for (const q of ordered) {
    if (picked.length >= input.count) break;
    if (enforceSubcatCap) {
      const c = subcatCounts.get(q.subcategory) ?? 0;
      if (c >= 2) continue;
      subcatCounts.set(q.subcategory, c + 1);
    }
    picked.push(q);
  }

  if (picked.length < input.count && enforceSubcatCap) {
    for (const q of shuffleArray(base)) {
      if (picked.length >= input.count) break;
      if (picked.some((p) => p.id === q.id)) continue;
      const c = subcatCounts.get(q.subcategory) ?? 0;
      if (c >= 2) continue;
      picked.push(q);
      subcatCounts.set(q.subcategory, c + 1);
    }
  }

  if (picked.length < input.count) {
    for (const q of shuffleArray(base)) {
      if (picked.length >= input.count) break;
      if (picked.some((p) => p.id === q.id)) continue;
      picked.push(q);
    }
  }

  return picked.slice(0, input.count);
}
