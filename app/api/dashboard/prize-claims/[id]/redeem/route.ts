import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/accounts";
import { apiErrorResponse } from "@/lib/apiError";
import { redeemClaim } from "@/lib/prizes";

export const dynamic = "force-dynamic";

/**
 * Phase 4.2: host-only endpoint to mark a prize claim as handed out.
 * Auth: the caller must be a host/site_admin and must own the venue that
 * the claim belongs to.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const account = await getCurrentAccount();
    if (!account) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (account.accountType !== "host" && account.accountType !== "site_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await redeemClaim({
      claimId: id,
      venueAccountId: account.id,
      resolvedByAccountId: account.id,
    });
    if (!result.ok) {
      const status =
        result.reason === "not_found"
          ? 404
          : result.reason === "forbidden"
            ? 403
            : 409;
      return NextResponse.json(
        { error: result.reason ?? "redeem_failed" },
        { status }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
