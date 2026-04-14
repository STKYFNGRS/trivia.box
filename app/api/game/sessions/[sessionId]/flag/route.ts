import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { questionFlags, sessionQuestions } from "@/lib/db/schema";
import { assertHostControlsSession } from "@/lib/game/sessionPermissions";

const schema = z.object({
  sessionQuestionId: z.string().uuid(),
  note: z.string().max(2000).optional(),
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

  const { sessionId } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await assertHostControlsSession(account, sessionId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sqRows = await db
    .select({ questionId: sessionQuestions.questionId })
    .from(sessionQuestions)
    .where(eq(sessionQuestions.id, parsed.data.sessionQuestionId))
    .limit(1);
  const sq = sqRows[0];
  if (!sq) {
    return NextResponse.json({ error: "Session question not found" }, { status: 404 });
  }

  const [row] = await db
    .insert(questionFlags)
    .values({
      questionId: sq.questionId,
      sessionId,
      hostAccountId: account.id,
      note: parsed.data.note,
    })
    .returning();

  return NextResponse.json({ flag: row });
}
