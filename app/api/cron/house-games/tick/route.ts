import { NextResponse } from "next/server";
import { cronAuthOrResponse } from "@/lib/cronAuth";
import { ensureTodayDailyChallenge } from "@/lib/game/dailyChallenge";
import { scheduleNextHouseGame } from "@/lib/game/houseGames";

/**
 * Vercel cron hook: called periodically to ensure there is always an upcoming
 * free-to-play "house" game waiting for players on `/play`. Games land on a
 * 30-minute grid (`:00` / `:30` UTC). Idempotent — if a pending or active
 * house game already exists within the current grid window, the tick is a
 * no-op.
 *
 * The existing `auto-launch-sessions` cron picks up the pending house session
 * once `eventStartsAt` arrives, so we don't duplicate the launch logic here.
 *
 * Recommended schedule: every 5 minutes. The boundary logic means the tick
 * is safe to call more often; the guard just skips extra runs.
 */
async function run(req: Request) {
  const unauthorized = cronAuthOrResponse(req);
  if (unauthorized) return unauthorized;

  const now = new Date();
  try {
    const [result, dailyChallenge] = await Promise.all([
      scheduleNextHouseGame(now),
      // Piggyback on this 5-minute tick to guarantee today's daily
      // challenge is seeded. Idempotent — the helper ON CONFLICT DO
      // NOTHINGs on the challenge_date PK.
      ensureTodayDailyChallenge(now).catch((err) => {
        return { error: err instanceof Error ? err.message : String(err) };
      }),
    ]);
    return NextResponse.json({
      now: now.toISOString(),
      ...result,
      dailyChallenge:
        "error" in dailyChallenge
          ? { seeded: false, error: dailyChallenge.error }
          : { seeded: true, date: dailyChallenge.challengeDate },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown_error";
    return NextResponse.json(
      { ok: false, now: now.toISOString(), error: msg },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}

export const dynamic = "force-dynamic";
