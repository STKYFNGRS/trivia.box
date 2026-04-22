import * as Sentry from "@sentry/nextjs";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { CalendarClock, Sparkles } from "lucide-react";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import {
  ViewerLocalDateParts,
  ViewerLocalTime,
} from "@/components/play/ViewerLocalTime";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusPill } from "@/components/ui/status-pill";
import { db } from "@/lib/db/client";
import { accounts, sessions, venueProfiles } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

type UpcomingGameRow = {
  sessionId: string;
  status: string;
  runMode: string;
  venueName: string;
  venueCity: string | null;
  venueSlug: string | null;
  eventStartsAt: Date;
  eventTimezone: string;
  hasPrize: boolean;
  prizeDescription: string | null;
  theme: string | null;
  houseGame: boolean;
};

async function loadUpcomingGames(now: Date): Promise<UpcomingGameRow[]> {
  try {
    return await db
      .select({
        sessionId: sessions.id,
        status: sessions.status,
        runMode: sessions.runMode,
        venueName: accounts.name,
        venueCity: accounts.city,
        venueSlug: venueProfiles.slug,
        eventStartsAt: sessions.eventStartsAt,
        eventTimezone: sessions.eventTimezone,
        hasPrize: sessions.hasPrize,
        prizeDescription: sessions.prizeDescription,
        theme: sessions.theme,
        houseGame: sessions.houseGame,
      })
      .from(sessions)
      .innerJoin(accounts, eq(sessions.venueAccountId, accounts.id))
      .leftJoin(venueProfiles, eq(venueProfiles.accountId, accounts.id))
      .where(
        and(
          eq(sessions.listedPublic, true),
          gte(sessions.eventStartsAt, now),
          inArray(sessions.status, ["pending", "active"])
        )
      )
      .orderBy(asc(sessions.eventStartsAt))
      .limit(100);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "/games/upcoming", step: "loadUpcomingGames" },
    });
    return [];
  }
}

function formatLocal(iso: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(iso);
  } catch {
    return iso.toISOString();
  }
}

function formatDateParts(iso: Date, timeZone: string) {
  const opts: Intl.DateTimeFormatOptions = { timeZone };
  try {
    return {
      weekday: new Intl.DateTimeFormat(undefined, { ...opts, weekday: "short" }).format(iso),
      day: new Intl.DateTimeFormat(undefined, { ...opts, day: "2-digit" }).format(iso),
      month: new Intl.DateTimeFormat(undefined, { ...opts, month: "short" }).format(iso),
    };
  } catch {
    return { weekday: "", day: "—", month: "—" };
  }
}

/** ≤ 5-minute threshold for switching to a "Starts in / Join now" state. */
const IMMINENT_WINDOW_MS = 5 * 60 * 1000;

function formatImminent(ms: number): string {
  if (ms <= 0) return "Starting now";
  if (ms < 60_000) return `Starts in ${Math.max(1, Math.round(ms / 1000))}s`;
  return `Starts in ${Math.max(1, Math.round(ms / 60_000))}m`;
}

export default async function UpcomingGamesPage() {
  const now = new Date();
  const games = await loadUpcomingGames(now);

  return (
    <MarketingShell wide>
      <div className="relative mx-auto max-w-5xl px-6 py-12">
        <SectionHeader
          as="h1"
          eyebrow="Public schedule"
          title="Upcoming trivia"
          description="Venues and hosts that listed a public start time. Join with the code the host shares on-site."
          className="text-white [&_*]:text-white [&_p]:text-white/70"
          actions={
            <div className="flex items-center gap-2">
              <Link
                href="/join"
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "bg-[var(--stage-accent)] text-slate-950 hover:bg-[var(--stage-accent)]/90"
                )}
              >
                Join with code
              </Link>
            </div>
          }
        />

        <div className="mt-8">
          {games.length === 0 ? (
            <EmptyState
              icon={<CalendarClock className="h-5 w-5" />}
              title="Nothing on the schedule yet"
              description="Come back soon — hosts are adding new nights all the time."
              className="border-white/10 bg-white/[0.03] text-white [&>div>div:first-child]:text-white"
              actions={
                <Link
                  href="/join"
                  className={cn(
                    buttonVariants({ size: "sm" }),
                    "bg-[var(--stage-accent)] text-slate-950 hover:bg-[var(--stage-accent)]/90"
                  )}
                >
                  Have a code? Join now
                </Link>
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {games.map((g) => {
                const parts = formatDateParts(g.eventStartsAt, g.eventTimezone);
                const msUntil = g.eventStartsAt.getTime() - now.getTime();
                const imminent =
                  g.status === "active" ||
                  (msUntil >= 0 && msUntil <= IMMINENT_WINDOW_MS);
                const href = imminent
                  ? "/join"
                  : g.venueSlug
                    ? `/v/${g.venueSlug}`
                    : "/join";
                const cta = imminent
                  ? g.status === "active"
                    ? "Join live"
                    : "Join now"
                  : "View venue";
                return (
                  <Card
                    key={g.sessionId}
                    className="border-white/10 bg-white/[0.04] text-white shadow-[var(--shadow-card)] backdrop-blur"
                  >
                    <CardContent className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center">
                      <div className="flex w-24 shrink-0 flex-col items-center justify-center rounded-xl bg-white/[0.06] px-3 py-3 text-center ring-1 ring-white/10">
                        {g.houseGame ? (
                          // House games aren't geographically anchored, so
                          // render the calendar tile in the viewer's local
                          // timezone rather than the session's stored
                          // "UTC" marker — otherwise a 10am Pacific start
                          // shows up on the wrong day for viewers west of
                          // the date line.
                          <ViewerLocalDateParts
                            value={g.eventStartsAt.toISOString()}
                            fallbackWeekday={parts.weekday}
                            fallbackDay={parts.day}
                            fallbackMonth={parts.month}
                          />
                        ) : (
                          <>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">
                              {parts.weekday}
                            </div>
                            <div className="text-2xl font-black tabular-nums tracking-tight">
                              {parts.day}
                            </div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                              {parts.month}
                            </div>
                          </>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-base font-semibold tracking-tight">
                            {g.venueName}
                          </div>
                          {g.status === "active" ? (
                            <StatusPill tone="success" dot pulse>
                              Live
                            </StatusPill>
                          ) : (
                            <StatusPill tone="neutral">Scheduled</StatusPill>
                          )}
                          <StatusPill tone={g.runMode === "autopilot" ? "info" : "accent"}>
                            {g.runMode === "autopilot" ? "Autopilot" : "Hosted"}
                          </StatusPill>
                          {g.houseGame ? (
                            <StatusPill tone="accent">House</StatusPill>
                          ) : null}
                          {g.theme ? (
                            <StatusPill tone="info">{g.theme}</StatusPill>
                          ) : null}
                          {imminent && g.status !== "active" ? (
                            <StatusPill tone="accent" dot pulse>
                              {formatImminent(msUntil)}
                            </StatusPill>
                          ) : null}
                        </div>
                        <div className="mt-1 text-sm tabular-nums text-white/70">
                          {!g.houseGame && g.venueCity ? (
                            <span className="text-white/60">{g.venueCity} · </span>
                          ) : null}
                          {g.houseGame ? (
                            <ViewerLocalTime
                              value={g.eventStartsAt.toISOString()}
                              fallback={formatLocal(g.eventStartsAt, g.eventTimezone)}
                              format="long"
                            />
                          ) : (
                            formatLocal(g.eventStartsAt, g.eventTimezone)
                          )}
                        </div>
                        {g.hasPrize && g.prizeDescription ? (
                          <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-200">
                            <Sparkles className="h-3.5 w-3.5" />
                            {g.prizeDescription}
                          </div>
                        ) : null}
                      </div>
                      <Link
                        href={href}
                        className={cn(
                          imminent
                            ? buttonVariants({ size: "sm" })
                            : buttonVariants({ variant: "outline", size: "sm" }),
                          imminent
                            ? "w-full bg-[var(--stage-accent)] text-slate-950 hover:bg-[var(--stage-accent)]/90 sm:w-auto"
                            : "w-full border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white sm:w-auto"
                        )}
                      >
                        {cta}
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </MarketingShell>
  );
}
