import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { questionDecks } from "@/lib/db/schema";
import { getDeckById, countDeckQuestions, listDeckQuestions } from "@/lib/decks";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(400).nullable().optional(),
  defaultCategory: z.string().trim().max(120).nullable().optional(),
  defaultSubcategory: z.string().trim().max(120).nullable().optional(),
});

async function resolveOwnedDeck(deckId: string) {
  const { userId } = await auth();
  if (!userId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const account = await getAccountByClerkUserId(userId);
  if (!account) return { error: NextResponse.json({ error: "Account not found" }, { status: 400 }) };
  const deck = await getDeckById(deckId);
  if (!deck) return { error: NextResponse.json({ error: "Deck not found" }, { status: 404 }) };
  if (deck.ownerAccountId !== account.id) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { account, deck };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const resolved = await resolveOwnedDeck(id);
  if ("error" in resolved) return resolved.error;

  const [deckQuestions, total] = await Promise.all([
    listDeckQuestions(resolved.deck.id),
    countDeckQuestions(resolved.deck.id),
  ]);

  return NextResponse.json({
    deck: resolved.deck,
    questions: deckQuestions,
    questionCount: total,
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const resolved = await resolveOwnedDeck(id);
  if ("error" in resolved) return resolved.error;

  // Editing an approved/public deck is intentionally blocked: approved decks
  // are frozen to preserve admin-review guarantees. Owners can clone to make
  // changes and re-submit.
  if (resolved.deck.visibility === "public") {
    return NextResponse.json(
      { error: "Approved public decks are frozen. Create a new deck to make changes." },
      { status: 409 }
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.defaultCategory !== undefined) updates.defaultCategory = parsed.data.defaultCategory;
  if (parsed.data.defaultSubcategory !== undefined) updates.defaultSubcategory = parsed.data.defaultSubcategory;

  const [row] = await db
    .update(questionDecks)
    .set(updates)
    .where(eq(questionDecks.id, resolved.deck.id))
    .returning();

  return NextResponse.json({ deck: row });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const resolved = await resolveOwnedDeck(id);
  if ("error" in resolved) return resolved.error;

  // Safety: once a deck is public, other hosts may have scheduled games that
  // reference its questions; we refuse to delete (owner can still edit names
  // via clone-and-resubmit).
  if (resolved.deck.visibility === "public") {
    return NextResponse.json({ error: "Cannot delete an approved public deck." }, { status: 409 });
  }

  await db.delete(questionDecks).where(eq(questionDecks.id, resolved.deck.id));
  return NextResponse.json({ ok: true });
}
