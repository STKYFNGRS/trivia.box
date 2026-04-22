import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { MapPin } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusPill } from "@/components/ui/status-pill";
import { db } from "@/lib/db/client";
import { accounts, sessions, venueProfiles } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Venues",
  description:
    "Every bar and restaurant running house trivia on Trivia.Box. Sort by games played or A–Z and jump into a venue page.",
};

type Sort = "games" | "name";

type VenueRow = {
  slug: string;
  displayName: string;
  tagline: string | null;
  city: string | null;
  hasImage: boolean;
  imageUpdatedAt: Date | null;
  gamesCompleted: number;
  liveOrUpcoming: boolean;
};

async function loadVenues(sort: Sort): Promise<VenueRow[]> {
  // Pull every venue profile + owning account, then decorate with
  // per-venue session counts and a "has-live-or-upcoming" flag. Running
  // this as two round-trips keeps the SQL readable vs. a single window-
  // function join, and venues is a bounded set anyway.
  // Project image presence as a boolean in SQL instead of selecting the raw
  // bytea. This avoids shipping every venue's logo blob to the server on each
  // page render and dodges Neon's legacy-Buffer `parseBytea` path entirely.
  const rows = await db
    .select({
      slug: venueProfiles.slug,
      displayName: venueProfiles.displayName,
      tagline: venueProfiles.tagline,
      city: accounts.city,
      hasImage: sql<boolean>`${venueProfiles.imageBytes} is not null`,
      imageUpdatedAt: venueProfiles.imageUpdatedAt,
      accountId: venueProfiles.accountId,
    })
    .from(venueProfiles)
    .innerJoin(accounts, eq(accounts.id, venueProfiles.accountId));

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.accountId);

  const counts = await db
    .select({
      venueAccountId: sessions.venueAccountId,
      completed: sql<number>`count(*) filter (where ${sessions.status} = 'completed')`.as("completed"),
      live: sql<number>`count(*) filter (where ${sessions.status} in ('active','pending') and ${sessions.listedPublic} = true)`.as("live"),
    })
    .from(sessions)
    .where(and(inArray(sessions.venueAccountId, ids)))
    .groupBy(sessions.venueAccountId);

  const countByVenue = new Map<string, { completed: number; live: number }>();
  for (const c of counts) {
    countByVenue.set(c.venueAccountId, {
      completed: Number(c.completed ?? 0),
      live: Number(c.live ?? 0),
    });
  }

  const decorated: VenueRow[] = rows.map((r) => {
    const c = countByVenue.get(r.accountId) ?? { completed: 0, live: 0 };
    return {
      slug: r.slug,
      displayName: r.displayName,
      tagline: r.tagline,
      city: r.city ?? null,
      hasImage: r.hasImage === true,
      imageUpdatedAt: r.imageUpdatedAt,
      gamesCompleted: c.completed,
      liveOrUpcoming: c.live > 0,
    };
  });

  if (sort === "name") {
    decorated.sort((a, b) => a.displayName.localeCompare(b.displayName));
  } else {
    decorated.sort((a, b) => {
      if (b.gamesCompleted !== a.gamesCompleted) {
        return b.gamesCompleted - a.gamesCompleted;
      }
      return a.displayName.localeCompare(b.displayName);
    });
  }
  // Silence the unused `asc` import in the event we refactor back to SQL sort.
  void asc;
  return decorated;
}

function SortPill({
  label,
  active,
  sort,
}: {
  label: string;
  active: boolean;
  sort: Sort;
}) {
  return (
    <Link
      href={{ pathname: "/venues", query: { sort } }}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] transition-colors",
        active
          ? "bg-white text-black"
          : "border border-white/15 bg-white/[0.04] text-white/80 hover:bg-white/10"
      )}
    >
      {label}
    </Link>
  );
}

export default async function VenuesIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const raw = (await searchParams).sort;
  const sort: Sort = raw === "name" ? "name" : "games";
  const venues = await loadVenues(sort);

  return (
    <MarketingShell>
      <main id="main" className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-12 text-white">
        <SectionHeader
          eyebrow="Directory"
          title="Venues on Trivia.Box"
          description="Every bar and restaurant running house trivia on the platform. Tap any venue to see their upcoming nights, live games, and all-time leaderboard."
          className="text-white [&_*]:text-white [&_p]:text-white/70"
        />

        <div className="flex flex-wrap items-center gap-2">
          <SortPill label="Most games played" active={sort === "games"} sort="games" />
          <SortPill label="A–Z" active={sort === "name"} sort="name" />
        </div>

        {venues.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center text-white/70">
            No venues yet — check back soon.
          </div>
        ) : (
          <ul className="grid gap-3">
            {venues.map((v) => {
              const bust = v.imageUpdatedAt ? new Date(v.imageUpdatedAt).getTime() : 0;
              const imageUrl = v.hasImage ? `/api/venues/${v.slug}/image?v=${bust}` : null;
              return (
                <li key={v.slug}>
                  <Link
                    href={`/v/${v.slug}`}
                    className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition-colors hover:border-white/30 hover:bg-white/[0.08]"
                  >
                    <div className="relative h-16 w-16 flex-none overflow-hidden rounded-xl bg-white/[0.08] ring-1 ring-white/10 sm:h-20 sm:w-20">
                      {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- venue images are served from our own API with cache-busting
                        <img
                          src={imageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-white/50">
                          <MapPin className="h-6 w-6" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-lg font-semibold tracking-tight text-white group-hover:text-white">
                          {v.displayName}
                        </div>
                        {v.liveOrUpcoming ? (
                          <StatusPill tone="success" dot>
                            Upcoming
                          </StatusPill>
                        ) : null}
                      </div>
                      {v.tagline ? (
                        <div className="mt-0.5 truncate text-sm text-white/70">{v.tagline}</div>
                      ) : null}
                      {v.city ? (
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-white/55">
                          <MapPin className="h-3 w-3" />
                          {v.city}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-none flex-col items-end text-right">
                      <div className="text-2xl font-black tabular-nums tracking-tight text-white">
                        {new Intl.NumberFormat().format(v.gamesCompleted)}
                      </div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">
                        games played
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </MarketingShell>
  );
}
