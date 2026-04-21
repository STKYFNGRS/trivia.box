import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { apiErrorResponse } from "@/lib/apiError";
import { db } from "@/lib/db/client";
import { players } from "@/lib/db/schema";
import {
  acceptFriendRequest,
  getFriendshipStatus,
  removeFriendship,
  sendFriendRequest,
  type FriendshipStatus,
} from "@/lib/friends";
import { getPlayerByAccountId } from "@/lib/players";
import { clientIpFromRequest, enforceRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Friendship edge surface — REST-style toggle between the authenticated
 * viewer and the player identified by the `[playerId]` URL segment.
 *
 * - `GET`    → `{ status }` (one of "none" | "pending_in" | "pending_out"
 *              | "friends"). Public so profile pages can decide what
 *              button to render.
 * - `POST`   → send a friend request (or auto-accept if the other user
 *              already invited us).
 * - `PATCH`  → accept an incoming pending request.
 * - `DELETE` → cancel outgoing request / decline incoming / unfriend.
 *
 * All mutations require auth; spam is kept in check by the shared
 * `anonymous` rate limiter.
 */
type Context =
  | { error: NextResponse }
  | { error?: undefined; viewerPlayerId: string; otherPlayerId: string };

async function resolveContext(targetId: string): Promise<Context> {
  const { userId } = await auth();
  if (!userId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const account = await getAccountByClerkUserId(userId);
  if (!account) {
    return { error: NextResponse.json({ error: "Account not found" }, { status: 404 }) };
  }
  const player = await getPlayerByAccountId(account.id);
  if (!player) {
    return {
      error: NextResponse.json(
        { error: "Player profile missing" },
        { status: 404 }
      ),
    };
  }
  const [other] = await db
    .select({ id: players.id })
    .from(players)
    .where(eq(players.id, targetId))
    .limit(1);
  if (!other) {
    return { error: NextResponse.json({ error: "Player not found" }, { status: 404 }) };
  }
  if (other.id === player.id) {
    return {
      error: NextResponse.json(
        { error: "Can't friend yourself" },
        { status: 400 }
      ),
    };
  }
  return { viewerPlayerId: player.id, otherPlayerId: other.id };
}

function ok(status: FriendshipStatus) {
  return NextResponse.json({ status });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    const { playerId } = await params;
    const ctx = await resolveContext(playerId);
    if (ctx.error) return ctx.error;
    const status = await getFriendshipStatus(ctx.viewerPlayerId, ctx.otherPlayerId);
    return ok(status);
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    const { playerId } = await params;
    await enforceRateLimit(
      "anonymous",
      `friends:invite:${clientIpFromRequest(req)}`
    );
    const ctx = await resolveContext(playerId);
    if (ctx.error) return ctx.error;
    const status = await sendFriendRequest(
      ctx.viewerPlayerId,
      ctx.otherPlayerId
    );
    return ok(status);
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    const { playerId } = await params;
    await enforceRateLimit(
      "anonymous",
      `friends:accept:${clientIpFromRequest(req)}`
    );
    const ctx = await resolveContext(playerId);
    if (ctx.error) return ctx.error;
    const status = await acceptFriendRequest(
      ctx.viewerPlayerId,
      ctx.otherPlayerId
    );
    return ok(status);
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    const { playerId } = await params;
    const ctx = await resolveContext(playerId);
    if (ctx.error) return ctx.error;
    const status = await removeFriendship(
      ctx.viewerPlayerId,
      ctx.otherPlayerId
    );
    return ok(status);
  } catch (e) {
    return apiErrorResponse(e);
  }
}
