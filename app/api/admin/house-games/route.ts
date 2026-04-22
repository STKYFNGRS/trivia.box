import { NextResponse } from "next/server";
import { requireAdminResponse } from "@/lib/adminApi";
import { apiErrorResponse } from "@/lib/apiError";
import {
  createHouseSession,
  listHouseGames,
  resolveHouseAccountId,
  scheduleNextHouseGame,
} from "@/lib/game/houseGames";

/**
 * Admin endpoints for the platform-hosted "house" games.
 *
 *   - `GET`  → list upcoming + recent house games so the admin panel can
 *              surface what's queued (the cron runs every 5 min and the
 *              visibility here is how operators confirm it's healthy).
 *   - `POST` → schedule a new one. Body is optional:
 *                { startsAt?: ISO-8601 }
 *              When `startsAt` is omitted we call the idempotent
 *              `scheduleNextHouseGame` helper the cron uses (skip if one's
 *              already queued), landing on the next :00/:30 boundary. When
 *              `startsAt` is supplied the admin is explicitly queueing a
 *              game at that moment — we bypass the "already scheduled"
 *              guard so an operator can pre-book feature nights alongside
 *              the automatic cadence.
 */
export async function GET() {
  const gate = await requireAdminResponse();
  if (gate) return gate;
  try {
    const now = new Date();
    const [data, houseAccountId] = await Promise.all([
      listHouseGames(now),
      resolveHouseAccountId(),
    ]);
    return NextResponse.json({
      now: now.toISOString(),
      houseAccountConfigured: !!houseAccountId,
      ...data,
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const gate = await requireAdminResponse();
  if (gate) return gate;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      startsAt?: string | null;
    };
    const now = new Date();
    if (body.startsAt) {
      const eventStartsAt = new Date(body.startsAt);
      if (Number.isNaN(eventStartsAt.getTime())) {
        return NextResponse.json(
          { error: "Invalid startsAt" },
          { status: 400 }
        );
      }
      const result = await createHouseSession(now, { eventStartsAt });
      return NextResponse.json({
        created: true,
        forced: true,
        now: now.toISOString(),
        ...result,
      });
    }
    const result = await scheduleNextHouseGame(now);
    return NextResponse.json({ now: now.toISOString(), ...result });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export const dynamic = "force-dynamic";
