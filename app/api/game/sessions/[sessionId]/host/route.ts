import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { assertHostControlsSession } from "@/lib/game/sessionPermissions";
import { hasEffectiveOrganizerSubscription } from "@/lib/subscription";
import { apiErrorResponse, zodErrorResponse } from "@/lib/apiError";
import {
  advanceOrComplete,
  lockActive,
  pauseSession,
  resumeSession,
  revealActive,
  startNextQuestion,
  type SessionForHost,
} from "@/lib/game/hostActions";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("reveal") }),
  z.object({ action: z.literal("next") }),
  z.object({ action: z.literal("lock") }),
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("resume") }),
]);

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
    return zodErrorResponse(parsed.error, "Invalid host action");
  }

  try {
    const session = await assertHostControlsSession(account, sessionId);
    if (session.status !== "active" && parsed.data.action !== "resume") {
      return NextResponse.json({ error: "Session is not active" }, { status: 400 });
    }

    const sessionForHost: SessionForHost = {
      id: session.id,
      status: session.status,
      joinCode: session.joinCode,
      timerMode: session.timerMode,
      runMode: session.runMode,
      secondsPerQuestion: session.secondsPerQuestion ?? null,
      pausedAt: session.pausedAt ?? null,
    };

    switch (parsed.data.action) {
      case "pause": {
        await pauseSession(sessionForHost);
        return NextResponse.json({ ok: true, paused: true });
      }
      case "resume": {
        await resumeSession(sessionForHost);
        return NextResponse.json({ ok: true, paused: false });
      }
      case "start": {
        const res = await startNextQuestion(sessionForHost);
        if (res.kind === "completed") {
          return NextResponse.json({ ok: true, completed: true });
        }
        return NextResponse.json({ ok: true, sessionQuestionId: res.sessionQuestionId });
      }
      case "lock": {
        const res = await lockActive(sessionForHost);
        return NextResponse.json({ ok: true, sessionQuestionId: res.sessionQuestionId });
      }
      case "reveal": {
        const res = await revealActive(sessionForHost);
        return NextResponse.json({ ok: true, sessionQuestionId: res.sessionQuestionId });
      }
      case "next": {
        const res = await advanceOrComplete(sessionForHost);
        if (res.kind === "completed") {
          return NextResponse.json({ ok: true, completed: true });
        }
        return NextResponse.json({ ok: true, sessionQuestionId: res.sessionQuestionId });
      }
    }
  } catch (e) {
    return apiErrorResponse(e);
  }
}
