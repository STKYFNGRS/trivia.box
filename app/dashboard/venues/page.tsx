import { and, eq, inArray } from "drizzle-orm";
import { getCurrentAccount } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { accounts, hostVenueRelationships, venueProfiles } from "@/lib/db/schema";
import { VenuesDashboardClient, type VenueListItem } from "./VenuesDashboardClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Venues",
  description: "Manage your venues, update photos and branding, and jump into per-venue stats.",
};

/**
 * Lists every venue the signed-in host/site_admin can manage. The user's own
 * account profile is always first; any `host_venue_relationships` give
 * multi-venue hosts access to additional venues. Edit / Change photo buttons
 * only light up for the venue the current user owns (where
 * `venueAccountId === account.id`) because the existing `/api/dashboard/venue`
 * endpoints scope to the signed-in account.
 */
export default async function DashboardVenuesPage() {
  const account = await getCurrentAccount();
  if (!account) return null;

  if (account.accountType !== "host" && account.accountType !== "site_admin") {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
        <h1 className="text-xl font-semibold">Venues</h1>
        <p className="mt-2 text-sm text-white/70">
          Only host accounts can manage venues. Ask your organizer to invite you.
        </p>
      </div>
    );
  }

  const rels = await db
    .select({ venueAccountId: hostVenueRelationships.venueId })
    .from(hostVenueRelationships)
    .where(
      and(
        eq(hostVenueRelationships.hostId, account.id),
        eq(hostVenueRelationships.status, "active")
      )
    );

  const venueIds = Array.from(
    new Set<string>([account.id, ...rels.map((r) => r.venueAccountId)])
  );

  const accountRows = await db
    .select({ id: accounts.id, name: accounts.name, city: accounts.city })
    .from(accounts)
    .where(inArray(accounts.id, venueIds));

  const profileRows = await db
    .select()
    .from(venueProfiles)
    .where(inArray(venueProfiles.accountId, venueIds));

  const profileByAccount = new Map(profileRows.map((p) => [p.accountId, p]));

  const items: VenueListItem[] = accountRows
    .map((a) => {
      const profile = profileByAccount.get(a.id);
      return {
        accountId: a.id,
        displayName: profile?.displayName || a.name || "Untitled venue",
        slug: profile?.slug ?? null,
        city: a.city,
        tagline: profile?.tagline ?? null,
        hasImage: Boolean(profile?.imageBytes),
        imageUpdatedAt: profile?.imageUpdatedAt
          ? new Date(profile.imageUpdatedAt).toISOString()
          : null,
        isOwner: a.id === account.id,
      } satisfies VenueListItem;
    })
    .sort((x, y) => {
      if (x.isOwner && !y.isOwner) return -1;
      if (!x.isOwner && y.isOwner) return 1;
      return x.displayName.localeCompare(y.displayName);
    });

  return <VenuesDashboardClient venues={items} />;
}
