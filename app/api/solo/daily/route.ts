import { auth } from "@clerk/nextjs/server";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { apiErrorResponse } from "@/lib/apiError";
import { startDailyChallengeSession } from "@/lib/game/dailyChallenge";
import { getPlayerByAccountId } from "@/lib/players";
import { clientIpFromRequest, enforceRateLimit } from "@/lib/rateLimit";

const GUEST_COOKIE = "tb_solo_guest";

/**
 * Start — or resume — today's global daily challenge run. Signed-in
 * players are capped at one attempt per UTC day (the helper returns the
 * existing session id as `alreadyStarted: true` so the UI can route
 * straight into it without double-creating rows). Anon guests get a
 * fresh attempt each time so we don't have to persist a per-guest
 * history just for UI gating.
 */
export async function POST(req: Request) {
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
  let guestId = jar.get(GUEST_COOKIE)?.value ?? null;
  if (!playerId && !guestId) {
    guestId = randomUUID();
  }

  const rlKey = playerId
    ? `player:${playerId}`
    : guestId
      ? `guest:${guestId}`
      : `ip:${clientIpFromRequest(req)}`;
  try {
    await enforceRateLimit("publicSoloStart", rlKey);
  } catch (e) {
    return apiErrorResponse(e);
  }

  let result;
  try {
    result = await startDailyChallengeSession({ playerId, guestId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to start daily challenge";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const res = NextResponse.json({
    sessionId: result.sessionId,
    timerSeconds: result.timerSeconds,
    totalQuestions: result.totalQuestions,
    alreadyStarted: result.alreadyStarted,
  });
  if (!playerId && guestId) {
    res.cookies.set(GUEST_COOKIE, guestId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
  }
  return res;
}

export const dynamic = "force-dynamic";
