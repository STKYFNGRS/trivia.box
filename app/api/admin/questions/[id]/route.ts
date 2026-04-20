import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminResponse } from "@/lib/adminApi";
import { db } from "@/lib/db/client";
import { questions, sessionQuestions } from "@/lib/db/schema";

const patchSchema = z
  .object({
    body: z.string().min(1).optional(),
    correctAnswer: z.string().min(1).optional(),
    wrongAnswers: z.array(z.string()).length(3).optional(),
    category: z.string().min(1).optional(),
    subcategory: z.string().min(1).optional(),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    timeHint: z.union([z.literal(10), z.literal(20), z.literal(30)]).optional(),
    vetted: z.boolean().optional(),
    retired: z.boolean().optional(),
  })
  .strict();

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminResponse();
  if (gate) return gate;

  const { id } = await ctx.params;
  const rows = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ question: row });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminResponse();
  if (gate) return gate;

  const { id } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [row] = await db.update(questions).set(parsed.data).where(eq(questions.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ question: row });
}

/**
 * Delete a question. If the question has ever been served in a live session
 * (`session_questions` row exists) we can't hard-delete without torching the
 * historical answers / leaderboards that depend on it, and the FK is
 * intentionally `NO ACTION` to protect that history. In that case we
 * soft-retire instead (`retired = true`) so it's excluded from pulls,
 * coverage, and the default library view but past game records stay intact.
 *
 * Response shape:
 *   { ok: true, mode: "deleted" }  — hard delete succeeded
 *   { ok: true, mode: "retired" }  — had session refs, flipped `retired = true`
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminResponse();
  if (gate) return gate;

  const { id } = await ctx.params;

  const [usage] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(sessionQuestions)
    .where(eq(sessionQuestions.questionId, id));
  const refCount = Number(usage?.c ?? 0);

  if (refCount > 0) {
    const [row] = await db
      .update(questions)
      .set({ retired: true })
      .where(eq(questions.id, id))
      .returning();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, mode: "retired", referencedBy: refCount });
  }

  const result = await db
    .delete(questions)
    .where(eq(questions.id, id))
    .returning({ id: questions.id });
  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, mode: "deleted" });
}
