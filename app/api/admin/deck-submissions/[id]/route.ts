import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSiteAdminResponse } from "@/lib/adminApi";
import { db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { getDeckById, listDeckQuestions } from "@/lib/decks";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const forbidden = await requireSiteAdminResponse();
  if (forbidden) return forbidden;

  const { id } = await ctx.params;
  const deck = await getDeckById(id);
  if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });

  const [owner] = await db
    .select({ id: accounts.id, name: accounts.name, email: accounts.email })
    .from(accounts)
    .where(eq(accounts.id, deck.ownerAccountId))
    .limit(1);

  const questions = await listDeckQuestions(deck.id);

  return NextResponse.json({ deck, owner: owner ?? null, questions });
}
