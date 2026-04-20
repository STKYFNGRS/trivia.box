import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";
import {
  advanceOrComplete,
  loadOrderedQuestions,
  lockActive,
  revealActive,
  startNextQuestion,
  sweepStaleSessions,
  type SessionForHost,
} from "@/lib/game/hostActions";
import { zodErrorResponse } from "@/lib/apiError";

const bodySchema = z.object({
  /** Max sessions to process in a single tick. Keeps runs bounded. */
  maxSessions: z.number().int().min(1).max(50).optional().default(10),
  /** Override "now" for testing (milliseconds since epoch). */
  nowMs: z.number().int().positive().optional(),
  /** Optional session filter so tests can target a single session. */
  sessionId: z.string().uuid().optional(),
});

/**
 * Grace window in ms. After a deadline we wait this long before firing the
 * action, so the host tab's local `setTimeout` chain (if present) gets to go
 * first and we don't double-fire. The server state machine is idempotent, but
 * double events waste realtime bandwidth.
 */
const GRACE_MS = 1200;
/** How long to wait between `revealed` and auto-advance. */
const POST_REVEAL_MS = 4000;
/** How long to wait between `locked` and reveal. */
const POST_LOCK_MS = 1000;

/**
 * Vercel cron / worker: tick ~every 10-60 seconds. For each active autopilot
 * session, figure out which timer just expired and call the appropriate host
 * helper. This is the **server-side equivalent** of the host tab's
 * `setTimeout` chain — so a game keeps running even after the host closes
 * their browser.
 *
 * Guarded by `CRON_SECRET` OR a Vercel `x-vercel-cron` header. Skips paused
 * sessions.
 */
function isAuthorized(req: Request): boolean {
  if (req.headers.get("x-vercel-cron")) return true;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return req.headers.get("authorization")?.trim() === `Bearer ${secret}`;
}

async function runTick(req: Request, input: unknown) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(input ?? {});
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const nowMs = parsed.data.nowMs ?? Date.now();

  const base = and(
    eq(sessions.status, "active"),
    eq(sessions.runMode, "autopilot"),
    isNull(sessions.pausedAt)
  );

  const rows = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      joinCode: sessions.joinCode,
      timerMode: sessions.timerMode,
      runMode: sessions.runMode,
      secondsPerQuestion: sessions.secondsPerQuestion,
      pausedAt: sessions.pausedAt,
    })
    .from(sessions)
    .where(parsed.data.sessionId ? and(base, eq(sessions.id, parsed.data.sessionId)) : base)
    .orderBy(sql`${sessions.createdAt} ASC`)
    .limit(parsed.data.maxSessions);

  const results: Array<{ sessionId: string; action?: string; reason?: string }> = [];

  for (const row of rows) {
    const session: SessionForHost = {
      id: row.id,
      status: row.status,
      joinCode: row.joinCode,
      timerMode: row.timerMode,
      runMode: row.runMode,
      secondsPerQuestion: row.secondsPerQuestion ?? null,
      pausedAt: row.pausedAt ?? null,
    };

    try {
      const ordered = await loadOrderedQuestions(session.id);
      // Prefer revealed over locked over active — we always drive the furthest
      // state forward first so we can't miss a reveal between ticks.
      const revealed = ordered.find((q) => q.status === "revealed");
      const locked = ordered.find((q) => q.status === "locked");
      const active = ordered.find((q) => q.status === "active");

      if (revealed) {
        // In hybrid mode, the host controls reveal → next manually, so the cron
        // must not advance for them. The host tab will click Next when ready.
        if (session.timerMode === "hybrid") {
          results.push({ sessionId: session.id, reason: "waiting_for_host_next" });
          continue;
        }
        const res = await advanceOrComplete(session);
        results.push({
          sessionId: session.id,
          action: res.kind === "completed" ? "completed" : "advanced",
        });
        continue;
      }

      if (locked) {
        // Hybrid: lock happened (either auto or host) but reveal is the host's
        // job. Leave it alone.
        if (session.timerMode === "hybrid") {
          results.push({ sessionId: session.id, reason: "waiting_for_host_reveal" });
          continue;
        }
        const res = await revealActive(session);
        results.push({ sessionId: session.id, action: `revealed:${res.sessionQuestionId}` });
        continue;
      }

      if (active) {
        // Only manual-mode auto locks happen via host click; auto/hybrid auto-
        // lock when the server-stamped timer expires.
        if (session.timerMode === "manual") {
          results.push({ sessionId: session.id, reason: "waiting_for_manual_lock" });
          continue;
        }
        const startedAt = active.timerStartedAtMs;
        const seconds =
          active.timerSeconds ??
          active.roundSecondsPerQuestion ??
          session.secondsPerQuestion ??
          0;
        if (!startedAt || !seconds) {
          results.push({ sessionId: session.id, reason: "no_timer_info" });
          continue;
        }
        const deadlineMs = startedAt + seconds * 1000 + GRACE_MS;
        if (nowMs >= deadlineMs) {
          const res = await lockActive(session);
          results.push({ sessionId: session.id, action: `locked:${res.sessionQuestionId}` });
        } else {
          results.push({ sessionId: session.id, reason: `waiting_${deadlineMs - nowMs}ms` });
        }
        continue;
      }

      // Nothing active / locked / revealed: try to start the next pending
      // question (e.g. after a fresh launch).
      const pending = ordered.find((q) => q.status === "pending");
      if (pending) {
        const res = await startNextQuestion(session);
        results.push({
          sessionId: session.id,
          action: res.kind === "completed" ? "completed" : `started:${res.sessionQuestionId}`,
        });
      } else {
        results.push({ sessionId: session.id, reason: "nothing_to_do" });
      }
    } catch (err) {
      results.push({
        sessionId: session.id,
        reason: err instanceof Error ? err.message : "unknown_error",
      });
    }
  }

  // Safety net: close out sessions whose estimated_end_at has elapsed but
  // were never properly ended by the host. Runs after the autopilot loop
  // so we don't race our own state machine for sessions we just advanced.
  let swept: Awaited<ReturnType<typeof sweepStaleSessions>> = [];
  try {
    swept = await sweepStaleSessions();
  } catch (err) {
    console.error("sweepStaleSessions threw", err);
  }

  return NextResponse.json({
    now: new Date(nowMs).toISOString(),
    processed: rows.length,
    actions: results.filter((r) => r.action).length,
    results,
    swept: swept.map((s) => ({ sessionId: s.sessionId, joinCode: s.joinCode })),
    tuning: { GRACE_MS, POST_LOCK_MS, POST_REVEAL_MS },
  });
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  return runTick(req, json);
}

export async function GET(req: Request) {
  // Vercel's scheduled cron hits this endpoint with GET; the tick body params
  // are all optional so we just pass an empty object.
  return runTick(req, {});
}
