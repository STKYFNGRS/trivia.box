import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { assertHostCanUseVenue } from "@/lib/game/sessionPermissions";
import { getHostVenueOpsStats, getVenueStats } from "@/lib/stats/aggregate";

/**
 * Host-facing venue stats. Returns everything the public endpoint returns
 * plus the operational funnel (pending / active / completed / no-shows and
 * average game fill). Auth-gated so only operators for this venue see it.
 */
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const account = await getAccountByClerkUserId(userId);
  if (!account || account.accountType === "player") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const venueAccountId = url.searchParams.get("venueAccountId") ?? account.id;

  try {
    await assertHostCanUseVenue(account, venueAccountId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Forbidden" }, { status: 403 });
  }

  const [publicStats, opsStats] = await Promise.all([
    getVenueStats(venueAccountId),
    getHostVenueOpsStats(venueAccountId),
  ]);

  if (!publicStats) {
    return NextResponse.json({ error: "Venue profile missing" }, { status: 404 });
  }

  return NextResponse.json({ ...publicStats, ops: opsStats });
}

export const dynamic = "force-dynamic";
