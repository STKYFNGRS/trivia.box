import { eq } from "drizzle-orm";
import { ArrowLeft, CalendarClock, Gift, MapPin, Pencil, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { buttonVariants } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { getCurrentAccount } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { getVenueProfileBySlug } from "@/lib/venue";

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; sessionId: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const venue = await getVenueProfileBySlug(slug);
  if (!venue) return { title: "Event" };
  return {
    title: `${venue.displayName} trivia night`,
    description: `Upcoming trivia at ${venue.displayName}. See prize details, host notes, and the join code at the venue.`,
  };
}

export default async function VenueEventDetailPage({
  params,
}: {
  params: Promise<{ slug: string; sessionId: string }>;
}) {
  const { slug, sessionId } = await params;
  const venue = await getVenueProfileBySlug(slug);
  if (!venue) notFound();

  const [session] = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      runMode: sessions.runMode,
      eventStartsAt: sessions.eventStartsAt,
      eventTimezone: sessions.eventTimezone,
      theme: sessions.theme,
      hasPrize: sessions.hasPrize,
      prizeDescription: sessions.prizeDescription,
      prizeTopN: sessions.prizeTopN,
      prizeLabels: sessions.prizeLabels,
      prizeInstructions: sessions.prizeInstructions,
      prizeExpiresAt: sessions.prizeExpiresAt,
      hostNotes: sessions.hostNotes,
      venueAccountId: sessions.venueAccountId,
      listedPublic: sessions.listedPublic,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId));

  if (!session || session.venueAccountId !== venue.accountId) notFound();
  if (!session.listedPublic && session.status === "pending") notFound();

  const viewer = await getCurrentAccount();
  const isOwner = viewer?.id === venue.accountId;
  const prizeLabels =
    session.prizeLabels && Array.isArray(session.prizeLabels)
      ? (session.prizeLabels as string[])
      : [];
  const topN = session.prizeTopN ?? prizeLabels.length ?? 1;

  return (
    <MarketingShell>
      <main
        id="main"
        className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-12 text-white"
      >
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/v/${venue.slug}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white/80 hover:bg-white/10"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to {venue.displayName}
          </Link>
          {isOwner ? (
            <Link
              href={`/dashboard/games/${session.id}/edit`}
              className={cn(
                buttonVariants({ size: "sm" }),
                "ml-auto gap-1.5 text-[0.8rem] font-bold uppercase tracking-[0.14em]"
              )}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit event
            </Link>
          ) : null}
        </div>

        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80 ring-1 ring-white/15">
              <MapPin className="h-3 w-3" />
              {venue.displayName}
            </span>
            <StatusPill tone={session.runMode === "autopilot" ? "info" : "accent"}>
              {session.runMode === "autopilot" ? "Autopilot" : "Hosted"}
            </StatusPill>
            {session.status === "active" ? (
              <StatusPill tone="success" dot pulse>
                Live now
              </StatusPill>
            ) : session.status === "completed" ? (
              <StatusPill tone="neutral">Completed</StatusPill>
            ) : (
              <StatusPill tone="neutral">Upcoming</StatusPill>
            )}
          </div>
          <h1 className="text-3xl font-black leading-[1.1] tracking-tight sm:text-4xl">
            {session.theme
              ? `${session.theme} trivia`
              : `${venue.displayName} trivia night`}
          </h1>
          <div className="flex items-center gap-2 text-white/75">
            <CalendarClock className="h-4 w-4" />
            <span className="tabular-nums">
              {formatEventTime(new Date(session.eventStartsAt), session.eventTimezone)}
            </span>
          </div>
        </header>

        {session.hostNotes ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
              Notes from the host
            </div>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-white/85">
              {session.hostNotes}
            </p>
          </section>
        ) : null}

        {session.hasPrize ? (
          <section className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-6 text-amber-50">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/80">
              <Gift className="h-3.5 w-3.5" />
              Prize
            </div>
            <div className="mt-2 text-xl font-semibold tracking-tight">
              {session.prizeDescription ?? "Prizes on offer for top finishers."}
            </div>
            {topN > 0 ? (
              <div className="mt-1 text-sm text-amber-100/90">
                Top {topN} finisher{topN === 1 ? "" : "s"} win.
              </div>
            ) : null}
            {prizeLabels.length > 0 ? (
              <ol className="mt-3 flex flex-col gap-1.5 text-sm">
                {prizeLabels.slice(0, topN).map((label, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-md bg-amber-400/10 px-3 py-1.5 ring-1 ring-amber-400/30"
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-amber-950">
                      {i + 1}
                    </span>
                    <span className="font-medium">{label}</span>
                  </li>
                ))}
              </ol>
            ) : null}
            {session.prizeInstructions ? (
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-amber-100/85">
                {session.prizeInstructions}
              </p>
            ) : null}
            {session.prizeExpiresAt ? (
              <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-amber-200/80">
                <Sparkles className="h-3.5 w-3.5" />
                Prize claims expire{" "}
                {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                  new Date(session.prizeExpiresAt)
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
            How to play
          </div>
          <p className="mt-2 text-sm leading-relaxed text-white/80">
            Show up at {venue.displayName} for game time. The host shares a
            join code on screen — enter it at{" "}
            <Link href="/join" className="underline hover:text-white">
              trivia.box/join
            </Link>{" "}
            from your phone. No app install, no account required.
          </p>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/v/${venue.slug}`}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
            )}
          >
            Back to venue
          </Link>
        </div>
      </main>
    </MarketingShell>
  );
}
