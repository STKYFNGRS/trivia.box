import { auth } from "@clerk/nextjs/server";
import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { questions, rounds, sessionQuestions } from "@/lib/db/schema";
import { smartPullQuestions } from "@/lib/game/questionPull";
import { assertHostControlsSession } from "@/lib/game/sessionPermissions";
import { hasEffectiveOrganizerSubscription } from "@/lib/subscription";
import { apiErrorResponse } from "@/lib/apiError";

const bodySchema = z.object({
  sessionQuestionId: z.string().uuid(),
  newQuestionId: z.string().uuid().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await getAccountByClerkUserId(userId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 400 });
  }
  if (!hasEffectiveOrganizerSubscription(account)) {
    return NextResponse.json({ error: "Subscription required" }, { status: 402 });
  }

  const { sessionId } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const session = await assertHostControlsSession(account, sessionId);
    if (session.status !== "pending") {
      return NextResponse.json({ error: "Swaps only allowed before launch" }, { status: 400 });
    }

    const sqRows = await db
      .select()
      .from(sessionQuestions)
      .where(
        and(
          eq(sessionQuestions.id, parsed.data.sessionQuestionId),
          eq(sessionQuestions.sessionId, sessionId)
        )
      )
      .limit(1);
    const sq = sqRows[0];
    if (!sq) {
      return NextResponse.json({ error: "Session question not found" }, { status: 404 });
    }

    const roundRows = await db
      .select({ roundNumber: rounds.roundNumber, category: rounds.category })
      .from(rounds)
      .where(eq(rounds.id, sq.roundId))
      .limit(1);
    const round = roundRows[0];
    if (!round) {
      return NextResponse.json({ error: "Round not found" }, { status: 400 });
    }

    let newQuestionId = parsed.data.newQuestionId;
    if (!newQuestionId) {
      const used = await db
        .select({ questionId: sessionQuestions.questionId })
        .from(sessionQuestions)
        .where(eq(sessionQuestions.sessionId, sessionId));

      const pulled = await smartPullQuestions({
        venueAccountId: session.venueAccountId,
        roundNumber: round.roundNumber,
        category: round.category,
        count: 1,
        excludeQuestionIds: used.map((u) => u.questionId),
      });
      newQuestionId = pulled[0]?.id;
    }

    if (!newQuestionId) {
      return NextResponse.json({ error: "No replacement question available" }, { status: 400 });
    }

    const replacement = await db
      .select({ id: questions.id, category: questions.category })
      .from(questions)
      .where(and(eq(questions.id, newQuestionId), eq(questions.vetted, true), eq(questions.retired, false)))
      .limit(1);
    if (replacement.length === 0) {
      return NextResponse.json({ error: "Invalid replacement" }, { status: 400 });
    }
    // A manual swap must keep the round on-theme: the replacement question's
    // category has to match the round category the host already configured.
    if (parsed.data.newQuestionId && replacement[0]!.category !== round.category) {
      return NextResponse.json(
        {
          error: `Replacement category (${replacement[0]!.category}) does not match round category (${round.category})`,
        },
        { status: 400 }
      );
    }

    const dup = await db
      .select({ id: sessionQuestions.id })
      .from(sessionQuestions)
      .where(
        and(
          eq(sessionQuestions.sessionId, sessionId),
          eq(sessionQuestions.questionId, newQuestionId),
          ne(sessionQuestions.id, sq.id)
        )
      )
      .limit(1);
    if (dup.length) {
      return NextResponse.json({ error: "Replacement already used in session" }, { status: 400 });
    }

    await db
      .update(sessionQuestions)
      .set({ questionId: newQuestionId })
      .where(eq(sessionQuestions.id, sq.id));

    return NextResponse.json({ ok: true, questionId: newQuestionId });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
