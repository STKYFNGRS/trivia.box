import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiError";
import { db } from "@/lib/db/client";
import {
  accounts,
  questions,
  rounds,
  sessionQuestions,
  sessions,
  venueProfiles,
} from "@/lib/db/schema";
import { getLeaderboardTop } from "@/lib/game/scoring";
import { buildChoiceList } from "@/lib/game/shuffleChoices";
import { clientIpFromRequest, enforceRateLimit } from "@/lib/rateLimit";

/**
 * Authoritative public session state. The play / host / display pages use this
 * as the single source of truth for `currentQuestion` + status; Ably events
 * are treated as invalidation triggers that cause a re-fetch. This removes
 * the old bug where a stale Ably `question_started` (delivered via 2-minute
 * rewind) could point clients at a dead `sessionQuestionId` and make every
 * answer click fail with a generic 400.
 */
export async function GET(req: Request) {
  try {
    await enforceRateLimit("anonymous", `ip:${clientIpFromRequest(req)}`);
  } catch (e) {
    return apiErrorResponse(e);
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  if (!code || code.length !== 6) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const sessionRows = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      timerMode: sessions.timerMode,
      runMode: sessions.runMode,
      secondsPerQuestion: sessions.secondsPerQuestion,
      joinCode: sessions.joinCode,
      hostAccountId: sessions.hostAccountId,
      venueAccountId: sessions.venueAccountId,
      pausedAt: sessions.pausedAt,
    })
    .from(sessions)
    .where(eq(sessions.joinCode, code.toUpperCase()))
    .limit(1);

  const session = sessionRows[0];
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const host = await db
    .select({ name: accounts.name })
    .from(accounts)
    .where(eq(accounts.id, session.hostAccountId))
    .limit(1);
  const venue = await db
    .select({ name: accounts.name })
    .from(accounts)
    .where(eq(accounts.id, session.venueAccountId))
    .limit(1);
  const venueProfile = await db
    .select({
      slug: venueProfiles.slug,
      displayName: venueProfiles.displayName,
      imageUpdatedAt: venueProfiles.imageUpdatedAt,
      hasImage: venueProfiles.imageBytes,
    })
    .from(venueProfiles)
    .where(eq(venueProfiles.accountId, session.venueAccountId))
    .limit(1);
  const profile = venueProfile[0];

  const ordered = await db
    .select({
      sqId: sessionQuestions.id,
      status: sessionQuestions.status,
      questionOrder: sessionQuestions.questionOrder,
      roundNumber: rounds.roundNumber,
      timerSeconds: sessionQuestions.timerSeconds,
      timerStartedAtMs: sessionQuestions.timerStartedAtMs,
      roundSecondsPerQuestion: rounds.secondsPerQuestion,
    })
    .from(sessionQuestions)
    .innerJoin(rounds, eq(rounds.id, sessionQuestions.roundId))
    .where(eq(sessionQuestions.sessionId, session.id))
    .orderBy(asc(rounds.roundNumber), asc(sessionQuestions.questionOrder));

  // The "current" question is whichever is in the most forward state: active
  // beats locked beats revealed (we include locked/revealed so clients can
  // draw the reveal/lock veil off server truth rather than racing against Ably).
  const active =
    ordered.find((q) => q.status === "active") ??
    ordered.find((q) => q.status === "locked") ??
    ordered.find((q) => q.status === "revealed") ??
    null;
  const totalQuestions = ordered.length;
  const completedCount = ordered.filter(
    (q) => q.status === "complete" || q.status === "revealed"
  ).length;

  type CurrentQuestion = {
    sessionQuestionId: string;
    body: string;
    choices: string[];
    timerSeconds: number | null;
    timerStartedAtMs: number | null;
    status: "active" | "locked" | "revealed";
    correctAnswer: string | null;
  };
  let currentQuestion: CurrentQuestion | null = null;

  if (active) {
    const qRows = await db
      .select({
        body: questions.body,
        correctAnswer: questions.correctAnswer,
        wrongAnswers: questions.wrongAnswers,
      })
      .from(sessionQuestions)
      .innerJoin(questions, eq(questions.id, sessionQuestions.questionId))
      .where(eq(sessionQuestions.id, active.sqId))
      .limit(1);
    const q = qRows[0];
    if (q) {
      const choices = buildChoiceList(active.sqId, q.correctAnswer, q.wrongAnswers);
      const resolvedTimer =
        active.timerSeconds ?? active.roundSecondsPerQuestion ?? session.secondsPerQuestion ?? null;
      currentQuestion = {
        sessionQuestionId: active.sqId,
        body: q.body,
        choices,
        timerSeconds: resolvedTimer,
        timerStartedAtMs: active.timerStartedAtMs ?? null,
        status: active.status as "active" | "locked" | "revealed",
        // Only leak the correct answer once the host has revealed it — prevents
        // trivial scraping of /api/game/public/session during a live round.
        correctAnswer: active.status === "revealed" ? q.correctAnswer : null,
      };
    }
  }

  // Leaderboard is cheap + useful to every client (play page renders its own
  // rank; display page shows standings between questions).
  let leaderboard: Array<{ playerId: string; username: string; score: number }> = [];
  if (session.status === "active" || session.status === "completed") {
    try {
      leaderboard = await getLeaderboardTop(session.id, 10);
    } catch {
      leaderboard = [];
    }
  }

  return NextResponse.json({
    sessionId: session.id,
    status: session.status,
    timerMode: session.timerMode,
    runMode: session.runMode,
    secondsPerQuestion: session.secondsPerQuestion,
    pausedAt: session.pausedAt ? session.pausedAt.toISOString() : null,
    hostName: host[0]?.name ?? "Host",
    venueName: venue[0]?.name ?? "Venue",
    venueSlug: profile?.slug ?? null,
    venueDisplayName: profile?.displayName ?? venue[0]?.name ?? "Venue",
    venueImageUpdatedAt: profile?.imageUpdatedAt ?? null,
    venueHasImage: Boolean(profile?.hasImage),
    currentQuestion,
    totalQuestions,
    completedCount,
    leaderboard,
    /** Monotonic client cache-buster. */
    serverTimeMs: Date.now(),
  });
}
