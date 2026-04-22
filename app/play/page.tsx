import { SignedOut } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { CalendarDays, Dice5, Flame, Gamepad2, Library, LogIn, ScanQrCode, Timer } from "lucide-react";
import Link from "next/link";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { NeonCard, type NeonTone } from "@/components/marketing/NeonCard";
import { ViewerLocalTime } from "@/components/play/ViewerLocalTime";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusPill } from "@/components/ui/status-pill";
import { db } from "@/lib/db/client";
import { accounts, sessions, venueProfiles } from "@/lib/db/schema";
import { getDailyStreak } from "@/lib/game/dailyChallenge";
import { getNextHouseGame } from "@/lib/game/houseGames";
import { getPlayerByAccountId } from "@/lib/players";
import { cn } from "@/lib/utils";

/**
 * Shape of a row rendered in the "Coming up" strip. Kept as an explicit alias
 * so the failure path can return `[]` with the same type — the page must not
 * crash end-to-end if the DB query throws (e.g. mid-migration schema drift on
 * `sessions.theme`).
 */
type UpcomingRow = {
  id: string;
  status: string;
  houseGame: boolean;
  runMode: string;
  joinCode: string;
  eventStartsAt: Date;
  eventTimezone: string;
  theme: string | null;
  venueName: string;
  venueCity: string | null;
  venueSlug: string | null;
};

async function loadUpcoming(now: Date): Promise<UpcomingRow[]> {
  try {
    return await db
      .select({
        id: sessions.id,
        status: sessions.status,
        houseGame: sessions.houseGame,
        runMode: sessions.runMode,
        joinCode: sessions.joinCode,
        eventStartsAt: sessions.eventStartsAt,
        eventTimezone: sessions.eventTimezone,
        theme: sessions.theme,
        venueName: accounts.name,
        venueCity: accounts.city,
        venueSlug: venueProfiles.slug,
      })
      .from(sessions)
      .innerJoin(accounts, eq(sessions.venueAccountId, accounts.id))
      .leftJoin(venueProfiles, eq(venueProfiles.accountId, accounts.id))
      .where(
        and(
          eq(sessions.listedPublic, true),
          gte(sessions.eventStartsAt, new Date(now.getTime() - 60 * 60 * 1000)),
          inArray(sessions.status, ["pending", "active"])
        )
      )
      .orderBy(asc(sessions.eventStartsAt))
      .limit(4);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "/play", step: "loadUpcoming" },
    });
    return [];
  }
}

/**
 * Always-on "play" hub.
 *
 * This page is public (see `middleware.ts`) so a visitor with no account can
 * land here from the home page and immediately (a) start a solo run or
 * (b) join a house/venue game. Live / upcoming public games are previewed
 * below so a player can always find *something* to play right now.
 */
export const dynamic = "force-dynamic";

function fmtWhen(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/**
 * Games starting within this window should surface a countdown pill + a
 * prominent "Join now" CTA instead of a generic "View" button. Matches the
 * corresponding threshold on `/games/upcoming` so the two surfaces stay
 * consistent.
 */
const IMMINENT_WINDOW_MS = 5 * 60 * 1000;

function formatImminent(ms: number): string {
  if (ms <= 0) return "Starting now";
  if (ms < 60_000) return `Starts in ${Math.max(1, Math.round(ms / 1000))}s`;
  return `Starts in ${Math.max(1, Math.round(ms / 60_000))}m`;
}

export default async function PlayHubPage() {
  const now = new Date();
  const { userId } = await auth();
  let playerId: string | null = null;
  if (userId) {
    const account = await getAccountByClerkUserId(userId);
    if (account) {
      const player = await getPlayerByAccountId(account.id);
      if (player) playerId = player.id;
    }
  }

  const [houseGame, upcoming, dailyStreak] = await Promise.all([
    getNextHouseGame(now).catch((err) => {
      Sentry.captureException(err, {
        tags: { route: "/play", step: "getNextHouseGame" },
      });
      return null;
    }),
    loadUpcoming(now),
    playerId
      ? getDailyStreak(playerId, now)
      : Promise.resolve({
          current: 0,
          longest: 0,
          playedToday: false,
          lastPlayDate: null,
        }),
  ]);

  return (
    <MarketingShell wide>
      <div className="mx-auto max-w-6xl px-6 py-12">
        <SectionHeader
          as="h1"
          eyebrow="Play"
          title="Pick your mode"
          description="Jump into a solo run, hop into a live game with a code, or wait for the next scheduled game near you."
          className="text-white [&_*]:text-white [&_p]:text-white/70"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/decks"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                )}
              >
                <Library className="mr-1 size-3.5" />
                Browse decks
              </Link>
              <Link
                href="/leaderboards"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                )}
              >
                Leaderboards
              </Link>
            </div>
          }
        />

        {houseGame ? (
          <HouseGameCard
            status={houseGame.status}
            joinCode={houseGame.joinCode.startsWith("pending_") ? null : houseGame.joinCode}
            eventStartsAt={houseGame.eventStartsAt}
          />
        ) : null}

        <DailyChallengeStrip
          streak={dailyStreak}
          className={cn(houseGame ? "mt-4" : "mt-6")}
        />

        <div className={cn("grid gap-4 md:grid-cols-3", houseGame ? "mt-6" : "mt-8")}>
          <PlayModeCard
            tone="magenta"
            href="/play/solo"
            icon={<Dice5 className="size-5" aria-hidden />}
            title="Solo game"
            description="Pick your pace and categories. Server-timed, server-scored. Sign in to earn XP."
            ctaLabel="Start a solo run"
          />
          <PlayModeCard
            tone="cyan"
            href="/join"
            icon={<ScanQrCode className="size-5" aria-hidden />}
            title="Join a game"
            description="Your host shared a 6-letter code. Drop it in and you're at the table."
            ctaLabel="Enter code"
          />
          <PlayModeCard
            tone="lime"
            href="/games/upcoming"
            icon={<Gamepad2 className="size-5" aria-hidden />}
            title="Find an upcoming game"
            description="Browse every public hosted game across the platform. Show up, bring friends."
            ctaLabel="See what's on"
          />
        </div>

        <div className="mt-12">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/70">
              Coming up
            </h2>
            <Link
              href="/games/upcoming"
              className="text-xs text-white/60 underline-offset-4 hover:text-white hover:underline"
            >
              See all
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <Card className="border-white/10 bg-white/[0.04] text-white backdrop-blur">
              <CardContent className="flex flex-col gap-2 p-6">
                <div className="text-sm text-white/80">
                  Nothing scheduled yet — be the first to play a solo run.
                </div>
                <Link
                  href="/play/solo"
                  className={cn(
                    buttonVariants({ size: "sm" }),
                    "w-fit bg-[var(--stage-accent)] text-slate-950 hover:bg-[var(--stage-accent)]/90"
                  )}
                >
                  Start solo
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {upcoming.map((g) => {
                const msUntil = g.eventStartsAt.getTime() - now.getTime();
                const imminent =
                  g.status === "active" ||
                  (msUntil >= 0 && msUntil <= IMMINENT_WINDOW_MS);
                const ctaHref = imminent
                  ? `/join?code=${g.joinCode}`
                  : g.venueSlug
                    ? `/v/${g.venueSlug}`
                    : `/join?code=${g.joinCode}`;
                const ctaLabel = imminent
                  ? g.status === "active"
                    ? "Join live"
                    : "Join now"
                  : "View";
                return (
                  <Card
                    key={g.id}
                    className="border-white/10 bg-white/[0.04] text-white shadow-[var(--shadow-card)] backdrop-blur"
                  >
                    <CardContent className="flex items-center justify-between gap-4 p-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-base font-semibold tracking-tight">
                            {g.venueName}
                          </div>
                          {g.houseGame ? (
                            <StatusPill tone="accent">House</StatusPill>
                          ) : g.status === "active" ? (
                            <StatusPill tone="success" dot pulse>
                              Live
                            </StatusPill>
                          ) : (
                            <StatusPill tone="neutral">Scheduled</StatusPill>
                          )}
                          {g.theme ? (
                            <StatusPill tone="info">{g.theme}</StatusPill>
                          ) : null}
                          {imminent && g.status !== "active" ? (
                            <StatusPill tone="accent" dot pulse>
                              {formatImminent(msUntil)}
                            </StatusPill>
                          ) : null}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-white/60">
                          {/* Venue-hosted games are pinned to the venue's
                              clock ("8pm in San Diego") so out-of-town
                              players know the *local-at-the-pub* start
                              time. House games aren't geographically
                              anchored — the venueCity comes from whatever
                              account happens to be wired up as the house
                              identity — so we suppress it and re-render
                              the time in the viewer's local timezone via
                              ViewerLocalTime. */}
                          {!g.houseGame && g.venueCity
                            ? `${g.venueCity} · `
                            : ""}
                          {g.houseGame ? (
                            <ViewerLocalTime
                              value={g.eventStartsAt.toISOString()}
                              fallback={fmtWhen(g.eventStartsAt, g.eventTimezone)}
                            />
                          ) : (
                            fmtWhen(g.eventStartsAt, g.eventTimezone)
                          )}
                        </div>
                      </div>
                      <Link
                        href={ctaHref}
                        className={cn(
                          imminent
                            ? buttonVariants({ size: "sm" })
                            : buttonVariants({ variant: "outline", size: "sm" }),
                          imminent
                            ? "shrink-0 bg-[var(--stage-accent)] text-slate-950 hover:bg-[var(--stage-accent)]/90"
                            : "shrink-0 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                        )}
                      >
                        {ctaLabel}
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <SignedOut>
          <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex items-start gap-3">
              <LogIn className="mt-0.5 size-5 text-white/60" aria-hidden />
              <div>
                <div className="font-semibold tracking-tight">Want XP, streaks, and a leaderboard rank?</div>
                <p className="mt-1 text-sm text-white/70">
                  Solo runs are playable anonymously, but signing in keeps your best streaks,
                  fastest times, and lifetime points across every game.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href="/sign-in"
                    className={cn(
                      buttonVariants({ size: "sm", variant: "outline" }),
                      "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                    )}
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/sign-up"
                    className={cn(
                      buttonVariants({ size: "sm" }),
                      "bg-[var(--stage-accent)] text-slate-950 hover:bg-[var(--stage-accent)]/90"
                    )}
                  >
                    Create a free account
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </SignedOut>
      </div>
    </MarketingShell>
  );
}

/**
 * "Come back tomorrow" daily-challenge strip rendered just under the
 * house-game banner on `/play`. Shows the player's current streak flame
 * when signed in (and still-active), or a muted "start your streak"
 * invite otherwise. Keeping it as a local component so we can tune copy
 * without touching the shared PlayModeCard.
 */
function DailyChallengeStrip({
  streak,
  className,
}: {
  streak: {
    current: number;
    longest: number;
    playedToday: boolean;
    lastPlayDate: string | null;
  };
  className?: string;
}) {
  const hasStreak = streak.current > 0;
  const ctaLabel = streak.playedToday
    ? "See today's run"
    : hasStreak
      ? "Keep streak alive"
      : "Play daily challenge";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-amber-400/25 bg-gradient-to-br from-amber-500/15 via-white/[0.04] to-white/[0.02] p-5 shadow-[var(--shadow-card)] backdrop-blur",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/40">
            <CalendarDays className="size-5" aria-hidden />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-base font-semibold tracking-tight text-white">
                Daily challenge
              </div>
              {hasStreak ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-200">
                  <Flame className="size-3" aria-hidden />
                  {streak.current} day{streak.current === 1 ? "" : "s"}
                </span>
              ) : null}
              {streak.playedToday ? (
                <StatusPill tone="success">Played today</StatusPill>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-white/70">
              {streak.playedToday
                ? "You finished today's run — come back tomorrow to keep the streak."
                : hasStreak
                  ? "Play today's five questions to keep your flame alive."
                  : "Five quick questions. Same for every player, worldwide. Build a streak."}
            </p>
          </div>
        </div>
        <Link
          href="/play/daily"
          className={cn(
            buttonVariants({ size: "sm" }),
            "bg-amber-400 text-slate-950 hover:bg-amber-300",
          )}
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}

function HouseGameCard({
  status,
  joinCode,
  eventStartsAt,
}: {
  status: string;
  joinCode: string | null;
  eventStartsAt: Date;
}) {
  const now = Date.now();
  const ms = eventStartsAt.getTime() - now;
  const live = status === "active";
  // Route live games through /join so players enter a name / create an anon
  // player row before landing on the play screen (which requires one).
  const href = live && joinCode ? `/join?code=${encodeURIComponent(joinCode)}` : "/play";
  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-[var(--stage-accent)]/30 bg-gradient-to-br from-[var(--stage-accent)]/15 via-white/[0.05] to-white/[0.02] p-6 shadow-[var(--shadow-card)] backdrop-blur">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-[var(--stage-accent)]/20 text-[var(--stage-accent)] ring-1 ring-[var(--stage-accent)]/40">
            <Timer className="size-5" aria-hidden />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-base font-semibold tracking-tight text-white">
                House game
              </div>
              {live ? (
                <StatusPill tone="success" dot pulse>
                  Live now
                </StatusPill>
              ) : (
                <StatusPill tone="accent">Scheduled</StatusPill>
              )}
              <StatusPill tone="neutral">Free</StatusPill>
            </div>
            <p className="mt-1 text-sm text-white/70">
              {live
                ? "A free autopilot round is running right now. Hop in mid-game."
                : ms > 0
                  ? formatCountdown(ms)
                  : "Starting any second..."}
            </p>
          </div>
        </div>
        <Link
          href={href}
          className={cn(
            buttonVariants({ size: "sm" }),
            "bg-[var(--stage-accent)] text-slate-950 hover:bg-[var(--stage-accent)]/90"
          )}
        >
          {live ? "Join live" : "Wait on the lobby"}
        </Link>
      </div>
    </div>
  );
}

function formatCountdown(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 1) return "Starts in under a minute.";
  if (minutes === 1) return "Starts in ~1 minute.";
  return `Starts in ~${minutes} minutes.`;
}

function PlayModeCard({
  tone = "magenta",
  href,
  icon,
  title,
  description,
  ctaLabel,
}: {
  tone?: NeonTone;
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  ctaLabel: string;
}) {
  return (
    <NeonCard tone={tone} className="flex flex-col gap-4 p-6">
      <div
        className="flex size-10 items-center justify-center rounded-lg"
        style={{
          background: `color-mix(in oklab, var(--neon-${tone}) 20%, transparent)`,
          color: `var(--neon-${tone})`,
          boxShadow: `inset 0 0 0 1px color-mix(in oklab, var(--neon-${tone}) 45%, transparent)`,
        }}
      >
        {icon}
      </div>
      <div>
        <div className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-white">
          {title}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-white/70">
          {description}
        </p>
      </div>
      <div className="mt-auto">
        <Link
          href={href}
          className={cn(
            buttonVariants({ size: "sm" }),
            "bg-white text-slate-950 hover:bg-white/90"
          )}
        >
          {ctaLabel}
        </Link>
      </div>
    </NeonCard>
  );
}
