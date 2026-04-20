import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  questionVenueHistory,
  questions,
  sessionQuestions,
  sessions,
} from "@/lib/db/schema";
import { publishGameEvent } from "@/lib/ably/server";
import { track } from "@/lib/analytics/server";
import { bumpDeckStatsForSessionLaunch } from "@/lib/deckMarketplace";
import { generateUniqueJoinCode } from "@/lib/game/joinCode";
import { startNextQuestion, type SessionForHost } from "@/lib/game/hostActions";

/**
 * Launch window guard bounds. Exposed so the launch route and the autopilot
 * cron can share the same "launchable now" definition.
 */
export const LAUNCH_EARLY_MS = 60 * 60 * 1000; // 60 minutes before scheduled start
export const LAUNCH_LATE_MS = 3 * 60 * 60 * 1000; // 3 hours after scheduled start

export type SessionRow = {
  id: string;
  status: string;
  venueAccountId: string;
  hostAccountId: string;
  eventStartsAt: Date | null;
  runMode?: string;
  timerMode?: string;
  secondsPerQuestion?: number | null;
};

export type LaunchBlockedReason =
  | "already_launched"
  | "too_early"
  | "too_late"
  | "venue_busy";

export class LaunchBlockedError extends Error {
  readonly reason: LaunchBlockedReason;
  readonly eventStartsAt: Date | null;
  constructor(reason: LaunchBlockedReason, eventStartsAt: Date | null = null) {
    super(`launch_blocked:${reason}`);
    this.name = "LaunchBlockedError";
    this.reason = reason;
    this.eventStartsAt = eventStartsAt;
  }
}

function isPgUniqueViolation(err: unknown, constraint: string): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; constraint?: unknown; message?: unknown };
  if (e.code !== "23505") return false;
  if (typeof e.constraint === "string" && e.constraint === constraint) return true;
  // node-postgres surfaces `constraint` on `cause` for some drivers.
  if (typeof e.message === "string" && e.message.includes(constraint)) return true;
  return false;
}

/**
 * Shared launch logic used by `POST /api/game/sessions/[id]/launch` and the
 * autopilot cron.
 *
 * Guarantees:
 *   - session must be pending (otherwise `already_launched`)
 *   - without `force`, `eventStartsAt` must be within the launch window
 *   - only one session per venue can be `active` at a time (enforced by the
 *     `one_active_session_per_venue` partial unique index; we surface
 *     `venue_busy` on 23505)
 */
export async function launchSession(input: {
  session: SessionRow;
  force?: boolean;
}): Promise<{ joinCode: string }> {
  const { session, force = false } = input;

  if (session.status !== "pending") {
    throw new LaunchBlockedError("already_launched", session.eventStartsAt);
  }

  if (!force && session.eventStartsAt) {
    const now = Date.now();
    const startMs = session.eventStartsAt.getTime();
    if (now < startMs - LAUNCH_EARLY_MS) {
      throw new LaunchBlockedError("too_early", session.eventStartsAt);
    }
    if (now > startMs + LAUNCH_LATE_MS) {
      throw new LaunchBlockedError("too_late", session.eventStartsAt);
    }
  }

  const joinCode = await generateUniqueJoinCode();

  const deckIdsUsed = new Set<string>();

  try {
    await db.transaction(async (tx) => {
      const qRows = await tx
        .select({ questionId: sessionQuestions.questionId, deckId: questions.deckId })
        .from(sessionQuestions)
        .innerJoin(questions, eq(sessionQuestions.questionId, questions.id))
        .where(eq(sessionQuestions.sessionId, session.id))
        .groupBy(sessionQuestions.questionId, questions.deckId);

      for (const row of qRows) {
        await tx.insert(questionVenueHistory).values({
          questionId: row.questionId,
          venueAccountId: session.venueAccountId,
        });
        await tx
          .update(questions)
          .set({ timesUsed: sql`${questions.timesUsed} + 1` })
          .where(eq(questions.id, row.questionId));
        if (row.deckId) deckIdsUsed.add(row.deckId);
      }

      await tx
        .update(sessions)
        .set({ joinCode, status: "active" })
        .where(eq(sessions.id, session.id));
    });
  } catch (err) {
    if (isPgUniqueViolation(err, "one_active_session_per_venue")) {
      throw new LaunchBlockedError("venue_busy", session.eventStartsAt);
    }
    throw err;
  }

  if (deckIdsUsed.size > 0) {
    try {
      await bumpDeckStatsForSessionLaunch(Array.from(deckIdsUsed));
    } catch {
      // Deck stats are a rollup — don't fail a launch if the bump errors.
    }
  }

  await publishGameEvent(joinCode, "game_launched", {
    joinCode,
    venueAccountId: session.venueAccountId,
    hostAccountId: session.hostAccountId,
  });

  void track("session_launched", {
    distinctId: session.hostAccountId,
    properties: {
      sessionId: session.id,
      joinCode,
      venueAccountId: session.venueAccountId,
      runMode: session.runMode ?? "hosted",
      timerMode: session.timerMode ?? "auto",
      forced: force,
    },
  });

  // Autopilot launches: immediately auto-start the first question and publish
  // `question_started` so players don't land on a "Waiting for host…" screen
  // after the venue page says the game is live. Hosted launches still wait
  // for the host to click Start.
  if (session.runMode === "autopilot") {
    try {
      const forHost: SessionForHost = {
        id: session.id,
        status: "active",
        joinCode,
        timerMode: session.timerMode ?? "auto",
        runMode: "autopilot",
        secondsPerQuestion: session.secondsPerQuestion ?? null,
        pausedAt: null,
      };
      await startNextQuestion(forHost);
    } catch {
      // Non-fatal — the cron will pick it up on the next tick.
    }
  }

  return { joinCode };
}
