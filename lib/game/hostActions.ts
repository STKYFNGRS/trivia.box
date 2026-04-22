import { and, asc, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { publishGameEvent } from "@/lib/ably/server";
import { track } from "@/lib/analytics/server";
import { db } from "@/lib/db/client";
import {
  answers,
  questions,
  rounds,
  sessionQuestions,
  sessions,
} from "@/lib/db/schema";
import { tryGrantAchievementsAfterSession } from "@/lib/game/achievements";
import { getLeaderboardTop } from "@/lib/game/scoring";
import { buildChoiceList } from "@/lib/game/shuffleChoices";
import { awardSessionEndXp } from "@/lib/xp";
import { materializePrizeClaims } from "@/lib/prizes";
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
  /** Wall-clock stamp from `lockActive`. Drives the deterministic
   *  lock → reveal → advance cadence in autopilot mode. */
  timeLocked: Date | null;
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
      timeLocked: sessionQuestions.timeLocked,
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
    await completeSession(session, "startNextQuestion-no-more-pending");
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
 * Shared "flip to completed" routine so every completion path — host
 * `next` with no remaining questions, `startNextQuestion` no-more-
 * pending, `advanceOrComplete` no-more-pending, and
 * `sweepStaleSessions` — runs the exact same sequence:
 *
 *   1. status → 'completed'
 *   2. estimated_end_at → now() so the host dashboard's
 *      "Recent games" section orders by actual completion time and
 *      the "Active & upcoming" 3-minute stale window drops the row
 *      immediately (a session that finished early otherwise kept an
 *      estimatedEndAt in the future and would linger in the top
 *      section until the clock caught up).
 *   3. achievements grant (best-effort)
 *   4. podium XP + prize claim materialization (best-effort)
 *   5. game_completed publish with top-50 leaderboard
 *   6. session_completed analytics event
 *
 * Separate from `runPostCompletionHooks` because the DB + broadcast
 * belong on the hot path, while the hooks are fire-and-forget.
 */
async function completeSession(
  session: Pick<SessionForHost, "id" | "joinCode" | "runMode" | "timerMode">,
  trigger: string
): Promise<void> {
  await db
    .update(sessions)
    .set({ status: "completed", estimatedEndAt: new Date() })
    .where(eq(sessions.id, session.id));
  try {
    await tryGrantAchievementsAfterSession(session.id);
  } catch {
    // non-fatal
  }
  await runPostCompletionHooks(session.id);
  const board = await getLeaderboardTop(session.id, 50);
  await publishGameEvent(session.joinCode, "game_completed", { leaderboard: board });
  void track("session_completed", {
    distinctId: `session:${session.id}`,
    properties: {
      sessionId: session.id,
      joinCode: session.joinCode,
      runMode: session.runMode,
      timerMode: session.timerMode,
      trigger,
    },
  });
}

/**
 * Phase 4.1 + 4.2 post-completion fan-out: podium & creator XP, plus prize
 * claim materialization. Shared between the two completion sites in
 * `startNextQuestion` and `advanceOrComplete` so both always stay in sync.
 * Wrapped so a failure in one step never blocks the rest.
 */
async function runPostCompletionHooks(sessionId: string): Promise<void> {
  try {
    await awardSessionEndXp(sessionId);
  } catch (err) {
    console.error("awardSessionEndXp failed", sessionId, err);
  }
  try {
    await materializePrizeClaims(sessionId);
  } catch (err) {
    console.error("materializePrizeClaims failed", sessionId, err);
  }
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
    await completeSession(session, "advanceOrComplete-no-more-pending");
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

/**
 * Grace window — a session is swept only after this many minutes past
 * its `estimated_end_at`. Tightened from 30 → 5 minutes so a finished
 * game disappears from the host dashboard quickly, but still wide
 * enough to cover the dashboard's 3-minute stale filter + a cron tick
 * of drift.
 */
const STALE_SESSION_GRACE_MINUTES = 5;

/**
 * Additional safeguard — a session isn't swept if there's been answer
 * activity within this many minutes, even if its `estimated_end_at`
 * has lapsed. Protects a still-live but slow-paced game (e.g. players
 * taking their time on a bonus round) from getting force-completed.
 */
const STALE_SESSION_LAST_ANSWER_GUARD_MINUTES = 2;

export type SweptStaleSession = {
  sessionId: string;
  joinCode: string;
  runMode: string;
  estimatedEndAt: Date | null;
};

/**
 * Safety net for sessions that never got a proper `End session` from
 * the host: any row with `status ∈ {pending, active, paused}` whose
 * `estimated_end_at` is older than `now() - 5 min` **and** has had no
 * answer activity in the last 2 min is flipped to `completed` and the
 * post-completion hooks (podium XP, prize claim materialization,
 * achievements, leaderboard broadcast) are fired so players still see
 * their results.
 *
 * The filter is deliberately run-mode agnostic — a hosted session
 * whose host closed the tab mid-game gets swept exactly the same way
 * an autopilot session does. Runs inside the autopilot-tick cron so
 * it piggybacks on the existing once-a-minute cadence. Return value
 * is logged by the cron for observability.
 */
/**
 * Drive a single autopilot session forward by one step based on its current
 * state machine position. Shared between the Vercel cron (`autopilot-tick`)
 * and the public viewer-driven tick (`/api/game/public/autopilot-tick`) so
 * both entry points share exactly the same rules and can't drift.
 *
 * Idempotent: calling this multiple times in the same second (multiple
 * viewers concurrently polling) is safe — each branch checks the DB state
 * and bails out if there's nothing to do. Returns a small result object
 * used by callers for logging / debug inspection.
 */
/**
 * Autopilot pause between `locked` → `revealed` transition. This is the
 * "answers are in, here's what was right" beat.
 */
export const AUTOPILOT_POST_LOCK_MS = 1000;
/**
 * Autopilot pause after the answer is revealed, before we advance to the
 * next question. The reveal happens ~`AUTOPILOT_POST_LOCK_MS` after lock,
 * so the full reveal-on-screen duration is approximately this constant.
 * Kept at 3 s so players have a beat to read the correct answer before
 * the screen flips.
 */
export const AUTOPILOT_POST_REVEAL_MS = 3000;

export async function advanceAutopilotSession(
  session: SessionForHost,
  opts: { nowMs?: number; graceMs?: number } = {},
): Promise<{ action?: string; reason?: string }> {
  const nowMs = opts.nowMs ?? Date.now();
  const graceMs = opts.graceMs ?? 1200;

  if (session.status !== "active" || session.pausedAt) {
    return { reason: "not_active_or_paused" };
  }
  if (session.runMode !== "autopilot") {
    return { reason: "not_autopilot" };
  }

  const ordered = await loadOrderedQuestions(session.id);
  const revealed = ordered.find((q) => q.status === "revealed");
  const locked = ordered.find((q) => q.status === "locked");
  const active = ordered.find((q) => q.status === "active");

  if (revealed) {
    if (session.timerMode === "hybrid") return { reason: "waiting_for_host_next" };
    // Honour the reveal-to-advance pause so players can actually read the
    // correct answer before the screen flips to the next question. We
    // gate off `timeLocked` (the one timestamp we persist) rather than
    // polling cadence, so the delay is deterministic regardless of how
    // many viewers are poking the tick endpoint.
    if (revealed.timeLocked) {
      const revealEndMs =
        revealed.timeLocked.getTime() +
        AUTOPILOT_POST_LOCK_MS +
        AUTOPILOT_POST_REVEAL_MS;
      if (nowMs < revealEndMs) {
        return { reason: `waiting_reveal_${revealEndMs - nowMs}ms` };
      }
    }
    const res = await advanceOrComplete(session);
    return { action: res.kind === "completed" ? "completed" : "advanced" };
  }

  if (locked) {
    if (session.timerMode === "hybrid") return { reason: "waiting_for_host_reveal" };
    // Small pause between "answers locked" and "here's the right one" so
    // the lock chip has a moment to register on screen.
    if (locked.timeLocked) {
      const revealAtMs = locked.timeLocked.getTime() + AUTOPILOT_POST_LOCK_MS;
      if (nowMs < revealAtMs) {
        return { reason: `waiting_lock_${revealAtMs - nowMs}ms` };
      }
    }
    const res = await revealActive(session);
    return { action: `revealed:${res.sessionQuestionId}` };
  }

  if (active) {
    if (session.timerMode === "manual") return { reason: "waiting_for_manual_lock" };
    const startedAt = active.timerStartedAtMs;
    const seconds =
      active.timerSeconds ??
      active.roundSecondsPerQuestion ??
      session.secondsPerQuestion ??
      0;
    if (!startedAt || !seconds) return { reason: "no_timer_info" };
    const deadlineMs = startedAt + seconds * 1000 + graceMs;
    if (nowMs >= deadlineMs) {
      const res = await lockActive(session);
      return { action: `locked:${res.sessionQuestionId}` };
    }
    return { reason: `waiting_${deadlineMs - nowMs}ms` };
  }

  const pending = ordered.find((q) => q.status === "pending");
  if (pending) {
    const res = await startNextQuestion(session);
    return {
      action: res.kind === "completed" ? "completed" : `started:${res.sessionQuestionId}`,
    };
  }
  return { reason: "nothing_to_do" };
}

export async function sweepStaleSessions(): Promise<SweptStaleSession[]> {
  const candidates = await db
    .select({
      id: sessions.id,
      joinCode: sessions.joinCode,
      runMode: sessions.runMode,
      timerMode: sessions.timerMode,
      estimatedEndAt: sessions.estimatedEndAt,
    })
    .from(sessions)
    .where(
      and(
        inArray(sessions.status, ["pending", "active", "paused"]),
        isNotNull(sessions.estimatedEndAt),
        lt(
          sessions.estimatedEndAt,
          sql`now() - (${STALE_SESSION_GRACE_MINUTES} || ' minutes')::interval`,
        ),
      ),
    )
    .limit(50);

  const swept: SweptStaleSession[] = [];
  for (const row of candidates) {
    try {
      // Per-session last-answer guard: skip if any answer landed in
      // the last N minutes. This costs one indexed query per candidate
      // — capped to 50 candidates per tick so the worst case is small.
      const lastAnswerRows = await db
        .select({ createdAt: answers.createdAt })
        .from(answers)
        .innerJoin(
          sessionQuestions,
          eq(sessionQuestions.id, answers.sessionQuestionId),
        )
        .where(eq(sessionQuestions.sessionId, row.id))
        .orderBy(desc(answers.createdAt))
        .limit(1);
      const lastAnswerAt = lastAnswerRows[0]?.createdAt ?? null;
      if (lastAnswerAt) {
        const ageMs = Date.now() - lastAnswerAt.getTime();
        if (ageMs < STALE_SESSION_LAST_ANSWER_GUARD_MINUTES * 60 * 1000) {
          continue;
        }
      }
      await completeSession(
        { id: row.id, joinCode: row.joinCode, runMode: row.runMode, timerMode: row.timerMode },
        "sweepStaleSessions",
      );
      swept.push({
        sessionId: row.id,
        joinCode: row.joinCode,
        runMode: row.runMode,
        estimatedEndAt: row.estimatedEndAt,
      });
    } catch (err) {
      console.error("sweepStaleSessions failed for session", row.id, err);
    }
  }
  return swept;
}
