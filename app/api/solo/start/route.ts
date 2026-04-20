import { auth } from "@clerk/nextjs/server";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { apiErrorResponse, zodErrorResponse } from "@/lib/apiError";
import { getPlayerByAccountId } from "@/lib/players";
import { clientIpFromRequest, enforceRateLimit } from "@/lib/rateLimit";
import {
  MAX_SOLO_QUESTIONS,
  MIN_SOLO_QUESTIONS,
  SOLO_SPEEDS,
  isSoloSpeed,
  startSoloSession,
} from "@/lib/game/solo";

const GUEST_COOKIE = "tb_solo_guest";

const schema = z.object({
  speed: z
    .string()
    .refine(isSoloSpeed, "speed must be one of: " + Object.keys(SOLO_SPEEDS).join(", ")),
  questionCount: z.number().int().min(MIN_SOLO_QUESTIONS).max(MAX_SOLO_QUESTIONS),
  categoryFilter: z.array(z.string().min(1)).max(20).nullish(),
});

/**
 * Start a new solo (single-player) session. Authenticated players are keyed
 * by their player id; anonymous visitors get an opaque guest cookie so a
 * refresh mid-game doesn't drop them. Guests never earn XP until they sign
 * up and migrate the session via the linking flow (future work).
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return zodErrorResponse(parsed.error, "Invalid solo payload");

  const body = parsed.data;

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

  // Rate limit by the most specific key we have, falling back to IP for anon.
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
    result = await startSoloSession({
      playerId,
      guestId,
      speed: body.speed,
      questionCount: body.questionCount,
      categoryFilter: body.categoryFilter?.length ? body.categoryFilter : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to start solo session";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const res = NextResponse.json({
    sessionId: result.sessionId,
    timerSeconds: result.timerSeconds,
    totalQuestions: result.totalQuestions,
  });
  // Persist the guest cookie for anon players so a refresh keeps access.
  if (!playerId && guestId) {
    res.cookies.set(GUEST_COOKIE, guestId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30, // 30d
      path: "/",
    });
  }
  return res;
}

export const dynamic = "force-dynamic";
