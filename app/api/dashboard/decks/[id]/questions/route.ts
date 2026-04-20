import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { questions } from "@/lib/db/schema";
import { getDeckById, listDeckQuestions } from "@/lib/decks";

const createSchema = z.object({
  body: z.string().trim().min(5).max(500),
  correctAnswer: z.string().trim().min(1).max(160),
  wrongAnswers: z.array(z.string().trim().min(1).max(160)).length(3),
  category: z.string().trim().max(120).optional(),
  subcategory: z.string().trim().max(120).optional(),
  difficulty: z.number().int().min(1).max(3).default(2),
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
  const rows = await listDeckQuestions(resolved.deck.id);
  return NextResponse.json({ questions: rows });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const resolved = await resolveOwnedDeck(id);
  if ("error" in resolved) return resolved.error;

  // Public decks are frozen; submitted decks are locked while they wait for
  // review so admins don't race with the author.
  if (resolved.deck.visibility === "public" || resolved.deck.visibility === "submitted") {
    return NextResponse.json(
      { error: "Deck is locked while under review or after public approval." },
      { status: 409 }
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const category =
    parsed.data.category?.trim() || resolved.deck.defaultCategory || "Custom";
  const subcategory =
    parsed.data.subcategory?.trim() || resolved.deck.defaultSubcategory || "Custom";

  const [row] = await db
    .insert(questions)
    .values({
      body: parsed.data.body,
      correctAnswer: parsed.data.correctAnswer,
      wrongAnswers: parsed.data.wrongAnswers,
      category,
      subcategory,
      difficulty: parsed.data.difficulty,
      // Deck-authored questions are only exposed to the deck owner's own games
      // until the deck is approved public; setting `vetted = true` is fine
      // because smart-pull filters by deck ownership separately.
      vetted: true,
      retired: false,
      deckId: resolved.deck.id,
      authorAccountId: resolved.account.id,
    })
    .returning();

  return NextResponse.json({ question: row });
}
