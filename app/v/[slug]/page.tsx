import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { CalendarClock, Gift, MapPin, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { FollowVenueButton } from "@/components/venue/FollowVenueButton";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusPill } from "@/components/ui/status-pill";
import { VenueJoinForm } from "@/components/venue/VenueJoinForm";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";
import { getVenueStats } from "@/lib/stats/aggregate";
import { cn } from "@/lib/utils";
import { getActiveSessionForVenue, getVenueProfileBySlug } from "@/lib/venue";

export const dynamic = "force-dynamic";

function formatEventTime(starts: Date, tz: string | null): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: tz ?? undefined,
    }).format(starts);
  } catch {
    return starts.toUTCString();
  }
}

function formatEventDateParts(
  starts: Date,
  tz: string | null
): { weekday: string; day: string; month: string; time: string } {
  const opts: Intl.DateTimeFormatOptions = { timeZone: tz ?? undefined };
  try {
    return {
      weekday: new Intl.DateTimeFormat(undefined, { ...opts, weekday: "short" }).format(starts),
      day: new Intl.DateTimeFormat(undefined, { ...opts, day: "2-digit" }).format(starts),
      month: new Intl.DateTimeFormat(undefined, { ...opts, month: "short" }).format(starts),
      time: new Intl.DateTimeFormat(undefined, { ...opts, hour: "numeric", minute: "2-digit" }).format(
        starts
      ),
    };
  } catch {
    return { weekday: "", day: "—", month: "—", time: starts.toISOString() };
  }
}

function VenueStatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">
        {label}
      </div>
      <div className="mt-1 text-2xl font-black tabular-nums tracking-tight">{value}</div>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const venue = await getVenueProfileBySlug(slug);
  if (!venue) return { title: "Venue not found" };
  // Root layout template is "%s · trivia.box", so we return the bare name
  // and let the template add the suffix once. Previously this double-
  // suffixed ("Acme · Trivia.Box · trivia.box").
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
  const fmtNum = (n: number) => new Intl.NumberFormat().format(n);

  return (
    <MarketingShell wide>
      <section className="relative h-[42vh] min-h-[300px] w-full overflow-hidden">
        {imageUrl ? (
          <div
            aria-hidden
            className="absolute inset-0 scale-105 bg-cover bg-center"
            style={{ backgroundImage: `url(${imageUrl})` }}
          />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-black"
          />
        )}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgb(0 0 0 / 0.35) 0%, rgb(0 0 0 / 0.55) 60%, var(--stage-bg) 100%)",
          }}
        />
        <div className="relative z-10 mx-auto flex h-full max-w-5xl flex-col justify-end px-6 pb-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80 ring-1 ring-white/15 backdrop-blur">
              <MapPin className="h-3 w-3" />
              Venue
            </span>
            {active ? (
              <StatusPill tone="success" dot pulse>
                Live now
              </StatusPill>
            ) : null}
          </div>
          <h1 className="mt-3 text-4xl font-black leading-[1.05] tracking-tight drop-shadow-lg sm:text-5xl md:text-6xl">
            {venue.displayName}
          </h1>
          {venue.tagline ? (
            <p className="mt-2 max-w-2xl text-base text-white/85 drop-shadow md:text-lg">
              {venue.tagline}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <FollowVenueButton
              venueSlug={venue.slug}
              venueDisplayName={venue.displayName}
            />
          </div>
        </div>
      </section>

      <main className="relative z-10 mx-auto flex max-w-5xl flex-col gap-10 px-6 pb-16 pt-8">
        {active ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-[var(--shadow-hero)] backdrop-blur">
            <div className="flex items-center gap-2 text-sm">
              <StatusPill tone="success" dot pulse>
                Live now
              </StatusPill>
              <span className="text-white/70">
                The host has a game running — grab the join code from the screen.
              </span>
            </div>
            <div className="mt-5">
              <VenueJoinForm />
            </div>
            {active.hasPrize && active.prizeDescription ? (
              <p className="mt-4 rounded-md bg-amber-500/15 p-3 text-sm text-amber-100 ring-1 ring-amber-500/20">
                <Sparkles className="mr-1.5 inline h-3.5 w-3.5" />
                {active.prizeDescription}
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="flex flex-col gap-4">
          <SectionHeader
            eyebrow="Schedule"
            title="Upcoming trivia"
            description={`Next games at ${venue.displayName}. Join codes are shared in-venue at game time.`}
            className="text-white [&_*]:text-white [&_p]:text-white/70"
          />

          {upcoming.length === 0 ? (
            <EmptyState
              icon={<CalendarClock className="h-5 w-5" />}
              title="No upcoming trivia scheduled"
              description={`Check back soon — ${venue.displayName} will post the next game here.`}
              className="border-white/10 bg-white/[0.03] text-white [&>div>div:first-child]:text-white"
            />
          ) : (
            <div className="flex flex-col gap-3">
              {upcoming.map((u) => {
                const parts = formatEventDateParts(new Date(u.eventStartsAt), u.eventTimezone);
                return (
                  <Card
                    key={u.id}
                    className="border-white/10 bg-white/[0.04] text-white shadow-[var(--shadow-card)] backdrop-blur"
                  >
                    <CardContent className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center">
                      <div className="flex w-24 flex-col items-center justify-center rounded-xl bg-white/[0.06] px-3 py-3 text-center ring-1 ring-white/10">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">
                          {parts.weekday}
                        </div>
                        <div className="text-2xl font-black tabular-nums tracking-tight">
                          {parts.day}
                        </div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                          {parts.month}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold tracking-tight">
                            {venue.displayName} trivia night
                          </div>
                          <StatusPill tone={u.runMode === "autopilot" ? "info" : "accent"}>
                            {u.runMode === "autopilot" ? "Autopilot" : "Hosted"}
                          </StatusPill>
                          {u.hasPrize ? (
                            <StatusPill tone="warning">
                              <Gift className="mr-1 h-3 w-3" />
                              Prize
                              {u.prizeDescription
                                ? `: ${u.prizeDescription.slice(0, 32)}${u.prizeDescription.length > 32 ? "…" : ""}`
                                : ""}
                            </StatusPill>
                          ) : null}
                        </div>
                        <div className="mt-1 text-sm tabular-nums text-white/70">
                          {formatEventTime(new Date(u.eventStartsAt), u.eventTimezone)}
                        </div>
                        {u.hasPrize && u.prizeDescription ? (
                          <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-200">
                            <Sparkles className="h-3.5 w-3.5" />
                            {u.prizeDescription}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex w-full items-center gap-2 sm:w-auto">
                        <Link
                          href={`/v/${venue.slug}/events/${u.id}`}
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "w-full border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white sm:w-auto"
                          )}
                        >
                          View details
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {venue.description ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
              About
            </div>
            <p className="mt-2 text-sm leading-relaxed text-white/80">{venue.description}</p>
          </section>
        ) : null}

        {venueStats && venueStats.totals.completedGames > 0 ? (
          <section className="flex flex-col gap-4">
            <SectionHeader
              eyebrow="Stats"
              title="House trivia by the numbers"
              description={`Across ${venueStats.totals.completedGames} completed game${
                venueStats.totals.completedGames === 1 ? "" : "s"
              } at ${venue.displayName}.`}
              className="text-white [&_*]:text-white [&_p]:text-white/70"
            />
            <div className="grid gap-3 sm:grid-cols-4">
              <VenueStatCell label="Completed" value={fmtNum(venueStats.totals.completedGames)} />
              <VenueStatCell label="Unique players" value={fmtNum(venueStats.totals.uniquePlayers)} />
              <VenueStatCell label="Answers" value={fmtNum(venueStats.totals.totalAnswers)} />
              <VenueStatCell label="Avg. score" value={fmtNum(venueStats.totals.averageScore)} />
            </div>
            {venueStats.topPlayers.length > 0 ? (
              <Card className="border-white/10 bg-white/[0.04] text-white shadow-[var(--shadow-card)] backdrop-blur">
                <CardContent className="p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
                    House leaderboard
                  </div>
                  <div className="mt-3 flex flex-col gap-1">
                    {venueStats.topPlayers.slice(0, 10).map((p, idx) => (
                      <div
                        key={p.username}
                        className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-b border-white/5 py-1.5 text-sm last:border-b-0"
                      >
                        <div className="tabular-nums text-white/60">{idx + 1}</div>
                        <div className="truncate font-medium">{p.username}</div>
                        <div className="text-right tabular-nums font-semibold">
                          {fmtNum(p.totalScore)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </section>
        ) : null}

        <p className="text-center text-xs text-white/40">Powered by Trivia.Box</p>
      </main>
    </MarketingShell>
  );
}
