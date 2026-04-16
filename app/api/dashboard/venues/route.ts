import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { accounts, hostVenueRelationships } from "@/lib/db/schema";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await getAccountByClerkUserId(userId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 400 });
  }

  if (account.accountType === "venue") {
    return NextResponse.json({
      venues: [{ venueAccountId: account.id, name: account.name, city: account.city }],
    });
  }

  const rels = await db
    .select({
      venueAccountId: hostVenueRelationships.venueId,
    })
    .from(hostVenueRelationships)
    .where(and(eq(hostVenueRelationships.hostId, account.id), eq(hostVenueRelationships.status, "active")));

  const venueIds = rels.map((r) => r.venueAccountId);
  if (venueIds.length === 0) {
    return NextResponse.json({
      venues: [{ venueAccountId: account.id, name: account.name, city: account.city }],
    });
  }

  const venueRows = await db
    .select({ id: accounts.id, name: accounts.name, city: accounts.city })
    .from(accounts)
    .where(inArray(accounts.id, venueIds));

  return NextResponse.json({
    venues: venueRows.map((v) => ({
      venueAccountId: v.id,
      name: v.name,
      city: v.city,
    })),
  });
}
