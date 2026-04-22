import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { zodErrorResponse } from "@/lib/apiError";
import { isCronAuthorized } from "@/lib/cronAuth";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";
import {
  advanceAutopilotSession,
  AUTOPILOT_POST_LOCK_MS,
  AUTOPILOT_POST_REVEAL_MS,
  sweepStaleSessions,
  type SessionForHost,
} from "@/lib/game/hostActions";

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

/**
 * Vercel cron / worker: tick ~every 10-60 seconds. For each active autopilot
 * session, figure out which timer just expired and call the appropriate host
 * helper. This is the **server-side equivalent** of the host tab's
 * `setTimeout` chain — so a game keeps running even after the host closes
 * their browser.
 *
 * Guarded by {@link isCronAuthorized} — accepts either the Vercel-injected
 * `x-vercel-cron` header or a `Authorization: Bearer $CRON_SECRET` match.
 * Skips paused sessions.
 */
async function runTick(req: Request, input: unknown) {
  if (!isCronAuthorized(req)) {
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
      const res = await advanceAutopilotSession(session, { nowMs, graceMs: GRACE_MS });
      results.push({ sessionId: session.id, ...res });
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
    tuning: {
      GRACE_MS,
      POST_LOCK_MS: AUTOPILOT_POST_LOCK_MS,
      POST_REVEAL_MS: AUTOPILOT_POST_REVEAL_MS,
    },
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
