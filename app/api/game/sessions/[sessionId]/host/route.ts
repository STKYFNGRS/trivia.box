import { auth } from "@clerk/nextjs/server";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { publishGameEvent } from "@/lib/ably/server";
import { db } from "@/lib/db/client";
import { questions, rounds, sessionQuestions, sessions } from "@/lib/db/schema";
import { getLeaderboardTop } from "@/lib/game/scoring";
import { assertHostControlsSession } from "@/lib/game/sessionPermissions";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("reveal") }),
  z.object({ action: z.literal("next") }),
  z.object({ action: z.literal("lock") }),
  z.object({ action: z.literal("pause") }),
]);

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function orderedQuestions(sessionId: string) {
  return db
    .select({
      sqId: sessionQuestions.id,
      status: sessionQuestions.status,
      questionOrder: sessionQuestions.questionOrder,
      roundNumber: rounds.roundNumber,
    })
    .from(sessionQuestions)
    .innerJoin(rounds, eq(rounds.id, sessionQuestions.roundId))
    .where(eq(sessionQuestions.sessionId, sessionId))
    .orderBy(asc(rounds.roundNumber), asc(sessionQuestions.questionOrder));
}

async function loadQuestionPublishPayload(sessionQuestionId: string) {
  const rows = await db
    .select({
      body: questions.body,
      correctAnswer: questions.correctAnswer,
      wrongAnswers: questions.wrongAnswers,
    })
    .from(sessionQuestions)
    .innerJoin(questions, eq(questions.id, sessionQuestions.questionId))
    .where(eq(sessionQuestions.id, sessionQuestionId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new Error("Question not found");
  }

  const choices = shuffle([row.correctAnswer, ...(row.wrongAnswers ?? [])]);
  return {
    body: row.body,
    choices,
    correctAnswer: row.correctAnswer,
  };
}

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
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
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const session = await assertHostControlsSession(account, sessionId);
    if (session.status !== "active") {
      return NextResponse.json({ error: "Session is not active" }, { status: 400 });
    }

    const joinCode = session.joinCode;

    if (parsed.data.action === "pause") {
      await publishGameEvent(joinCode, "game_paused", {});
      return NextResponse.json({ ok: true });
    }

    const ordered = await orderedQuestions(sessionId);
    const active = ordered.find((q) => q.status === "active");

    if (parsed.data.action === "start") {
      if (ordered.some((q) => q.status === "revealed")) {
        return NextResponse.json({ error: "Reveal is pending resolution — use Next first" }, { status: 400 });
      }
      if (active) {
        return NextResponse.json({ error: "A question is already active" }, { status: 400 });
      }
      const next = ordered.find((q) => q.status === "pending");
      if (!next) {
        return NextResponse.json({ error: "No more questions" }, { status: 400 });
      }

      await db
        .update(sessionQuestions)
        .set({ status: "active", timeStarted: new Date() })
        .where(eq(sessionQuestions.id, next.sqId));

      const payload = await loadQuestionPublishPayload(next.sqId);
      const timerSeconds = session.secondsPerQuestion ?? null;
      await publishGameEvent(joinCode, "question_started", {
        sessionQuestionId: next.sqId,
        question: payload.body,
        choices: payload.choices,
        timerSeconds,
        timerMode: session.timerMode,
      });
      return NextResponse.json({ ok: true, sessionQuestionId: next.sqId });
    }

    if (parsed.data.action === "lock") {
      if (!active) {
        return NextResponse.json({ error: "No active question" }, { status: 400 });
      }
      await db
        .update(sessionQuestions)
        .set({ timeLocked: new Date() })
        .where(eq(sessionQuestions.id, active.sqId));
      await publishGameEvent(joinCode, "answers_locked", {});
      return NextResponse.json({ ok: true });
    }

    if (parsed.data.action === "reveal") {
      if (!active) {
        return NextResponse.json({ error: "No active question" }, { status: 400 });
      }
      const payload = await loadQuestionPublishPayload(active.sqId);
      await db
        .update(sessionQuestions)
        .set({ status: "revealed" })
        .where(eq(sessionQuestions.id, active.sqId));
      await publishGameEvent(joinCode, "answer_revealed", {
        correctAnswer: payload.correctAnswer,
        explanation: null,
      });
      const board = await getLeaderboardTop(sessionId, 10);
      await publishGameEvent(joinCode, "leaderboard_updated", { top: board });
      return NextResponse.json({ ok: true });
    }

    if (parsed.data.action === "next") {
      const refreshed = await orderedQuestions(sessionId);
      const target =
        refreshed.find((q) => q.status === "revealed") ?? refreshed.find((q) => q.status === "active");
      if (!target) {
        return NextResponse.json({ error: "Nothing to advance" }, { status: 400 });
      }

      await db
        .update(sessionQuestions)
        .set({ status: "complete" })
        .where(eq(sessionQuestions.id, target.sqId));

      const remaining = await orderedQuestions(sessionId);
      const next = remaining.find((q) => q.status === "pending");
      if (!next) {
        await db.update(sessions).set({ status: "completed" }).where(eq(sessions.id, sessionId));
        const board = await getLeaderboardTop(sessionId, 50);
        await publishGameEvent(joinCode, "game_completed", { leaderboard: board });
        return NextResponse.json({ ok: true, completed: true });
      }

      await db
        .update(sessionQuestions)
        .set({ status: "active", timeStarted: new Date() })
        .where(eq(sessionQuestions.id, next.sqId));

      const payload = await loadQuestionPublishPayload(next.sqId);
      const timerSeconds = session.secondsPerQuestion ?? null;
      await publishGameEvent(joinCode, "question_started", {
        sessionQuestionId: next.sqId,
        question: payload.body,
        choices: payload.choices,
        timerSeconds,
        timerMode: session.timerMode,
      });
      const board = await getLeaderboardTop(sessionId, 10);
      await publishGameEvent(joinCode, "leaderboard_updated", { top: board });
      return NextResponse.json({ ok: true, sessionQuestionId: next.sqId });
    }

    return NextResponse.json({ error: "Unsupported" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 400 });
  }
}
