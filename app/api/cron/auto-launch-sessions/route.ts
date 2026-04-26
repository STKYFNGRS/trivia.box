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
 * Vercel cron / worker: finds pending **autopilot** sessions whose
 * `eventStartsAt` is due and launches them. Both platform house games
 * and host-scheduled autopilot games run through this lane — the whole
 * point of autopilot is that the server drives the round, so the host
 * shouldn't have to babysit the lobby and press Start.
 *
 * Hosted sessions (`runMode = "hosted"`) are deliberately excluded:
 * those wait in the dashboard lobby until the host clicks Start. There
 * is no grace window or rescue path — manual is manual.
 *
 * Guarded by `CRON_SECRET` / `x-vercel-cron` via `lib/cronAuth.ts`.
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

  // Autopilot lane: any pending autopilot session (house or host-created)
  // whose scheduled start time has arrived. Hosted sessions sit out and
  // wait for their host to click Start in the lobby.
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
        eq(sessions.runMode, "autopilot"),
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
