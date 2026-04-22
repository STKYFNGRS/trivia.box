import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PublicVenueSections } from "@/components/venue/PublicVenueSections";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";
import { getVenueStats } from "@/lib/stats/aggregate";
import { getActiveSessionForVenue, getVenueProfileBySlug } from "@/lib/venue";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const venue = await getVenueProfileBySlug(slug);
  if (!venue) return { title: "Venue not found" };
  return {
    title: venue.displayName,
    description: venue.tagline ?? venue.description ?? `${venue.displayName} on Trivia.Box`,
  };
}

export default async function VenueLobbyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const venue = await getVenueProfileBySlug(slug);
  if (!venue) notFound();

  const active = await getActiveSessionForVenue(venue.accountId);

  const now = new Date();
  const upcoming = await db
    .select({
      id: sessions.id,
      eventStartsAt: sessions.eventStartsAt,
      eventTimezone: sessions.eventTimezone,
      hasPrize: sessions.hasPrize,
      prizeDescription: sessions.prizeDescription,
      runMode: sessions.runMode,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.venueAccountId, venue.accountId),
        eq(sessions.listedPublic, true),
        inArray(sessions.status, ["pending"]),
        gt(sessions.eventStartsAt, now)
      )
    )
    .orderBy(asc(sessions.eventStartsAt))
    .limit(6);

  const bust = venue.imageUpdatedAt ? new Date(venue.imageUpdatedAt).getTime() : 0;
  const imageUrl = venue.imageBytes ? `/api/venues/${venue.slug}/image?v=${bust}` : null;
  const venueStats = await getVenueStats(venue.accountId);

  return (
    <MarketingShell wide>
      <PublicVenueSections
        venue={{
          accountId: venue.accountId,
          slug: venue.slug,
          displayName: venue.displayName,
          tagline: venue.tagline,
          description: venue.description,
          addressStreet: venue.addressStreet,
          addressCity: venue.addressCity,
          addressRegion: venue.addressRegion,
          addressPostalCode: venue.addressPostalCode,
          addressCountry: venue.addressCountry,
          imageUpdatedAt: venue.imageUpdatedAt,
          hasImage: Boolean(venue.imageBytes),
        }}
        imageUrl={imageUrl}
        active={
          active
            ? { hasPrize: active.hasPrize, prizeDescription: active.prizeDescription }
            : null
        }
        upcoming={upcoming.map((u) => ({
          id: u.id,
          eventStartsAt: u.eventStartsAt,
          eventTimezone: u.eventTimezone,
          hasPrize: u.hasPrize,
          prizeDescription: u.prizeDescription,
          runMode: u.runMode,
        }))}
        stats={venueStats}
        showFollowButton
      />
    </MarketingShell>
  );
}
