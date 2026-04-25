import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";

/**
 * GET /api/game/public/house — public HTTP surface.
 *
 * Returns the next upcoming (or currently live) house game.
 *
 * Not consumed by the in-repo app. The `/play` Play-hub renders from
 * `lib/game/houseGames` directly as an RSC. This route is kept as the
 * external contract for embeds, mobile clients, and future partner
 * integrations — read-only, safe to cache briefly, and the response shape
 * should stay stable.
 */
export async function GET() {
  const now = new Date();
  const rows = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      joinCode: sessions.joinCode,
      eventStartsAt: sessions.eventStartsAt,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.houseGame, true),
        inArray(sessions.status, ["pending", "active"]),
        gte(sessions.eventStartsAt, new Date(now.getTime() - 60 * 60 * 1000))
      )
    )
    .orderBy(asc(sessions.eventStartsAt))
    .limit(1);

  const g = rows[0];
  return NextResponse.json(
    g
      ? {
          houseGame: {
            id: g.id,
            status: g.status,
            // Don't surface placeholder `pending_*` codes; it confuses players.
            joinCode: g.joinCode.startsWith("pending_") ? null : g.joinCode,
            eventStartsAt: g.eventStartsAt.toISOString(),
          },
        }
      : { houseGame: null },
    { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" } }
  );
}

export const dynamic = "force-dynamic";
