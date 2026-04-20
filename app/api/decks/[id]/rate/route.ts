import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { apiErrorResponse, zodErrorResponse } from "@/lib/apiError";
import { db } from "@/lib/db/client";
import { deckRatings, questionDecks } from "@/lib/db/schema";
import { getPlayerByAccountId } from "@/lib/players";
import { recomputeCreatorBadges } from "@/lib/creatorPerks";
import { recomputeDeckRatingRollup } from "@/lib/deckMarketplace";
import { enforceRateLimit } from "@/lib/rateLimit";

const schema = z.object({
  score: z.number().int().min(1).max(5),
});

/**
 * Rate a deck 1..5. Requires a signed-in player (guests can't rate). Upserts
 * on (deck, player) so ratings are never double-counted; recomputes the
 * `deckStats` rollup after each write so the marketplace sort stays accurate.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  }

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to rate" }, { status: 401 });

  const account = await getAccountByClerkUserId(userId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  const player = await getPlayerByAccountId(account.id);
  if (!player) {
    return NextResponse.json({ error: "Player profile missing" }, { status: 404 });
  }

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return zodErrorResponse(parsed.error, "Invalid rating");

  try {
    await enforceRateLimit("anonymous", `deckRate:player:${player.id}`);
  } catch (e) {
    return apiErrorResponse(e);
  }

  // Only ratings on public decks count. Reject private / submitted / rejected
  // decks early so an attacker can't seed stats before approval.
  const deckRows = await db
    .select({ visibility: questionDecks.visibility, ownerAccountId: questionDecks.ownerAccountId })
    .from(questionDecks)
    .where(eq(questionDecks.id, id))
    .limit(1);
  const deck = deckRows[0];
  if (!deck || deck.visibility !== "public") {
    return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  }
  if (deck.ownerAccountId === account.id) {
    return NextResponse.json({ error: "You can't rate your own deck" }, { status: 400 });
  }

  const existing = await db
    .select({ id: deckRatings.id })
    .from(deckRatings)
    .where(and(eq(deckRatings.deckId, id), eq(deckRatings.playerId, player.id)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(deckRatings)
      .set({ score: parsed.data.score, updatedAt: new Date() })
      .where(eq(deckRatings.id, existing[0]!.id));
  } else {
    await db.insert(deckRatings).values({
      deckId: id,
      playerId: player.id,
      score: parsed.data.score,
    });
  }

  await recomputeDeckRatingRollup(id);

  // Phase 3.3: a crossed-threshold rating may unlock a creator badge
  // (top-rated) and associated free-month perk. Non-fatal.
  try {
    await recomputeCreatorBadges(deck.ownerAccountId);
  } catch (err) {
    console.error("recomputeCreatorBadges failed after rating", err);
  }

  return NextResponse.json({ ok: true, score: parsed.data.score });
}

export const dynamic = "force-dynamic";
