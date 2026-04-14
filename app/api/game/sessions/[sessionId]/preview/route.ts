import { auth } from "@clerk/nextjs/server";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { questions, rounds, sessionQuestions } from "@/lib/db/schema";
import { assertHostControlsSession } from "@/lib/game/sessionPermissions";

export async function GET(_req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await getAccountByClerkUserId(userId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 400 });
  }

  const { sessionId } = await ctx.params;

  try {
    await assertHostControlsSession(account, sessionId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select({
      sessionQuestionId: sessionQuestions.id,
      questionOrder: sessionQuestions.questionOrder,
      roundNumber: rounds.roundNumber,
      category: rounds.category,
      body: questions.body,
      difficulty: questions.difficulty,
      subcategory: questions.subcategory,
    })
    .from(sessionQuestions)
    .innerJoin(rounds, eq(rounds.id, sessionQuestions.roundId))
    .innerJoin(questions, eq(questions.id, sessionQuestions.questionId))
    .where(eq(sessionQuestions.sessionId, sessionId))
    .orderBy(asc(rounds.roundNumber), asc(sessionQuestions.questionOrder));

  return NextResponse.json({ questions: rows });
}
