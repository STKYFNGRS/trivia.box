import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { soloSessions } from "@/lib/db/schema";
import { assertSoloOwner, loadSoloRecap } from "@/lib/game/solo";
import { getPlayerByAccountId } from "@/lib/players";

const GUEST_COOKIE = "tb_solo_guest";

/**
 * Return the end-of-game recap for a solo session. Only the owner (player
 * or guest cookie) can read it; sharing will come as a separate
 * signed-URL feature.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const rows = await db
    .select()
    .from(soloSessions)
    .where(eq(soloSessions.id, id))
    .limit(1);
  const session = rows[0];
  if (!session) {
    return NextResponse.json({ error: "Solo session not found" }, { status: 404 });
  }

  const { userId } = await auth();
  let playerId: string | null = null;
  if (userId) {
    const account = await getAccountByClerkUserId(userId);
    if (account) {
      const player = await getPlayerByAccountId(account.id);
      if (player) playerId = player.id;
    }
  }
  const jar = await cookies();
  const guestId = jar.get(GUEST_COOKIE)?.value ?? null;

  try {
    assertSoloOwner(session, { playerId, guestId });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const recap = await loadSoloRecap(id);
  if (!recap) {
    return NextResponse.json({ error: "Solo session not found" }, { status: 404 });
  }

  return NextResponse.json(recap);
}

export const dynamic = "force-dynamic";
