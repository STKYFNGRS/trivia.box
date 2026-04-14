import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { accounts, playerSessions, players, playerVenues, sessions } from "@/lib/db/schema";

const schema = z.object({
  joinCode: z.string().length(6),
  username: z
    .string()
    .min(2)
    .max(24)
    .regex(/^[a-zA-Z0-9_-]+$/),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const code = parsed.data.joinCode.toUpperCase();
  const username = parsed.data.username.trim();

  const sessionRows = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      venueAccountId: sessions.venueAccountId,
    })
    .from(sessions)
    .where(eq(sessions.joinCode, code))
    .limit(1);
  const session = sessionRows[0];
  if (!session || session.status !== "active") {
    return NextResponse.json({ error: "Session not available" }, { status: 400 });
  }

  const existingPlayer = await db
    .select({ id: players.id })
    .from(players)
    .where(eq(players.username, username))
    .limit(1);

  let playerId = existingPlayer[0]?.id;
  if (!playerId) {
    const inserted = await db.insert(players).values({ username }).returning({ id: players.id });
    playerId = inserted[0]?.id;
  }
  if (!playerId) {
    return NextResponse.json({ error: "Could not create player" }, { status: 500 });
  }

  const existingJoin = await db
    .select({ id: playerSessions.id })
    .from(playerSessions)
    .where(
      and(eq(playerSessions.sessionId, session.id), eq(playerSessions.playerId, playerId))
    )
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

  return res;
}
