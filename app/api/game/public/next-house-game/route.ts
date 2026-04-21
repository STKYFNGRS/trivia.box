import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/apiError";
import { getNextUpcomingHouseGame } from "@/lib/game/houseGames";
import { clientIpFromRequest, enforceRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/game/public/next-house-game
 *
 * Returns the soonest upcoming house game (if any) as a JSON payload the
 * client can render into a countdown pill. Separated from the main session
 * bootstrap because (a) it's polled by `FinalStandings` + the `/play`
 * landing page even when no game is live, and (b) it's cheap enough to
 * fan out without pulling the whole `/api/game/public/session` response.
 *
 * 404 response with `{ next: null }` rather than an error so the client
 * can gracefully hide the pill when no house game is scheduled.
 */
export async function GET(req: Request) {
  try {
    await enforceRateLimit("anonymous", `ip:${clientIpFromRequest(req)}`);
  } catch (e) {
    return apiErrorResponse(e);
  }

  try {
    const next = await getNextUpcomingHouseGame();
    if (!next) {
      return NextResponse.json({ next: null });
    }
    return NextResponse.json({
      next: {
        sessionId: next.sessionId,
        joinCode: next.joinCode,
        eventStartsAt: next.eventStartsAt.toISOString(),
        theme: next.theme,
      },
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
