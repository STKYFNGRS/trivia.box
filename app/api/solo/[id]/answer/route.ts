import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { apiErrorResponse, zodErrorResponse } from "@/lib/apiError";
import { db } from "@/lib/db/client";
import { soloSessions } from "@/lib/db/schema";
import { assertSoloOwner, submitSoloAnswer } from "@/lib/game/solo";
import { getPlayerByAccountId } from "@/lib/players";
import { clientIpFromRequest, enforceRateLimit } from "@/lib/rateLimit";

const GUEST_COOKIE = "tb_solo_guest";

const schema = z.object({
  soloQuestionId: z.string().uuid(),
  answer: z.string().min(1),
});

/**
 * Record an answer to a solo question. Scoring is server-derived: the client
 * can't cheat elapsed time. Returns the new total so the client UI can
 * update without a round-trip to `/next`.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return zodErrorResponse(parsed.error, "Invalid answer payload");

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

  const rlKey = playerId
    ? `player:${playerId}`
    : guestId
      ? `guest:${guestId}`
      : `ip:${clientIpFromRequest(req)}`;
  try {
    await enforceRateLimit("publicSoloAnswer", rlKey);
  } catch (e) {
    return apiErrorResponse(e);
  }

  try {
    const result = await submitSoloAnswer({
      soloSessionId: id,
      positionalSoloQuestionId: parsed.data.soloQuestionId,
      answerGiven: parsed.data.answer,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to submit answer";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export const dynamic = "force-dynamic";
