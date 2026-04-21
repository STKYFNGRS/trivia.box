import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { apiErrorResponse, zodErrorResponse } from "@/lib/apiError";
import { db } from "@/lib/db/client";
import { questionDecks } from "@/lib/db/schema";
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
  /**
   * Optional community-deck id. When set, the solo draw is scoped to this
   * deck's vetted questions — powers the "Play this deck" CTA on
   * `/decks/[id]`. The route enforces deck visibility (public or
   * owner-authenticated) before handing the id to `startSoloSession`.
   */
  deckId: z.string().uuid().nullish(),
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
  let accountId: string | null = null;
  if (userId) {
    const account = await getAccountByClerkUserId(userId);
    if (account) {
      accountId = account.id;
      const player = await getPlayerByAccountId(account.id);
      if (player) playerId = player.id;
    }
  }

  // Deck-scoped solo runs: only public decks can be played by anyone; a
  // private / unlisted deck can only be played by its owner. Hands off the
  // private deck contents even if someone guesses the id.
  if (body.deckId) {
    const [deck] = await db
      .select({
        id: questionDecks.id,
        visibility: questionDecks.visibility,
        ownerAccountId: questionDecks.ownerAccountId,
      })
      .from(questionDecks)
      .where(eq(questionDecks.id, body.deckId))
      .limit(1);
    if (!deck) {
      return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    }
    const isPublic = deck.visibility === "public";
    const isOwner = accountId !== null && deck.ownerAccountId === accountId;
    if (!isPublic && !isOwner) {
      return NextResponse.json(
        { error: "This deck isn't public yet" },
        { status: 403 }
      );
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
      deckId: body.deckId ?? null,
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
