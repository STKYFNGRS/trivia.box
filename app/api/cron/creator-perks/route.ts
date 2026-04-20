import { and, eq, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recomputeCreatorBadges } from "@/lib/creatorPerks";
import { cronAuthOrResponse } from "@/lib/cronAuth";
import { db } from "@/lib/db/client";
import { deckStats, questionDecks } from "@/lib/db/schema";

const bodySchema = z.object({
  /** Max creators to recompute in a single run. Keeps cron jobs bounded. */
  maxCreators: z.number().int().min(1).max(500).optional().default(200),
  /** Look-back window in hours for finding "new activity". */
  windowHours: z.number().int().min(1).max(240).optional().default(24),
});

/**
 * Phase 3.3 safety net: walks accounts with recent deck activity (new public
 * decks, new ratings) and runs `recomputeCreatorBadges` on each. Badge
 * awards are also triggered inline from deck approval and rating writes, so
 * this cron only covers gaps (missed webhooks, schema backfills, etc.).
 *
 * Recommended schedule: daily.
 */
async function run(req: Request) {
  const unauthorized = cronAuthOrResponse(req);
  if (unauthorized) return unauthorized;

  const json = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const since = new Date(
    Date.now() - parsed.data.windowHours * 60 * 60 * 1000
  );

  // Distinct owners with public decks created or rated/bumped in the
  // look-back window. Union over `question_decks.createdAt` and
  // `deck_stats.updatedAt` so rating changes flow in too.
  const recentOwners = await db
    .selectDistinct({ ownerAccountId: questionDecks.ownerAccountId })
    .from(questionDecks)
    .leftJoin(deckStats, eq(deckStats.deckId, questionDecks.id))
    .where(
      and(
        eq(questionDecks.visibility, "public"),
        sql`COALESCE(${deckStats.updatedAt}, ${questionDecks.createdAt}) >= ${since}`
      )
    )
    .orderBy(questionDecks.ownerAccountId)
    .limit(parsed.data.maxCreators);

  // `gte` is imported so TS knows we consciously chose `sql` COALESCE above,
  // because Drizzle's `gte` can't target a COALESCE expression directly.
  void gte;

  const results: Array<{ accountId: string; newBadges: string[] }> = [];
  for (const row of recentOwners) {
    try {
      const r = await recomputeCreatorBadges(row.ownerAccountId);
      if (r.newBadges.length > 0) {
        results.push({ accountId: row.ownerAccountId, newBadges: r.newBadges });
      }
    } catch (err) {
      console.error("creator-perks cron failure", row.ownerAccountId, err);
    }
  }

  return NextResponse.json({
    checked: recentOwners.length,
    newlyBadged: results.length,
    results,
  });
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}

export const dynamic = "force-dynamic";
