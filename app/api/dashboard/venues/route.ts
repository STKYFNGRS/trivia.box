import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { accounts, hostVenueRelationships, venueProfiles } from "@/lib/db/schema";
import { siteAdminDevBypassEnabled } from "@/lib/siteAdmin";
import { ensureVenueProfileForAccount } from "@/lib/venue";

type VenueResult = {
  venueAccountId: string;
  name: string;
  displayName: string;
  slug: string | null;
  city: string;
  imageUpdatedAt: Date | null;
  hasImage: boolean;
};

async function hydrateVenueRows(
  rows: { id: string; name: string; city: string }[]
): Promise<VenueResult[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const profiles = await db
    .select()
    .from(venueProfiles)
    .where(inArray(venueProfiles.accountId, ids));

  const profileByAccount = new Map(profiles.map((p) => [p.accountId, p]));
  const results: VenueResult[] = [];
  for (const row of rows) {
    let profile = profileByAccount.get(row.id);
    if (!profile) {
      // Lazy-create for any host that slipped through the backfill.
      profile = await ensureVenueProfileForAccount(row.id);
    }
    const displayName = profile.displayName || row.name || "Untitled venue";
    results.push({
      venueAccountId: row.id,
      name: displayName,
      displayName,
      slug: profile.slug,
      city: row.city,
      imageUpdatedAt: profile.imageUpdatedAt,
      hasImage: Boolean(profile.imageBytes),
    });
  }
  return results;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await getAccountByClerkUserId(userId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 400 });
  }

  if (account.accountType === "site_admin" && siteAdminDevBypassEnabled()) {
    const rows = await db
      .select({ id: accounts.id, name: accounts.name, city: accounts.city })
      .from(accounts)
      .where(inArray(accounts.accountType, ["host", "site_admin"]));
    const venues = await hydrateVenueRows(rows);
    return NextResponse.json({ venues });
  }

  if (account.accountType !== "host" && account.accountType !== "site_admin") {
    return NextResponse.json({ venues: [] });
  }

  const rels = await db
    .select({ venueAccountId: hostVenueRelationships.venueId })
    .from(hostVenueRelationships)
    .where(and(eq(hostVenueRelationships.hostId, account.id), eq(hostVenueRelationships.status, "active")));

  const venueIds = Array.from(
    new Set<string>([account.id, ...rels.map((r) => r.venueAccountId)])
  );

  const venueRows = await db
    .select({ id: accounts.id, name: accounts.name, city: accounts.city })
    .from(accounts)
    .where(inArray(accounts.id, venueIds));

  // Preserve "own account first" order.
  venueRows.sort((a, b) => {
    if (a.id === account.id) return -1;
    if (b.id === account.id) return 1;
    return a.name.localeCompare(b.name);
  });

  const venues = await hydrateVenueRows(venueRows);
  return NextResponse.json({ venues });
}
