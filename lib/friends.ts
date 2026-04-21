/**
 * Friendships data layer — directed requests that collapse into a symmetric
 * social graph once accepted. Callers address friends by the *viewer's*
 * player id; the helpers always return the counterparty so the UI can
 * render a list without having to branch on who initiated.
 */

import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { friendships, playerStats, players } from "@/lib/db/schema";

export type FriendshipStatus = "none" | "pending_out" | "pending_in" | "friends";

export type FriendRow = {
  playerId: string;
  username: string | null;
  totalPoints: number;
  friendsSince: Date;
};

export type PendingRequestRow = {
  requestId: string;
  playerId: string;
  username: string | null;
  createdAt: Date;
  direction: "incoming" | "outgoing";
};

export async function getFriendshipStatus(
  viewerPlayerId: string,
  otherPlayerId: string
): Promise<FriendshipStatus> {
  if (viewerPlayerId === otherPlayerId) return "none";
  const rows = await db
    .select({
      requesterId: friendships.requesterId,
      addresseeId: friendships.addresseeId,
      status: friendships.status,
    })
    .from(friendships)
    .where(
      or(
        and(
          eq(friendships.requesterId, viewerPlayerId),
          eq(friendships.addresseeId, otherPlayerId)
        ),
        and(
          eq(friendships.requesterId, otherPlayerId),
          eq(friendships.addresseeId, viewerPlayerId)
        )
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  return row.requesterId === viewerPlayerId ? "pending_out" : "pending_in";
}

/**
 * Send a friend request. Idempotent — if a request already exists in either
 * direction we don't insert a duplicate, we just return the current status.
 */
export async function sendFriendRequest(
  requesterId: string,
  addresseeId: string
): Promise<FriendshipStatus> {
  if (requesterId === addresseeId) {
    throw new Error("Can't friend yourself");
  }
  const current = await getFriendshipStatus(requesterId, addresseeId);
  if (current === "friends" || current === "pending_out") return current;
  // If the other user already invited us, accepting is the natural next step.
  if (current === "pending_in") {
    return acceptFriendRequest(requesterId, addresseeId);
  }
  await db.insert(friendships).values({
    requesterId,
    addresseeId,
    status: "pending",
  });
  return "pending_out";
}

export async function acceptFriendRequest(
  viewerPlayerId: string,
  otherPlayerId: string
): Promise<FriendshipStatus> {
  const [updated] = await db
    .update(friendships)
    .set({ status: "accepted", acceptedAt: new Date() })
    .where(
      and(
        eq(friendships.requesterId, otherPlayerId),
        eq(friendships.addresseeId, viewerPlayerId),
        eq(friendships.status, "pending")
      )
    )
    .returning({ id: friendships.id });
  if (!updated) {
    // Either no such row or already accepted; re-read to return a truthful
    // status instead of silently flipping to "friends".
    return getFriendshipStatus(viewerPlayerId, otherPlayerId);
  }
  return "friends";
}

/**
 * Remove a friendship or decline/cancel a pending request — the same
 * directional edge is deleted in all three cases so the pair can
 * re-friend later without stale state.
 */
export async function removeFriendship(
  viewerPlayerId: string,
  otherPlayerId: string
): Promise<FriendshipStatus> {
  await db.delete(friendships).where(
    or(
      and(
        eq(friendships.requesterId, viewerPlayerId),
        eq(friendships.addresseeId, otherPlayerId)
      ),
      and(
        eq(friendships.requesterId, otherPlayerId),
        eq(friendships.addresseeId, viewerPlayerId)
      )
    )
  );
  return "none";
}

export async function listFriends(playerId: string): Promise<FriendRow[]> {
  // Build both directions in a single query by swapping requester/addressee
  // on the join — the "other" player is whichever column isn't the viewer.
  const rows = await db
    .select({
      requesterId: friendships.requesterId,
      addresseeId: friendships.addresseeId,
      friendsSince: friendships.acceptedAt,
      rPlayerId: players.id,
      rUsername: players.username,
      aPlayerId: sql<string>`a_player.id`,
      aUsername: sql<string | null>`a_player.username`,
      requesterPoints: sql<number | null>`r_stats.total_points`,
      addresseePoints: sql<number | null>`a_stats.total_points`,
    })
    .from(friendships)
    .innerJoin(players, eq(players.id, friendships.requesterId))
    .innerJoin(
      sql`${players} as a_player`,
      sql`a_player.id = ${friendships.addresseeId}`
    )
    .leftJoin(
      sql`${playerStats} as r_stats`,
      sql`r_stats.player_id = ${friendships.requesterId}`
    )
    .leftJoin(
      sql`${playerStats} as a_stats`,
      sql`a_stats.player_id = ${friendships.addresseeId}`
    )
    .where(
      and(
        eq(friendships.status, "accepted"),
        or(
          eq(friendships.requesterId, playerId),
          eq(friendships.addresseeId, playerId)
        )
      )
    )
    .orderBy(desc(friendships.acceptedAt));

  return rows.map((row) => {
    const viewerIsRequester = row.requesterId === playerId;
    return {
      playerId: viewerIsRequester ? row.aPlayerId : row.rPlayerId,
      username: viewerIsRequester ? row.aUsername : row.rUsername,
      totalPoints: Number(
        viewerIsRequester ? (row.addresseePoints ?? 0) : (row.requesterPoints ?? 0)
      ),
      friendsSince: row.friendsSince ?? new Date(0),
    };
  });
}

export async function listPendingRequests(
  playerId: string
): Promise<PendingRequestRow[]> {
  const outgoing = await db
    .select({
      requestId: friendships.id,
      playerId: players.id,
      username: players.username,
      createdAt: friendships.createdAt,
    })
    .from(friendships)
    .innerJoin(players, eq(players.id, friendships.addresseeId))
    .where(
      and(
        eq(friendships.requesterId, playerId),
        eq(friendships.status, "pending")
      )
    );
  const incoming = await db
    .select({
      requestId: friendships.id,
      playerId: players.id,
      username: players.username,
      createdAt: friendships.createdAt,
    })
    .from(friendships)
    .innerJoin(players, eq(players.id, friendships.requesterId))
    .where(
      and(
        eq(friendships.addresseeId, playerId),
        eq(friendships.status, "pending")
      )
    );
  const outRows: PendingRequestRow[] = outgoing.map((r) => ({
    ...r,
    direction: "outgoing" as const,
  }));
  const inRows: PendingRequestRow[] = incoming.map((r) => ({
    ...r,
    direction: "incoming" as const,
  }));
  return [...inRows, ...outRows].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

/** Cheap count for the profile "X friends" chip. */
export async function countFriends(playerId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, "accepted"),
        or(
          eq(friendships.requesterId, playerId),
          eq(friendships.addresseeId, playerId)
        )
      )
    );
  return row?.n ?? 0;
}
