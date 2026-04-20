import { NextResponse } from "next/server";
import { scheduleNextHouseGame } from "@/lib/game/houseGames";

/**
 * Vercel cron hook: called every 15 minutes to ensure there is always an
 * upcoming free-to-play "house" game waiting for players on `/play`. Idempotent
 * — if the next 30 minutes already have a house game, the tick is a no-op.
 *
 * The existing `auto-launch-sessions` cron picks up the pending house session
 * once `eventStartsAt` arrives, so we don't duplicate the launch logic here.
 *
 * Recommended schedule: every 5 minutes. The boundary logic means the tick
 * is safe to call more often; the guard just skips extra runs.
 */
async function run(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization")?.trim() !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  try {
    const result = await scheduleNextHouseGame(now);
    return NextResponse.json({ now: now.toISOString(), ...result });
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
