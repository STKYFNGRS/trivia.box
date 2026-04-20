import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { questionDecks, questions } from "@/lib/db/schema";
import { slugifyText } from "@/lib/slug";

export type DeckRow = typeof questionDecks.$inferSelect;
export type DeckQuestionRow = typeof questions.$inferSelect;

export type DeckVisibility =
  | "private"
  | "game_scoped"
  | "submitted"
  | "public"
  | "rejected";

/**
 * Returns whether the given `transition` from `from` -> `to` is valid.
 * Used by host submit + admin approve/reject flows; tested in unit tests.
 */
export function isValidVisibilityTransition(from: DeckVisibility, to: DeckVisibility): boolean {
  if (from === to) return false;
  if (from === "private") return to === "submitted";
  if (from === "submitted") return to === "public" || to === "rejected" || to === "private";
  if (from === "rejected") return to === "private" || to === "submitted";
  if (from === "public") return false; // approved decks are frozen
  if (from === "game_scoped") return false; // hidden per-game decks are terminal
  return false;
}

/**
 * Turns a proposed name into a stable owner-scoped slug. Uniqueness per owner
 * is enforced by the `question_decks_owner_slug_unique` index; callers should
 * retry with a numeric suffix on 23505 errors.
 */
export function slugifyDeckName(name: string): string {
  return slugifyText(name, { maxLength: 60, fallback: "deck" });
}

export async function getDeckById(deckId: string): Promise<DeckRow | null> {
  const [row] = await db.select().from(questionDecks).where(eq(questionDecks.id, deckId)).limit(1);
  return row ?? null;
}

export async function listDecksByOwner(ownerAccountId: string): Promise<DeckRow[]> {
  return db
    .select()
    .from(questionDecks)
    .where(eq(questionDecks.ownerAccountId, ownerAccountId))
    .orderBy(sql`${questionDecks.updatedAt} DESC`);
}

export async function listPublicDecks(): Promise<DeckRow[]> {
  return db
    .select()
    .from(questionDecks)
    .where(eq(questionDecks.visibility, "public"))
    .orderBy(sql`${questionDecks.updatedAt} DESC`);
}

export async function listSubmittedDecks(): Promise<DeckRow[]> {
  return db
    .select()
    .from(questionDecks)
    .where(eq(questionDecks.visibility, "submitted"))
    .orderBy(sql`${questionDecks.submittedAt} ASC`);
}

export async function listDeckQuestions(deckId: string): Promise<DeckQuestionRow[]> {
  return db
    .select()
    .from(questions)
    .where(and(eq(questions.deckId, deckId), eq(questions.retired, false)))
    .orderBy(sql`${questions.createdAt} ASC`);
}

export async function countDeckQuestions(deckId: string): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)` })
    .from(questions)
    .where(and(eq(questions.deckId, deckId), eq(questions.retired, false)));
  return Number(row?.c ?? 0);
}

/**
 * Returns a map of deck id -> non-retired question count. Used by admin +
 * public list screens to show totals without an N+1.
 */
export async function countQuestionsForDecks(deckIds: string[]): Promise<Map<string, number>> {
  if (deckIds.length === 0) return new Map();
  const rows = await db
    .select({
      deckId: questions.deckId,
      c: sql<number>`count(*)`,
    })
    .from(questions)
    .where(and(inArray(questions.deckId, deckIds), eq(questions.retired, false)))
    .groupBy(questions.deckId);
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.deckId) map.set(r.deckId, Number(r.c));
  }
  return map;
}
