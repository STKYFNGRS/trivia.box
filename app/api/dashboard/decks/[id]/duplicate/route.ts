import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { apiErrorResponse } from "@/lib/apiError";
import { db } from "@/lib/db/client";
import { questionDecks, questions } from "@/lib/db/schema";
import {
  getDeckById,
  listDeckQuestions,
  slugifyDeckName,
} from "@/lib/decks";

export const dynamic = "force-dynamic";

/**
 * Duplicate a deck the viewer owns OR a public deck they can read.
 *
 * The clone is created as a new private deck owned by the viewer with the
 * same `default*` metadata and a fresh copy of every vetted question (we do
 * not carry over `timesUsed` or the original `authorAccountId` because those
 * rollups belong to the source deck). Perfect for creators who want to
 * iterate on an approved deck without trashing the frozen version.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const account = await getAccountByClerkUserId(userId);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { id } = await ctx.params;
    const source = await getDeckById(id);
    if (!source) {
      return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    }

    // Anyone can clone a public deck; private decks only by their owner.
    const canClone =
      source.visibility === "public" || source.ownerAccountId === account.id;
    if (!canClone) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Allocate a unique owner-scoped slug with a "-copy" suffix so it never
    // clashes with the original.
    const baseName = `${source.name} (copy)`;
    const base = slugifyDeckName(baseName);
    const candidates = [base, ...Array.from({ length: 20 }, (_, i) => `${base}-${i + 2}`)];
    const existing = await db
      .select({ slug: questionDecks.slug })
      .from(questionDecks)
      .where(inArray(questionDecks.slug, candidates));
    const taken = new Set(existing.map((r) => r.slug));
    let slug = base;
    let n = 2;
    while (taken.has(slug) && n < 200) {
      slug = `${base}-${n}`;
      n += 1;
    }

    const [clone] = await db
      .insert(questionDecks)
      .values({
        ownerAccountId: account.id,
        name: baseName,
        slug,
        description: source.description,
        defaultCategory: source.defaultCategory,
        defaultSubcategory: source.defaultSubcategory,
        visibility: "private",
      })
      .returning();
    if (!clone) {
      return NextResponse.json({ error: "Failed to clone deck" }, { status: 500 });
    }

    const sourceQuestions = await listDeckQuestions(source.id);
    if (sourceQuestions.length > 0) {
      await db.insert(questions).values(
        sourceQuestions.map((q) => ({
          body: q.body,
          correctAnswer: q.correctAnswer,
          wrongAnswers: q.wrongAnswers,
          category: q.category,
          subcategory: q.subcategory,
          difficulty: q.difficulty,
          timeHint: q.timeHint,
          // Cloned questions start unvetted so public decks don't flood the
          // live pool — the owner can re-submit for review from the deck UI.
          vetted: false,
          retired: false,
          deckId: clone.id,
          authorAccountId: account.id,
        }))
      );
    }

    // Best-effort: carry over flags is NOT done — the review state on the
    // original deck is irrelevant to the clone. Return the canonical row
    // so the client can route the user straight to the editor.
    const [refreshed] = await db
      .select()
      .from(questionDecks)
      .where(and(eq(questionDecks.id, clone.id)))
      .limit(1);

    return NextResponse.json({
      deck: refreshed ?? clone,
      copiedQuestions: sourceQuestions.length,
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
