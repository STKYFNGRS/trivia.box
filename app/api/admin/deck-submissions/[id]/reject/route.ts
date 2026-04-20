import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { requireSiteAdminResponse } from "@/lib/adminApi";
import { db } from "@/lib/db/client";
import { questionDecks } from "@/lib/db/schema";
import { getDeckById, isValidVisibilityTransition, type DeckVisibility } from "@/lib/decks";

const schema = z.object({
  note: z.string().trim().max(500).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const forbidden = await requireSiteAdminResponse();
  if (forbidden) return forbidden;

  const { id } = await ctx.params;
  const deck = await getDeckById(id);
  if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });

  if (!isValidVisibilityTransition(deck.visibility as DeckVisibility, "rejected")) {
    return NextResponse.json(
      { error: `Deck is not in a reviewable state (${deck.visibility})` },
      { status: 409 }
    );
  }

  const json = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await currentUser();
  const reviewer = user ? await getAccountByClerkUserId(user.id) : null;
  const now = new Date();

  const [updated] = await db
    .update(questionDecks)
    .set({
      visibility: "rejected",
      reviewedAt: now,
      reviewedByAccountId: reviewer?.id ?? null,
      reviewNote: parsed.data.note ?? null,
      updatedAt: now,
    })
    .where(eq(questionDecks.id, deck.id))
    .returning();

  return NextResponse.json({ deck: updated });
}
