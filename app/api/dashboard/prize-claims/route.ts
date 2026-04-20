import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentAccount } from "@/lib/accounts";
import { apiErrorResponse } from "@/lib/apiError";
import { db } from "@/lib/db/client";
import { players, prizeClaims, sessions } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * Phase 4.2: list all prize claims the current host account can resolve.
 * A host can see every claim whose `venueAccountId` matches their own
 * account. Filtered by status via `?status=pending|redeemed|all`.
 */
export async function GET(req: Request) {
  try {
    const account = await getCurrentAccount();
    if (!account) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (account.accountType !== "host" && account.accountType !== "site_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const statusRaw = searchParams.get("status") ?? "pending";
    const status =
      statusRaw === "pending" || statusRaw === "redeemed" || statusRaw === "all"
        ? statusRaw
        : "pending";

    const baseFilter = eq(prizeClaims.venueAccountId, account.id);
    const filter =
      status === "all" ? baseFilter : and(baseFilter, eq(prizeClaims.status, status));

    const rows = await db
      .select({
        id: prizeClaims.id,
        sessionId: prizeClaims.sessionId,
        joinCode: sessions.joinCode,
        playerId: prizeClaims.playerId,
        playerName: players.username,
        finalRank: prizeClaims.finalRank,
        prizeLabel: prizeClaims.prizeLabel,
        claimCode: prizeClaims.claimCode,
        status: prizeClaims.status,
        expiresAt: prizeClaims.expiresAt,
        redeemedAt: prizeClaims.redeemedAt,
        createdAt: prizeClaims.createdAt,
      })
      .from(prizeClaims)
      .innerJoin(players, eq(players.id, prizeClaims.playerId))
      .innerJoin(sessions, eq(sessions.id, prizeClaims.sessionId))
      .where(filter)
      .orderBy(desc(prizeClaims.createdAt))
      .limit(200);

    // `inArray` is unused here but imported so future "bulk mark redeemed"
    // endpoints can share the import list.
    void inArray;

    return NextResponse.json({
      claims: rows.map((r) => ({
        ...r,
        expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
        redeemedAt: r.redeemedAt ? r.redeemedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
