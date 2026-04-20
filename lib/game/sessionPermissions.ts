import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { AccountRow } from "@/lib/accounts";
import { hostVenueRelationships, sessions } from "@/lib/db/schema";
import { siteAdminDevBypassEnabled } from "@/lib/siteAdmin";
import { ApiError } from "@/lib/apiError";

export async function assertHostControlsSession(account: AccountRow, sessionId: string) {
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const session = rows[0];
  if (!session) {
    throw new ApiError(404, "Session not found");
  }
  if (session.hostAccountId !== account.id) {
    throw new ApiError(403, "Forbidden");
  }
  return session;
}

/**
 * Allowed when the venue is the host's own account (the default room),
 * when the host has an active `host_venue_relationships` row, or for a
 * site admin with the dev bypass enabled.
 */
export async function assertHostCanUseVenue(account: AccountRow, venueAccountId: string) {
  if (account.accountType === "site_admin" && siteAdminDevBypassEnabled()) {
    return;
  }
  if (account.accountType !== "host") {
    throw new ApiError(403, "Only hosts can create sessions for a venue");
  }
  if (venueAccountId === account.id) {
    return;
  }
  const rel = await db
    .select({ id: hostVenueRelationships.id })
    .from(hostVenueRelationships)
    .where(
      and(
        eq(hostVenueRelationships.hostId, account.id),
        eq(hostVenueRelationships.venueId, venueAccountId),
        eq(hostVenueRelationships.status, "active")
      )
    )
    .limit(1);
  if (rel.length === 0) {
    throw new ApiError(403, "Host is not linked to that venue");
  }
}
