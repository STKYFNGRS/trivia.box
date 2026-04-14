import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { AccountRow } from "@/lib/accounts";
import { hostVenueRelationships, sessions } from "@/lib/db/schema";

export async function assertHostControlsSession(account: AccountRow, sessionId: string) {
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const session = rows[0];
  if (!session) {
    throw new Error("Session not found");
  }
  if (session.hostAccountId !== account.id) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function assertHostCanUseVenue(account: AccountRow, venueAccountId: string) {
  if (account.accountType === "venue" && account.id === venueAccountId) {
    return;
  }
  if (account.accountType !== "host") {
    throw new Error("Only hosts or venues can create sessions for a venue");
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
    throw new Error("Host is not linked to that venue");
  }
}
