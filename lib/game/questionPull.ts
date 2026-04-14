import { and, eq, gte, notInArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { questionVenueHistory, questions } from "@/lib/db/schema";

export type PulledQuestion = typeof questions.$inferSelect;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function roundBoost(roundNumber: number): number {
  return 1 + Math.min(3, Math.max(0, roundNumber - 1)) * 0.15;
}

/**
 * Smart pull: vetted, not retired, not used at venue in last 90 days,
 * max 2 per subcategory (soft constraint, relaxed if needed), harder bias in later rounds.
 */
export async function smartPullQuestions(input: {
  venueAccountId: string;
  roundNumber: number;
  category: string;
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

  const picked: PulledQuestion[] = [];
  const subcatCounts = new Map<string, number>();

  for (const q of ordered) {
    if (picked.length >= input.count) break;
    const c = subcatCounts.get(q.subcategory) ?? 0;
    if (c >= 2) continue;
    picked.push(q);
    subcatCounts.set(q.subcategory, c + 1);
  }

  if (picked.length < input.count) {
    for (const q of shuffle(base)) {
      if (picked.length >= input.count) break;
      if (picked.some((p) => p.id === q.id)) continue;
      const c = subcatCounts.get(q.subcategory) ?? 0;
      if (c >= 2) continue;
      picked.push(q);
      subcatCounts.set(q.subcategory, c + 1);
    }
  }

  if (picked.length < input.count) {
    for (const q of shuffle(base)) {
      if (picked.length >= input.count) break;
      if (picked.some((p) => p.id === q.id)) continue;
      picked.push(q);
    }
  }

  return picked.slice(0, input.count);
}
