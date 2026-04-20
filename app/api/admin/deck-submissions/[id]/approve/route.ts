import { currentUser } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { requireSiteAdminResponse } from "@/lib/adminApi";
import { recomputeCreatorBadges } from "@/lib/creatorPerks";
import { db } from "@/lib/db/client";
import { questionDecks, questions } from "@/lib/db/schema";
import { getDeckById, isValidVisibilityTransition, type DeckVisibility } from "@/lib/decks";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const forbidden = await requireSiteAdminResponse();
  if (forbidden) return forbidden;

  const { id } = await ctx.params;
  const deck = await getDeckById(id);
  if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });

  if (!isValidVisibilityTransition(deck.visibility as DeckVisibility, "public")) {
    return NextResponse.json(
      { error: `Deck is not in a reviewable state (${deck.visibility})` },
      { status: 409 }
    );
  }

  const user = await currentUser();
  const reviewer = user ? await getAccountByClerkUserId(user.id) : null;
  const now = new Date();

  const [updated] = await db
    .update(questionDecks)
    .set({
      visibility: "public",
      reviewedAt: now,
      reviewedByAccountId: reviewer?.id ?? null,
      reviewNote: null,
      updatedAt: now,
    })
    .where(eq(questionDecks.id, deck.id))
    .returning();

  // Once public, every deck question should be vetted=true so the site-wide
  // smart-pull and "library" filters surface them consistently with the
  // AI-approved pool. Retired flags are left untouched.
  await db
    .update(questions)
    .set({ vetted: true })
    .where(and(eq(questions.deckId, deck.id), eq(questions.retired, false)));

  // Phase 3.3: award creator badges + free-tier perks after approval. Wrapped
  // in try/catch so a perks outage never blocks a valid admin action.
  try {
    await recomputeCreatorBadges(deck.ownerAccountId);
  } catch (err) {
    console.error("recomputeCreatorBadges failed after approve", err);
  }

  return NextResponse.json({ deck: updated });
}
