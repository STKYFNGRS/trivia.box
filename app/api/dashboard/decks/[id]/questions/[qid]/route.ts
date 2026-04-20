import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { questions } from "@/lib/db/schema";
import { getDeckById } from "@/lib/decks";

const patchSchema = z.object({
  body: z.string().trim().min(5).max(500).optional(),
  correctAnswer: z.string().trim().min(1).max(160).optional(),
  wrongAnswers: z.array(z.string().trim().min(1).max(160)).length(3).optional(),
  category: z.string().trim().max(120).optional(),
  subcategory: z.string().trim().max(120).optional(),
  difficulty: z.number().int().min(1).max(3).optional(),
});

async function resolveOwnedDeckQuestion(deckId: string, qid: string) {
  const { userId } = await auth();
  if (!userId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const account = await getAccountByClerkUserId(userId);
  if (!account) return { error: NextResponse.json({ error: "Account not found" }, { status: 400 }) };
  const deck = await getDeckById(deckId);
  if (!deck) return { error: NextResponse.json({ error: "Deck not found" }, { status: 404 }) };
  if (deck.ownerAccountId !== account.id) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const [q] = await db
    .select()
    .from(questions)
    .where(and(eq(questions.id, qid), eq(questions.deckId, deckId)))
    .limit(1);
  if (!q) return { error: NextResponse.json({ error: "Question not found" }, { status: 404 }) };
  return { account, deck, question: q };
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; qid: string }> }
) {
  const { id, qid } = await ctx.params;
  const resolved = await resolveOwnedDeckQuestion(id, qid);
  if ("error" in resolved) return resolved.error;

  if (resolved.deck.visibility === "public" || resolved.deck.visibility === "submitted") {
    return NextResponse.json(
      { error: "Deck is locked while under review or after public approval." },
      { status: 409 }
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) updates[k] = v;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ question: resolved.question });
  }

  const [row] = await db
    .update(questions)
    .set(updates)
    .where(eq(questions.id, qid))
    .returning();
  return NextResponse.json({ question: row });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; qid: string }> }
) {
  const { id, qid } = await ctx.params;
  const resolved = await resolveOwnedDeckQuestion(id, qid);
  if ("error" in resolved) return resolved.error;

  if (resolved.deck.visibility === "public" || resolved.deck.visibility === "submitted") {
    return NextResponse.json(
      { error: "Deck is locked while under review or after public approval." },
      { status: 409 }
    );
  }

  // We retire rather than hard-delete so any already-scheduled session that
  // pinned this question keeps its reference; the smart-pull + library UIs
  // filter `retired=false`.
  await db.update(questions).set({ retired: true }).where(eq(questions.id, qid));
  return NextResponse.json({ ok: true });
}
