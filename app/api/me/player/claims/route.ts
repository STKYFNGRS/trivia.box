import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/accounts";
import { apiErrorResponse } from "@/lib/apiError";
import { getPlayerByAccountId } from "@/lib/players";
import { listPlayerClaims } from "@/lib/prizes";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/player/claims — public HTTP surface.
 *
 * Returns the signed-in player's prize claims. Response mirrors `PlayerClaimRow`.
 *
 * Not consumed by the in-repo app. The dashboard player card and the dedicated
 * claims page render from `lib/prizes#listPlayerClaims` directly as RSCs. This
 * route is kept as the external contract for embeds, mobile clients, and future
 * partner integrations — keep the response shape stable.
 */
export async function GET(req: Request) {
  try {
    const account = await getCurrentAccount();
    if (!account) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const player = await getPlayerByAccountId(account.id);
    if (!player) {
      return NextResponse.json({ claims: [] });
    }

    const { searchParams } = new URL(req.url);
    const statusRaw = searchParams.get("status") ?? "all";
    const status =
      statusRaw === "pending" || statusRaw === "redeemed" || statusRaw === "all"
        ? statusRaw
        : "all";

    const claims = await listPlayerClaims(player.id, { status });
    return NextResponse.json({ claims });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
