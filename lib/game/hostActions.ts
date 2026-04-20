import { asc, eq } from "drizzle-orm";
import { publishGameEvent } from "@/lib/ably/server";
import { track } from "@/lib/analytics/server";
import { db } from "@/lib/db/client";
import { questions, rounds, sessionQuestions, sessions } from "@/lib/db/schema";
import { tryGrantAchievementsAfterSession } from "@/lib/game/achievements";
import { getLeaderboardTop } from "@/lib/game/scoring";
import { buildChoiceList } from "@/lib/game/shuffleChoices";
import { ApiError } from "@/lib/apiError";

/**
 * Pure helpers for host-driven game progression. The host API route and the
 * autopilot cron both call these so the state machine lives in exactly one
 * place and the two entry points can't drift.
 *
 * Each helper assumes the caller has already loaded `sessions.id`, verified
 * authorization, and confirmed the session is `active`. On failure we throw
 * `ApiError` so the route can bubble a clean status + message.
 */

export type SessionForHost = {
  id: string;
  status: string;
  joinCode: string;
  timerMode: string;
  runMode: string;
  secondsPerQuestion: number | null;
  pausedAt: Date | null;
};

export type OrderedSessionQuestion = {
  sqId: string;
  status: string;
  questionOrder: number;
  roundNumber: number;
  roundSecondsPerQuestion: number | null;
  timerSeconds: number | null;
  timerStartedAtMs: number | null;
};

export async function loadOrderedQuestions(
  sessionId: string
): Promise<OrderedSessionQuestion[]> {
  return db
    .select({
      sqId: sessionQuestions.id,
      status: sessionQuestions.status,
      questionOrder: sessionQuestions.questionOrder,
      roundNumber: rounds.roundNumber,
      roundSecondsPerQuestion: rounds.secondsPerQuestion,
      timerSeconds: sessionQuestions.timerSeconds,
      timerStartedAtMs: sessionQuestions.timerStartedAtMs,
    })
    .from(sessionQuestions)
    .innerJoin(rounds, eq(rounds.id, sessionQuestions.roundId))
    .where(eq(sessionQuestions.sessionId, sessionId))
    .orderBy(asc(rounds.roundNumber), asc(sessionQuestions.questionOrder));
}

/** Per-question timer, falling back from round → session. `null` = manual mode. */
export function resolveTimerSeconds(
  roundSeconds: number | null,
  sessionSeconds: number | null
): number | null {
  if (typeof roundSeconds === "number" && roundSeconds > 0) return roundSeconds;
  if (typeof sessionSeconds === "number" && sessionSeconds > 0) return sessionSeconds;
  return null;
}

/**
 * Deterministic-shuffle the choices for `sessionQuestionId` so that the public
 * bootstrap and the Ably `question_started` payload always agree on choice
 * ordering — no more mid-round reordering of buttons on slow clients.
 */
export async function loadPublishPayload(sessionQuestionId: string) {
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
  if (!row) throw new ApiError(404, "Question not found");
  return {
    body: row.body,
    choices: buildChoiceList(sessionQuestionId, row.correctAnswer, row.wrongAnswers),
    correctAnswer: row.correctAnswer,
  };
}

/**
 * Advance from whatever state the session is in to a freshly-active next
 * question. If no pending questions remain, the session is marked `completed`
 * and `game_completed` is published.
 *
 * Publishes `question_started` on success, or `game_completed` on completion.
 */
export async function startNextQuestion(session: SessionForHost): Promise<
  | { kind: "started"; sessionQuestionId: string }
  | { kind: "completed" }
> {
  const ordered = await loadOrderedQuestions(session.id);
  if (ordered.some((q) => q.status === "revealed")) {
    throw new ApiError(
      400,
      "Reveal is pending resolution — call advanceOrComplete first"
    );
  }
  if (ordered.some((q) => q.status === "active")) {
    throw new ApiError(400, "A question is already active");
  }
  const next = ordered.find((q) => q.status === "pending");
  if (!next) {
    await db
      .update(sessions)
      .set({ status: "completed" })
      .where(eq(sessions.id, session.id));
    try {
      await tryGrantAchievementsAfterSession(session.id);
    } catch {
      // non-fatal
    }
    const board = await getLeaderboardTop(session.id, 50);
    await publishGameEvent(session.joinCode, "game_completed", { leaderboard: board });
    void track("session_completed", {
      distinctId: `session:${session.id}`,
      properties: {
        sessionId: session.id,
        joinCode: session.joinCode,
        runMode: session.runMode,
        timerMode: session.timerMode,
        trigger: "startNextQuestion-no-more-pending",
      },
    });
    return { kind: "completed" };
  }

  const timerSeconds = resolveTimerSeconds(
    next.roundSecondsPerQuestion,
    session.secondsPerQuestion
  );
  const timerStartedAtMs = Date.now();
  await db
    .update(sessionQuestions)
    .set({
      status: "active",
      timeStarted: new Date(timerStartedAtMs),
      timerSeconds,
      timerStartedAtMs,
    })
    .where(eq(sessionQuestions.id, next.sqId));

  const payload = await loadPublishPayload(next.sqId);
  await publishGameEvent(session.joinCode, "question_started", {
    sessionQuestionId: next.sqId,
    question: payload.body,
    choices: payload.choices,
    timerSeconds,
    timerStartedAtMs,
    timerMode: session.timerMode,
  });
  return { kind: "started", sessionQuestionId: next.sqId };
}

/**
 * Mark the currently-active (or already-locked) question as locked and publish
 * `answers_locked`. Idempotent — calling lock twice is a no-op.
 */
export async function lockActive(session: SessionForHost): Promise<{
  sessionQuestionId: string;
}> {
  const ordered = await loadOrderedQuestions(session.id);
  const lockTarget =
    ordered.find((q) => q.status === "active") ??
    ordered.find((q) => q.status === "locked") ??
    null;
  if (!lockTarget) {
    throw new ApiError(400, "No active question");
  }
  if (lockTarget.status === "active") {
    await db
      .update(sessionQuestions)
      .set({ status: "locked", timeLocked: new Date() })
      .where(eq(sessionQuestions.id, lockTarget.sqId));
  }
  await publishGameEvent(session.joinCode, "answers_locked", {
    sessionQuestionId: lockTarget.sqId,
  });
  return { sessionQuestionId: lockTarget.sqId };
}

/**
 * Reveal the current question. Works from either `active` or `locked` (implicit
 * lock if still active). Publishes `answer_revealed` + a fresh leaderboard.
 */
export async function revealActive(session: SessionForHost): Promise<{
  sessionQuestionId: string;
}> {
  const ordered = await loadOrderedQuestions(session.id);
  const target =
    ordered.find((q) => q.status === "active") ??
    ordered.find((q) => q.status === "locked") ??
    ordered.find((q) => q.status === "revealed") ??
    null;
  if (!target) {
    throw new ApiError(400, "No active question");
  }
  const payload = await loadPublishPayload(target.sqId);
  if (target.status !== "revealed") {
    await db
      .update(sessionQuestions)
      .set({ status: "revealed" })
      .where(eq(sessionQuestions.id, target.sqId));
  }
  await publishGameEvent(session.joinCode, "answer_revealed", {
    sessionQuestionId: target.sqId,
    correctAnswer: payload.correctAnswer,
    correct: payload.correctAnswer,
    explanation: null,
  });
  const board = await getLeaderboardTop(session.id, 10);
  await publishGameEvent(session.joinCode, "leaderboard_updated", { top: board });
  return { sessionQuestionId: target.sqId };
}

/**
 * Complete the current (revealed / locked / active) question and start the
 * next one. If none remain, complete the session.
 */
export async function advanceOrComplete(session: SessionForHost): Promise<
  | { kind: "advanced"; sessionQuestionId: string }
  | { kind: "completed" }
> {
  const ordered = await loadOrderedQuestions(session.id);
  const target =
    ordered.find((q) => q.status === "revealed") ??
    ordered.find((q) => q.status === "locked") ??
    ordered.find((q) => q.status === "active");
  if (!target) {
    throw new ApiError(400, "Nothing to advance");
  }
  await db
    .update(sessionQuestions)
    .set({ status: "complete" })
    .where(eq(sessionQuestions.id, target.sqId));

  const remaining = await loadOrderedQuestions(session.id);
  const next = remaining.find((q) => q.status === "pending");
  if (!next) {
    await db
      .update(sessions)
      .set({ status: "completed" })
      .where(eq(sessions.id, session.id));
    try {
      await tryGrantAchievementsAfterSession(session.id);
    } catch {
      // non-fatal
    }
    const board = await getLeaderboardTop(session.id, 50);
    await publishGameEvent(session.joinCode, "game_completed", { leaderboard: board });
    void track("session_completed", {
      distinctId: `session:${session.id}`,
      properties: {
        sessionId: session.id,
        joinCode: session.joinCode,
        runMode: session.runMode,
        timerMode: session.timerMode,
        trigger: "advanceOrComplete-no-more-pending",
      },
    });
    return { kind: "completed" };
  }

  const timerSeconds = resolveTimerSeconds(
    next.roundSecondsPerQuestion,
    session.secondsPerQuestion
  );
  const timerStartedAtMs = Date.now();
  await db
    .update(sessionQuestions)
    .set({
      status: "active",
      timeStarted: new Date(timerStartedAtMs),
      timerSeconds,
      timerStartedAtMs,
    })
    .where(eq(sessionQuestions.id, next.sqId));

  const payload = await loadPublishPayload(next.sqId);
  await publishGameEvent(session.joinCode, "question_started", {
    sessionQuestionId: next.sqId,
    question: payload.body,
    choices: payload.choices,
    timerSeconds,
    timerStartedAtMs,
    timerMode: session.timerMode,
  });
  const board = await getLeaderboardTop(session.id, 10);
  await publishGameEvent(session.joinCode, "leaderboard_updated", { top: board });
  return { kind: "advanced", sessionQuestionId: next.sqId };
}

/** Pause: stamp `paused_at`, publish overlay event. Autopilot cron will skip. */
export async function pauseSession(session: SessionForHost): Promise<void> {
  await db
    .update(sessions)
    .set({ pausedAt: new Date() })
    .where(eq(sessions.id, session.id));
  await publishGameEvent(session.joinCode, "game_paused", {
    pausedAt: new Date().toISOString(),
  });
}

/** Resume: clear `paused_at`, broadcast. */
export async function resumeSession(session: SessionForHost): Promise<void> {
  await db
    .update(sessions)
    .set({ pausedAt: null })
    .where(eq(sessions.id, session.id));
  await publishGameEvent(session.joinCode, "game_resumed", {});
}
