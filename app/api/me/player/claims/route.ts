import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/accounts";
import { apiErrorResponse } from "@/lib/apiError";
import { getPlayerByAccountId } from "@/lib/players";
import { listPlayerClaims } from "@/lib/prizes";

export const dynamic = "force-dynamic";

/**
 * Phase 4.2: return the current player's prize claims. Response mirrors
 * `PlayerClaimRow` — the dashboard player card + the dedicated claims
 * page both consume this endpoint.
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
