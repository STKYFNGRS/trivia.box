import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { accounts, sessions } from "@/lib/db/schema";

/**
 * GET /api/game/public/upcoming — public HTTP surface.
 *
 * Upcoming listed games for player discovery. Never includes join codes —
 * those only appear at the venue's display screen.
 *
 * Not consumed by the in-repo app. The `/games/upcoming` and `/play` pages
 * read `sessions` directly as RSCs. This route is kept as the external
 * contract for embeds, mobile clients, and future partner integrations —
 * keep the response shape stable.
 */
export async function GET() {
  const now = new Date();
  const rows = await db
    .select({
      sessionId: sessions.id,
      venueName: accounts.name,
      venueCity: accounts.city,
      eventStartsAt: sessions.eventStartsAt,
      eventTimezone: sessions.eventTimezone,
      hasPrize: sessions.hasPrize,
      prizeDescription: sessions.prizeDescription,
    })
    .from(sessions)
    .innerJoin(accounts, eq(sessions.venueAccountId, accounts.id))
    .where(
      and(
        eq(sessions.listedPublic, true),
        gte(sessions.eventStartsAt, now),
        inArray(sessions.status, ["pending", "active"])
      )
    )
    .orderBy(asc(sessions.eventStartsAt))
    .limit(100);

  return NextResponse.json({
    games: rows.map((r) => ({
      sessionId: r.sessionId,
      venueName: r.venueName,
      venueCity: r.venueCity,
      eventStartsAt: r.eventStartsAt.toISOString(),
      eventTimezone: r.eventTimezone,
      hasPrize: r.hasPrize,
      prizeDescription: r.prizeDescription,
    })),
  });
}
