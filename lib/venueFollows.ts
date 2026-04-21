import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { venueFollows } from "@/lib/db/schema";

/**
 * Venue follows — thin data-layer wrappers around the `venue_follows`
 * edge table. Kept tiny on purpose; future "follow feed" work (Tier 3)
 * will grow a richer API on top of this.
 */

export async function isFollowingVenue(
  playerId: string,
  venueAccountId: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: venueFollows.id })
    .from(venueFollows)
    .where(
      and(
        eq(venueFollows.playerId, playerId),
        eq(venueFollows.venueAccountId, venueAccountId)
      )
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Upsert a follow row. `ON CONFLICT DO NOTHING` means repeated taps on
 * "Follow" are idempotent, which is what the UI toggle expects.
 */
export async function followVenue(
  playerId: string,
  venueAccountId: string
): Promise<void> {
  await db
    .insert(venueFollows)
    .values({ playerId, venueAccountId })
    .onConflictDoNothing({
      target: [venueFollows.playerId, venueFollows.venueAccountId],
    });
}

export async function unfollowVenue(
  playerId: string,
  venueAccountId: string
): Promise<void> {
  await db
    .delete(venueFollows)
    .where(
      and(
        eq(venueFollows.playerId, playerId),
        eq(venueFollows.venueAccountId, venueAccountId)
      )
    );
}
