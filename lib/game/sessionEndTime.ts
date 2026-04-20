/**
 * Session end-time estimator (Phase 5.1).
 *
 * The host dashboard filters by `estimated_end_at` so finished or stale
 * sessions fall off the list automatically. We need a deterministic
 * computation shared by the client (for live "Ends approx. ..." preview)
 * and the API route (for the persisted value).
 *
 * Precedence for hosted games:
 *   1. explicit datetime override (`hostOverrideEndsAt`)
 *   2. duration in minutes (`hostDurationMinutes`)
 *   3. fall back to the autopilot estimator
 *
 * Autopilot always uses the per-question estimator.
 */

/** Seconds of reveal / leaderboard time we assume between questions. */
export const SESSION_REVEAL_BUFFER_SECONDS = 15;

/** One-shot warm-up buffer (intro screen, waiting for first question). */
export const SESSION_WARMUP_SECONDS = 60;

/** Fallback per-question seconds if the session didn't pin one. */
export const DEFAULT_SECONDS_PER_QUESTION = 25;

export type SessionEndTimeInput = {
  eventStartsAt: Date;
  questionCount: number;
  secondsPerQuestion: number | null | undefined;
  runMode: "autopilot" | "hosted";
  hostOverrideEndsAt?: Date | null;
  hostDurationMinutes?: number | null;
};

/**
 * Returns the best-effort end time for a session. Never returns a value
 * earlier than `eventStartsAt + 1 minute` so a typo can't produce a session
 * that's already "ended" before it starts.
 */
export function computeEstimatedEndAt(input: SessionEndTimeInput): Date {
  const { eventStartsAt, runMode, hostOverrideEndsAt, hostDurationMinutes } = input;

  if (runMode === "hosted") {
    if (hostOverrideEndsAt instanceof Date && !Number.isNaN(hostOverrideEndsAt.getTime())) {
      return clampToMinimum(eventStartsAt, hostOverrideEndsAt);
    }
    if (typeof hostDurationMinutes === "number" && hostDurationMinutes > 0) {
      const durationMs = hostDurationMinutes * 60_000;
      return clampToMinimum(eventStartsAt, new Date(eventStartsAt.getTime() + durationMs));
    }
  }

  return autopilotEstimate(input);
}

/**
 * Autopilot-style estimate based on question count + seconds-per-question.
 * Also exported so the hosted form can render it as the default duration.
 */
export function autopilotEstimate(input: SessionEndTimeInput): Date {
  const seconds = input.secondsPerQuestion ?? DEFAULT_SECONDS_PER_QUESTION;
  const perQ = Math.max(1, seconds) + SESSION_REVEAL_BUFFER_SECONDS;
  const totalSeconds = Math.max(1, input.questionCount) * perQ + SESSION_WARMUP_SECONDS;
  return clampToMinimum(
    input.eventStartsAt,
    new Date(input.eventStartsAt.getTime() + totalSeconds * 1000),
  );
}

/**
 * Convenience: duration in whole minutes from `eventStartsAt` to the
 * estimated end. Rounds up so the "Duration" default in the form is never
 * shorter than the computed run.
 */
export function estimatedDurationMinutes(input: SessionEndTimeInput): number {
  const end = autopilotEstimate(input);
  const diffMs = end.getTime() - input.eventStartsAt.getTime();
  return Math.max(1, Math.ceil(diffMs / 60_000));
}

function clampToMinimum(start: Date, candidate: Date): Date {
  const minimum = new Date(start.getTime() + 60_000);
  return candidate.getTime() < minimum.getTime() ? minimum : candidate;
}
