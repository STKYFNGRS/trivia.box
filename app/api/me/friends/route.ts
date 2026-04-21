import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { apiErrorResponse } from "@/lib/apiError";
import { listFriends, listPendingRequests } from "@/lib/friends";
import { getPlayerByAccountId } from "@/lib/players";
import { clientIpFromRequest, enforceRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Returns the viewer's accepted friends + pending inbox/outbox so the
 * `/dashboard/player/friends` page can render without a second round-trip.
 */
export async function GET(req: Request) {
  try {
    await enforceRateLimit("anonymous", `friends:list:${clientIpFromRequest(req)}`);
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const account = await getAccountByClerkUserId(userId);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    const player = await getPlayerByAccountId(account.id);
    if (!player) {
      return NextResponse.json({ error: "Player profile missing" }, { status: 404 });
    }
    const [friends, pending] = await Promise.all([
      listFriends(player.id),
      listPendingRequests(player.id),
    ]);
    return NextResponse.json({
      friends: friends.map((f) => ({
        playerId: f.playerId,
        username: f.username,
        totalPoints: f.totalPoints,
        friendsSince: f.friendsSince.toISOString(),
      })),
      pending: pending.map((p) => ({
        requestId: p.requestId,
        playerId: p.playerId,
        username: p.username,
        createdAt: p.createdAt.toISOString(),
        direction: p.direction,
      })),
    });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
