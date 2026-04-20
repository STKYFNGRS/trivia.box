import { NextResponse } from "next/server";
import {
  getActiveSessionForVenue,
  getNextUpcomingSessionForVenue,
  getVenueProfileBySlug,
} from "@/lib/venue";

/**
 * Public venue summary used by the lobby page and any future subdomain rewrite.
 * Never returns the join code — the display screen shows it at the venue.
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
