import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSiteAdminResponse } from "@/lib/adminApi";
import { db } from "@/lib/db/client";
import { questionDrafts, questions } from "@/lib/db/schema";

const bodySchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireSiteAdminResponse();
  if (gate) return gate;

  const { id } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rows = await db.select().from(questionDrafts).where(eq(questionDrafts.id, id)).limit(1);
  const draft = rows[0];
  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  if (draft.status !== "pending_review") {
    return NextResponse.json({ error: "Draft is not pending review" }, { status: 400 });
  }

  if (draft.wrongAnswers.length !== 3) {
    return NextResponse.json({ error: "Draft must have exactly 3 wrong answers" }, { status: 400 });
  }

  if (parsed.data.action === "reject") {
    await db
      .update(questionDrafts)
      .set({
        status: "rejected",
        reviewNote: parsed.data.note ?? "Rejected",
        reviewedAt: new Date(),
      })
      .where(eq(questionDrafts.id, id));
    return NextResponse.json({ ok: true });
  }

  // Approve atomically: if the draft update fails, the newly-inserted vetted
  // question is rolled back so we never leak orphan questions or leave the
  // draft stuck in `pending_review` after a successful insert.
  try {
    const questionId = await db.transaction(async (tx) => {
      const [q] = await tx
        .insert(questions)
        .values({
          body: draft.body,
          correctAnswer: draft.correctAnswer,
          wrongAnswers: draft.wrongAnswers,
          category: draft.category,
          subcategory: draft.subcategory,
          difficulty: draft.difficulty,
          timeHint: draft.timeHint,
          vetted: true,
          retired: false,
        })
        .returning({ id: questions.id });

      if (!q) {
        throw new Error("Failed to create vetted question");
      }

      await tx
        .update(questionDrafts)
        .set({
          status: "approved",
          reviewNote: parsed.data.note ?? "Approved",
          reviewedAt: new Date(),
        })
        .where(eq(questionDrafts.id, id));

      return q.id;
    });

    return NextResponse.json({ ok: true, questionId });
  } catch (err) {
    console.error("Approve draft transaction failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Approve failed" },
      { status: 500 }
    );
  }
}
