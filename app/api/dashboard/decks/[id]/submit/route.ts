import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { questionDecks } from "@/lib/db/schema";
import {
  countDeckQuestions,
  getDeckById,
  isValidVisibilityTransition,
  type DeckVisibility,
} from "@/lib/decks";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const account = await getAccountByClerkUserId(userId);
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 400 });

  const deck = await getDeckById(id);
  if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  if (deck.ownerAccountId !== account.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isValidVisibilityTransition(deck.visibility as DeckVisibility, "submitted")) {
    return NextResponse.json(
      { error: `Cannot submit from visibility=${deck.visibility}` },
      { status: 409 }
    );
  }

  const total = await countDeckQuestions(deck.id);
  if (total < 3) {
    return NextResponse.json(
      { error: "Deck needs at least 3 questions before submission." },
      { status: 400 }
    );
  }

  const [row] = await db
    .update(questionDecks)
    .set({
      visibility: "submitted",
      submittedAt: new Date(),
      reviewNote: null,
      reviewedAt: null,
      reviewedByAccountId: null,
      updatedAt: new Date(),
    })
    .where(eq(questionDecks.id, deck.id))
    .returning();

  return NextResponse.json({ deck: row });
}
