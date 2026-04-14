import { auth } from "@clerk/nextjs/server";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { questionVenueHistory, questions, sessionQuestions, sessions } from "@/lib/db/schema";
import { publishGameEvent } from "@/lib/ably/server";
import { generateUniqueJoinCode } from "@/lib/game/joinCode";
import { assertHostControlsSession } from "@/lib/game/sessionPermissions";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await getAccountByClerkUserId(userId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 400 });
  }
  if (!account.subscriptionActive) {
    return NextResponse.json({ error: "Subscription required" }, { status: 402 });
  }

  const { sessionId } = await ctx.params;

  try {
    const session = await assertHostControlsSession(account, sessionId);
    if (session.status !== "pending") {
      return NextResponse.json({ error: "Session already launched" }, { status: 400 });
    }

    const joinCode = await generateUniqueJoinCode();

    await db.transaction(async (tx) => {
      const qRows = await tx
        .select({ questionId: sessionQuestions.questionId })
        .from(sessionQuestions)
        .where(eq(sessionQuestions.sessionId, sessionId))
        .groupBy(sessionQuestions.questionId);

      for (const row of qRows) {
        await tx.insert(questionVenueHistory).values({
          questionId: row.questionId,
          venueAccountId: session.venueAccountId,
        });
        await tx
          .update(questions)
          .set({ timesUsed: sql`${questions.timesUsed} + 1` })
          .where(eq(questions.id, row.questionId));
      }

      await tx
        .update(sessions)
        .set({ joinCode, status: "active" })
        .where(eq(sessions.id, sessionId));
    });

    await publishGameEvent(joinCode, "game_launched", {
      joinCode,
      venueAccountId: session.venueAccountId,
      hostAccountId: session.hostAccountId,
    });

    return NextResponse.json({ joinCode });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
