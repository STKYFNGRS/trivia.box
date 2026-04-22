import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { track } from "@/lib/analytics/server";
import { apiErrorResponse } from "@/lib/apiError";
import { db } from "@/lib/db/client";
import { accounts, playerSessions, playerVenues, sessions } from "@/lib/db/schema";
import { getPlayerByAccountId } from "@/lib/players";
import { clientIpFromRequest, enforceRateLimit } from "@/lib/rateLimit";

/**
 * Cooldown window between completed Trivia.Box house games. Intentionally
 * only enforced against the free platform-hosted games — venue-run
 * games are part of a paid / ticketed experience and should never be
 * gated this way. The 30 minutes matches the house-game schedule grid
 * (`HOUSE_INTERVAL_MIN`), so a player is always eligible for the next
 * scheduled game without any extra wait.
 */
const HOUSE_GAME_COOLDOWN_MINUTES = 30;

const schema = z.object({
  joinCode: z.string().length(6),
});

export async function POST(req: Request) {
  try {
    await enforceRateLimit("publicJoin", `ip:${clientIpFromRequest(req)}`);
  } catch (e) {
    return apiErrorResponse(e);
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required to join a game" }, { status: 401 });
  }

  const account = await getAccountByClerkUserId(userId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 400 });
  }
  // Every account (player, host, site_admin) has a linked players row, so anyone signed in
  // can join. Hosts started as players and keep their username / stats when they upgrade.

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const code = parsed.data.joinCode.toUpperCase();

  const sessionRows = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      venueAccountId: sessions.venueAccountId,
      houseGame: sessions.houseGame,
    })
    .from(sessions)
    .where(eq(sessions.joinCode, code))
    .limit(1);
  const session = sessionRows[0];
  if (!session || session.status !== "active") {
    return NextResponse.json({ error: "Session not available" }, { status: 400 });
  }

  const playerRow = await getPlayerByAccountId(account.id);
  if (!playerRow) {
    return NextResponse.json({ error: "Player profile missing — try signing out and back in." }, { status: 400 });
  }
  const playerId = playerRow.id;
  const username = playerRow.username;

  // House-game-only replay cooldown. Achievements + leaderboard XP are
  // only granted in hosted games, so unlimited back-to-back house plays
  // would let a single user mine them for free. The gate only fires when
  // the *incoming* session is itself a house game, so paid venue-run
  // games are never affected.
  if (session.houseGame) {
    const cutoff = new Date(Date.now() - HOUSE_GAME_COOLDOWN_MINUTES * 60_000);
    const recentCompletedHouse = await db
      .select({
        sessionId: sessions.id,
        estimatedEndAt: sessions.estimatedEndAt,
      })
      .from(playerSessions)
      .innerJoin(sessions, eq(sessions.id, playerSessions.sessionId))
      .where(
        and(
          eq(playerSessions.playerId, playerId),
          eq(sessions.houseGame, true),
          eq(sessions.status, "completed"),
          gt(sessions.estimatedEndAt, cutoff),
        ),
      )
      .orderBy(desc(sessions.estimatedEndAt))
      .limit(1);

    const last = recentCompletedHouse[0];
    if (last && last.estimatedEndAt && last.sessionId !== session.id) {
      const retryAtMs =
        last.estimatedEndAt.getTime() + HOUSE_GAME_COOLDOWN_MINUTES * 60_000;
      return NextResponse.json(
        {
          error: "Take a breather — your next Trivia.Box game unlocks soon.",
          code: "cooldown",
          retryAt: new Date(retryAtMs).toISOString(),
          cooldownMinutes: HOUSE_GAME_COOLDOWN_MINUTES,
        },
        { status: 409 },
      );
    }
  }

  const existingJoin = await db
    .select({ id: playerSessions.id })
    .from(playerSessions)
    .where(and(eq(playerSessions.sessionId, session.id), eq(playerSessions.playerId, playerId)))
    .limit(1);

  if (existingJoin.length === 0) {
    await db.insert(playerSessions).values({
      playerId,
      sessionId: session.id,
      venueAccountId: session.venueAccountId,
    });
  }

  const existingPv = await db
    .select({ id: playerVenues.id, visits: playerVenues.visits })
    .from(playerVenues)
    .where(and(eq(playerVenues.playerId, playerId), eq(playerVenues.venueAccountId, session.venueAccountId)))
    .limit(1);
  const pv = existingPv[0];
  if (!pv) {
    await db.insert(playerVenues).values({
      playerId,
      venueAccountId: session.venueAccountId,
    });
  } else {
    await db
      .update(playerVenues)
      .set({
        visits: pv.visits + 1,
        lastVisit: new Date(),
      })
      .where(eq(playerVenues.id, pv.id));
  }

  const venueNameRows = await db
    .select({ name: accounts.name })
    .from(accounts)
    .where(eq(accounts.id, session.venueAccountId))
    .limit(1);

  const res = NextResponse.json({
    playerId,
    sessionId: session.id,
    username,
    venueName: venueNameRows[0]?.name ?? "Venue",
  });

  res.cookies.set("tb_player_id", playerId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  void track("player_joined", {
    distinctId: userId,
    properties: {
      playerId,
      sessionId: session.id,
      venueAccountId: session.venueAccountId,
      username,
      returningToVenue: Boolean(pv),
    },
  });

  return res;
}
