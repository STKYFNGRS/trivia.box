import { auth } from "@clerk/nextjs/server";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { rounds, sessionQuestions, sessions } from "@/lib/db/schema";
import { smartPullQuestions } from "@/lib/game/questionPull";
import { assertHostCanUseVenue } from "@/lib/game/sessionPermissions";

const roundSchema = z.object({
  roundNumber: z.number().int().min(1).max(50),
  category: z.string().min(1),
  questionsPerRound: z.number().int().min(1).max(50).default(10),
});

const createSchema = z.object({
  venueAccountId: z.string().uuid(),
  timerMode: z.enum(["auto", "manual", "hybrid"]),
  secondsPerQuestion: z.union([z.literal(10), z.literal(20), z.literal(30)]).optional(),
  rounds: z.array(roundSchema).min(1).max(12),
});

export async function POST(req: Request) {
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

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  if (body.timerMode !== "manual" && !body.secondsPerQuestion) {
    return NextResponse.json({ error: "secondsPerQuestion required for auto/hybrid" }, { status: 400 });
  }

  try {
    await assertHostCanUseVenue(account, body.venueAccountId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 });
  }

  const planned: Array<{
    roundNumber: number;
    category: string;
    questionsPerRound: number;
    questions: Awaited<ReturnType<typeof smartPullQuestions>>;
  }> = [];

  for (const r of body.rounds) {
    const pulled = await smartPullQuestions({
      venueAccountId: body.venueAccountId,
      roundNumber: r.roundNumber,
      category: r.category,
      count: r.questionsPerRound,
      excludeQuestionIds: planned.flatMap((p) => p.questions.map((q) => q.id)),
    });
    if (pulled.length < r.questionsPerRound) {
      return NextResponse.json(
        { error: `Not enough vetted questions for round ${r.roundNumber} (${r.category})` },
        { status: 400 }
      );
    }
    planned.push({
      roundNumber: r.roundNumber,
      category: r.category,
      questionsPerRound: r.questionsPerRound,
      questions: pulled,
    });
  }

  const joinCode = `pending_${nanoid(18)}`;

  const sessionId = await db.transaction(async (tx) => {
    const [session] = await tx
      .insert(sessions)
      .values({
        hostAccountId: account.id,
        venueAccountId: body.venueAccountId,
        status: "pending",
        timerMode: body.timerMode,
        secondsPerQuestion: body.secondsPerQuestion ?? null,
        joinCode,
      })
      .returning({ id: sessions.id });

    if (!session) {
      throw new Error("Failed to create session");
    }

    for (const plan of planned) {
      const [round] = await tx
        .insert(rounds)
        .values({
          sessionId: session.id,
          roundNumber: plan.roundNumber,
          category: plan.category,
        })
        .returning({ id: rounds.id });

      if (!round) {
        throw new Error("Failed to create round");
      }

      let order = 1;
      for (const q of plan.questions) {
        await tx.insert(sessionQuestions).values({
          sessionId: session.id,
          roundId: round.id,
          questionId: q.id,
          questionOrder: order++,
          status: "pending",
        });
      }
    }

    return session.id;
  });

  return NextResponse.json({ sessionId });
}
