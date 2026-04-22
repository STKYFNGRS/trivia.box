import { and, eq, lte, or, sql } from "drizzle-orm";
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
 * Grace window (minutes) we give a hosted session's host to click Launch
 * before the cron steps in and auto-launches on their behalf. Autopilot
 * sessions have no grace — the whole point of autopilot is that the
 * server drives everything, so they launch exactly on `eventStartsAt`.
 *
 * Not exported: Next.js route modules only allow the HTTP method exports
 * plus a short allowlist of route config exports, so we keep this as a
 * module-local constant. See PROJECT_GUIDE.md §13 (row 21) for rationale.
 */
const HOSTED_AUTO_LAUNCH_GRACE_MIN = 5;

/**
 * Vercel cron / worker: finds pending sessions whose `eventStartsAt` is
 * due and launches them. Autopilot launches exactly at the scheduled
 * time; hosted launches only after a 5-minute grace window so a host
 * who's running late gets rescued but an early host still drives the
 * launch themselves. Guarded by `CRON_SECRET` / `x-vercel-cron` via
 * `lib/cronAuth.ts`.
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
  const hostedGraceCutoff = new Date(
    now.getTime() - HOSTED_AUTO_LAUNCH_GRACE_MIN * 60 * 1000
  );

  // Two launch lanes keyed off runMode:
  //   - autopilot → launch exactly when eventStartsAt arrives
  //   - hosted    → launch only if the host never pressed Launch within
  //                 HOSTED_AUTO_LAUNCH_GRACE_MIN of the scheduled time
  // A single OR-ed where keeps this as one query per tick.
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
        or(
          and(
            eq(sessions.runMode, "autopilot"),
            lte(sessions.eventStartsAt, now)
          ),
          and(
            eq(sessions.runMode, "hosted"),
            lte(sessions.eventStartsAt, hostedGraceCutoff)
          )
        )
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
      // Tag hosted auto-launches so ops can distinguish host-driven
      // launches (via /api/game/sessions/[id]/launch) from grace-lapse
      // launches (this cron) in the Sentry / PostHog trail.
      const reason =
        row.runMode === "hosted" ? "hosted_grace_lapsed" : undefined;
      results.push({
        sessionId: row.id,
        ok: true,
        joinCode,
        runMode: row.runMode,
        reason,
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
    hostedGraceCutoff: hostedGraceCutoff.toISOString(),
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
