import { NextResponse } from "next/server";
import {
  getActiveSessionForVenue,
  getNextUpcomingSessionForVenue,
  getVenueProfileBySlug,
} from "@/lib/venue";

/**
 * GET /api/venues/[slug]/public — public HTTP surface.
 *
 * Public venue summary plus the venue's currently-active or next upcoming
 * session. Never returns the join code — the display screen shows it at the
 * venue.
 *
 * Not consumed by the in-repo app. The `/v/[slug]` lobby page calls
 * `lib/venue` helpers directly as an RSC. This route is kept as the external
 * contract for embeds, future subdomain rewrites, mobile clients, and
 * partner integrations — keep the response shape stable.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const venue = await getVenueProfileBySlug(slug);
  if (!venue) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const active = await getActiveSessionForVenue(venue.accountId);
  const upcoming = active ? null : await getNextUpcomingSessionForVenue(venue.accountId);

  return NextResponse.json({
    venue: {
      slug: venue.slug,
      displayName: venue.displayName,
      tagline: venue.tagline,
      description: venue.description,
      timezone: venue.timezone,
      imageUpdatedAt: venue.imageUpdatedAt,
      hasImage: Boolean(venue.imageBytes),
    },
    activeSession: active
      ? {
          id: active.id,
          status: active.status,
          eventStartsAt: active.eventStartsAt,
          eventTimezone: active.eventTimezone,
          hasPrize: active.hasPrize,
          prizeDescription: active.prizeDescription,
        }
      : null,
    upcomingSession: upcoming
      ? {
          id: upcoming.id,
          eventStartsAt: upcoming.eventStartsAt,
          eventTimezone: upcoming.eventTimezone,
          hasPrize: upcoming.hasPrize,
          prizeDescription: upcoming.prizeDescription,
        }
      : null,
  });
}
