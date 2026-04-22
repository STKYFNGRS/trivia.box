import { and, asc, eq, gt, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, Trophy } from "lucide-react";
import { EditVenueTrigger } from "@/components/dashboard/stats/EditVenueTrigger";
import { VenuePicker, type VenuePickerOption } from "@/components/dashboard/stats/VenuePicker";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusPill } from "@/components/ui/status-pill";
import { PublicVenueSections } from "@/components/venue/PublicVenueSections";
import { getCurrentAccount } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { accounts, hostVenueRelationships, sessions, venueProfiles } from "@/lib/db/schema";
import { getHostVenueOpsStats, getVenueStats } from "@/lib/stats/aggregate";
import { cn } from "@/lib/utils";
import { getActiveSessionForVenue } from "@/lib/venue";

function fmtNum(n: number): string {
  return new Intl.NumberFormat().format(n);
}

export const dynamic = "force-dynamic";

export default async function HostStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ venueId?: string }>;
}) {
  const account = await getCurrentAccount();
  if (!account) {
    redirect("/sign-in");
  }
  if (account.accountType === "player") {
    redirect("/dashboard/player");
  }

  // Build the list of venues this host can view stats for: their own account
  // first (primary venue) + any venues they host through an active
  // `host_venue_relationships` row.
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
  const accountRows = venueIds.length
    ? await db
        .select({ id: accounts.id, name: accounts.name, city: accounts.city })
        .from(accounts)
        .where(inArray(accounts.id, venueIds))
    : [];
  const profileRows = venueIds.length
    ? await db
        .select()
        .from(venueProfiles)
        .where(inArray(venueProfiles.accountId, venueIds))
    : [];
  const profileByAccount = new Map(profileRows.map((p) => [p.accountId, p]));
  const cityByAccount = new Map(accountRows.map((a) => [a.id, a.city]));
  const pickerOptions: VenuePickerOption[] = accountRows
    .map((a) => ({
      accountId: a.id,
      displayName:
        profileByAccount.get(a.id)?.displayName || a.name || "Untitled venue",
    }))
    .sort((x, y) => {
      if (x.accountId === account.id) return -1;
      if (y.accountId === account.id) return 1;
      return x.displayName.localeCompare(y.displayName);
    });

  const requestedVenueId = (await searchParams).venueId ?? null;
  // Reject unknown ids — a host shouldn't be able to pivot stats to a venue
  // they don't belong to just by guessing the id.
  const venueAccountId =
    requestedVenueId && venueIds.includes(requestedVenueId)
      ? requestedVenueId
      : account.id;

  const selectedProfile = profileByAccount.get(venueAccountId);

  const [stats, ops, active] = await Promise.all([
    getVenueStats(venueAccountId),
    getHostVenueOpsStats(venueAccountId),
    getActiveSessionForVenue(venueAccountId),
  ]);

  const now = new Date();
  const upcomingRows = selectedProfile
    ? await db
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
            eq(sessions.venueAccountId, venueAccountId),
            eq(sessions.listedPublic, true),
            inArray(sessions.status, ["pending"]),
            gt(sessions.eventStartsAt, now)
          )
        )
        .orderBy(asc(sessions.eventStartsAt))
        .limit(6)
    : [];

  if (!selectedProfile || !stats) {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader
          as="h1"
          eyebrow="Stats"
          title="Your venue stats"
          description="We could not find a venue profile for this selection yet."
        />
        <Card>
          <CardContent className="text-muted-foreground p-5 text-sm">
            Set up your venue profile from game setup to start tracking per-venue stats.{" "}
            <Link href="/dashboard/games/new" className="underline">
              Open game setup
            </Link>
            .
          </CardContent>
        </Card>
      </div>
    );
  }

  const bust = selectedProfile.imageUpdatedAt
    ? new Date(selectedProfile.imageUpdatedAt).getTime()
    : 0;
  const imageUrl = selectedProfile.imageBytes
    ? `/api/venues/${selectedProfile.slug}/image?v=${bust}`
    : null;
  const isOwner = venueAccountId === account.id;

  return (
    <div className="-mx-6 flex flex-col">
      {/* Chrome / action row sits above the hero so it's always visible to
          hosts; the VenuePicker floats right when there are multiple venues. */}
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-6 pb-4 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/venues"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "text-white/75 hover:bg-white/5 hover:text-white"
            )}
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back to venues
          </Link>
          {isOwner ? <EditVenueTrigger /> : null}
          <a
            href={`/v/${selectedProfile.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
            )}
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            View public page
          </a>
        </div>
        {pickerOptions.length > 1 ? (
          <VenuePicker options={pickerOptions} selectedId={venueAccountId} />
        ) : null}
      </div>

      {/* (A) Public mirror — identical hero + upcoming + stat grid + leaderboard
          as /v/[slug] so players and the host see the same numbers. */}
      <PublicVenueSections
        venue={{
          accountId: selectedProfile.accountId,
          slug: selectedProfile.slug,
          displayName: selectedProfile.displayName,
          tagline: selectedProfile.tagline,
          description: selectedProfile.description,
          addressStreet: selectedProfile.addressStreet,
          addressCity: selectedProfile.addressCity,
          addressRegion: selectedProfile.addressRegion,
          addressPostalCode: selectedProfile.addressPostalCode,
          addressCountry: selectedProfile.addressCountry,
          imageUpdatedAt: selectedProfile.imageUpdatedAt,
          hasImage: Boolean(selectedProfile.imageBytes),
          fallbackCity: cityByAccount.get(venueAccountId) ?? null,
        }}
        imageUrl={imageUrl}
        active={
          active
            ? { hasPrize: active.hasPrize, prizeDescription: active.prizeDescription }
            : null
        }
        upcoming={upcomingRows.map((u) => ({
          id: u.id,
          eventStartsAt: u.eventStartsAt,
          eventTimezone: u.eventTimezone,
          hasPrize: u.hasPrize,
          prizeDescription: u.prizeDescription,
          runMode: u.runMode,
        }))}
        stats={stats}
        showFollowButton={false}
      />

      {/* (B) Host-only ops — never shown on the public page. */}
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16">
        <SectionHeader
          as="h2"
          eyebrow="Host"
          title="Host-only operations"
          description="Scheduling funnel, full leaderboard, and category health — visible to you and any co-hosts on this venue."
        />

        <Card>
          <CardHeader>
            <CardTitle className="tracking-tight">Session funnel</CardTitle>
            <CardDescription>
              How games flow from scheduling to completed. No-shows are scheduled games whose start
              time passed without launching.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <FunnelCell label="Pending" value={fmtNum(ops.sessionFunnel.pending)} />
            <FunnelCell label="Active" value={fmtNum(ops.sessionFunnel.active)} tone="success" />
            <FunnelCell label="Completed" value={fmtNum(ops.sessionFunnel.completed)} />
            <FunnelCell
              label="No-shows"
              value={fmtNum(ops.sessionFunnel.noShows)}
              tone={ops.sessionFunnel.noShows > 0 ? "warning" : "neutral"}
            />
            <div className="md:col-span-4 text-muted-foreground text-xs">
              Average players per completed game:{" "}
              <span className="text-foreground font-medium tabular-nums">
                {ops.averagePlayersPerGame}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Trophy className="size-4" aria-hidden />
                <CardTitle className="tracking-tight">Top 50 at this venue</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {stats.topPlayers.length === 0 ? (
                <p className="text-muted-foreground text-sm">No players yet.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="grid grid-cols-[2.5rem_1fr_auto_auto] gap-3 border-b pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    <div>#</div>
                    <div>Player</div>
                    <div className="text-right">Games</div>
                    <div className="text-right">Points</div>
                  </div>
                  {stats.topPlayers.map((p, idx) => (
                    <div
                      key={p.username}
                      className="grid grid-cols-[2.5rem_1fr_auto_auto] items-center gap-3 border-b py-2 text-sm last:border-b-0"
                    >
                      <div className="tabular-nums text-muted-foreground">{idx + 1}</div>
                      <Link
                        href={`/u/${encodeURIComponent(p.username)}`}
                        className="truncate font-medium underline-offset-4 hover:underline"
                      >
                        {p.username}
                      </Link>
                      <div className="text-muted-foreground text-right tabular-nums">
                        {fmtNum(p.games)}
                      </div>
                      <div className="text-right tabular-nums font-semibold">
                        {fmtNum(p.totalScore)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="tracking-tight">Hot categories here</CardTitle>
              <CardDescription>Most-answered at this venue.</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.topCategories.length === 0 ? (
                <p className="text-muted-foreground text-sm">Waiting on more play data.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {stats.topCategories.map((c) => (
                    <li key={c.category} className="flex items-center justify-between text-sm">
                      <span className="truncate">{c.category}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {fmtNum(c.attempts)} · {c.accuracy}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function FunnelCell({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="flex flex-col">
        <div className="text-muted-foreground text-[10px] font-semibold uppercase tracking-[0.18em]">
          {label}
        </div>
        <div className="text-2xl font-black tabular-nums">{value}</div>
      </div>
      <StatusPill tone={tone === "success" ? "success" : tone === "warning" ? "warning" : "neutral"}>
        {label}
      </StatusPill>
    </div>
  );
}
