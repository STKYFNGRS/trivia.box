import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { apiErrorResponse } from "@/lib/apiError";
import { getPlayerByAccountId } from "@/lib/players";
import {
  followVenue,
  isFollowingVenue,
  unfollowVenue,
} from "@/lib/venueFollows";
import { getVenueProfileBySlug } from "@/lib/venue";

export const dynamic = "force-dynamic";

/**
 * Venue follow toggle — server surface backing the "Follow" button in
 * `FinalStandings` + `/v/[slug]`.
 *
 * - `GET`    → `{ following: boolean }` for the viewer.
 * - `POST`   → idempotent follow; returns `{ following: true }`.
 * - `DELETE` → idempotent unfollow; returns `{ following: false }`.
 *
 * All three require auth: anonymous guests can still play, but follows
 * are tied to a player profile so we can later surface the follow list
 * on the dashboard and opt them into the venue-specific email digest.
 */
type FollowContext =
  | { error: NextResponse }
  | { error?: undefined; playerId: string; venueAccountId: string };

async function resolveContext(slug: string): Promise<FollowContext> {
  const { userId } = await auth();
  if (!userId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const account = await getAccountByClerkUserId(userId);
  if (!account) {
    return { error: NextResponse.json({ error: "Account not found" }, { status: 404 }) };
  }
  const player = await getPlayerByAccountId(account.id);
  if (!player) {
    return {
      error: NextResponse.json({ error: "Player profile missing" }, { status: 404 }),
    };
  }
  const venue = await getVenueProfileBySlug(slug);
  if (!venue) {
    return { error: NextResponse.json({ error: "Venue not found" }, { status: 404 }) };
  }
  // Can't follow yourself — the dashboard surface for hosts already
  // includes their own venue.
  if (venue.accountId === account.id) {
    return {
      error: NextResponse.json(
        { error: "You can't follow your own venue" },
        { status: 400 }
      ),
    };
  }
  return { playerId: player.id, venueAccountId: venue.accountId };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ctx = await resolveContext(slug);
    if (ctx.error) return ctx.error;
    const following = await isFollowingVenue(ctx.playerId, ctx.venueAccountId);
    return NextResponse.json({ following });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ctx = await resolveContext(slug);
    if (ctx.error) return ctx.error;
    await followVenue(ctx.playerId, ctx.venueAccountId);
    return NextResponse.json({ following: true });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const ctx = await resolveContext(slug);
    if (ctx.error) return ctx.error;
    await unfollowVenue(ctx.playerId, ctx.venueAccountId);
    return NextResponse.json({ following: false });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
