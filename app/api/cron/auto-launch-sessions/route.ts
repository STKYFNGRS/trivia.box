import { and, eq, lte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { cronAuthOrResponse } from "@/lib/cronAuth";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";
import { LaunchBlockedError, launchSession } from "@/lib/game/launchSession";

const bodySchema = z.object({
  /** Max sessions to launch in a single run. Keeps cron jobs bounded. */
  maxSessions: z.number().int().min(1).max(50).optional().default(10),
  /** Override "now" for testing (milliseconds since epoch). */
  nowMs: z.number().int().positive().optional(),
});

/**
 * Vercel cron / worker: finds pending **house** sessions whose
 * `eventStartsAt` is due and launches them. Host-created sessions
 * (autopilot or hosted) are deliberately not auto-launched: the host
 * runs the lobby and clicks Start when ready, so the cron only takes
 * over for the platform's free-to-play house games. Guarded by
 * `CRON_SECRET` / `x-vercel-cron` via `lib/cronAuth.ts`.
 *
 * Recommended schedule: every 1 minute. Both GET and POST are accepted —
 * Vercel Cron issues GET by default, and we still expose POST so local /
 * integration tests can pass `maxSessions` / `nowMs` overrides.
 */
async function run(req: Request) {
  const unauthorized = cronAuthOrResponse(req);
  if (unauthorized) return unauthorized;

  // POST can carry overrides in the body; GET (Vercel Cron default) gets the
  // schema defaults. Either way we clamp via zod.
  let rawBody: unknown = {};
  if (req.method === "POST") {
    rawBody = await req.json().catch(() => ({}));
  }
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const now = new Date(parsed.data.nowMs ?? Date.now());

  // House-game-only lane: any pending house game whose start time has
  // arrived. Host-created sessions live in their dashboard lobby and
  // are launched by the host clicking Start — they never get rescued
  // by this cron.
  const due = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      venueAccountId: sessions.venueAccountId,
      hostAccountId: sessions.hostAccountId,
      eventStartsAt: sessions.eventStartsAt,
      runMode: sessions.runMode,
      timerMode: sessions.timerMode,
      secondsPerQuestion: sessions.secondsPerQuestion,
      joinCode: sessions.joinCode,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.status, "pending"),
        eq(sessions.houseGame, true),
        lte(sessions.eventStartsAt, now)
      )
    )
    .orderBy(sql`${sessions.eventStartsAt} ASC`)
    .limit(parsed.data.maxSessions);

  const results: Array<{
    sessionId: string;
    ok: boolean;
    joinCode?: string;
    reason?: string;
    runMode?: string;
  }> = [];

  for (const row of due) {
    try {
      const { joinCode } = await launchSession({
        session: {
          id: row.id,
          status: row.status,
          venueAccountId: row.venueAccountId,
          hostAccountId: row.hostAccountId,
          eventStartsAt: row.eventStartsAt,
          runMode: row.runMode,
          timerMode: row.timerMode,
          secondsPerQuestion: row.secondsPerQuestion ?? null,
          joinCode: row.joinCode,
        },
      });
      results.push({
        sessionId: row.id,
        ok: true,
        joinCode,
        runMode: row.runMode,
      });
    } catch (err) {
      if (err instanceof LaunchBlockedError) {
        results.push({
          sessionId: row.id,
          ok: false,
          runMode: row.runMode,
          reason: err.reason,
        });
      } else {
        results.push({
          sessionId: row.id,
          ok: false,
          runMode: row.runMode,
          reason: err instanceof Error ? err.message : "unknown_error",
        });
      }
    }
  }

  return NextResponse.json({
    now: now.toISOString(),
    launched: results.filter((r) => r.ok).length,
    blocked: results.filter((r) => !r.ok).length,
    results,
  });
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}

export const dynamic = "force-dynamic";
