import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShareRecapButton } from "@/components/share/ShareRecapButton";
import { resolveSiteUrl } from "@/lib/email/siteUrl";
import { loadPublicSessionRecap } from "@/lib/share/recapData";

export const dynamic = "force-dynamic";

type Params = { id: string };

/**
 * Public post-game recap for a multiplayer session.
 *
 * This is the URL we hand to players after `FinalStandings` so they
 * can share their run on socials / group chats without leaking any
 * credentials. Only completed sessions render; everything else 404s.
 *
 * The heavy lifting lives in `lib/share/recapData.ts` so the page
 * and the OG image (see sibling `opengraph-image.tsx`) share the
 * same authoritative query.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const recap = await loadPublicSessionRecap(id);
  if (!recap) return { title: "Recap — Trivia.Box" };
  const winner = recap.top[0];
  const title = winner
    ? `${winner.username} won — ${recap.venueDisplayName} · Trivia.Box`
    : `${recap.venueDisplayName} trivia — Trivia.Box`;
  const description = winner
    ? `${recap.totalPlayers} players, top score ${winner.score.toLocaleString()}.`
    : `Final standings from ${recap.venueDisplayName}.`;
  const canonical = `${resolveSiteUrl()}/r/session/${id}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function SessionRecapPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const recap = await loadPublicSessionRecap(id);
  if (!recap) notFound();

  const shareUrl = `${resolveSiteUrl()}/r/session/${id}`;
  const winner = recap.top[0] ?? null;
  const headlineVenue = recap.venueDisplayName;
  const startLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(recap.eventStartsAt);

  return (
    <div className="min-h-screen bg-[var(--stage-bg)] text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <header className="flex flex-col gap-3 text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.32em] text-white/60">
            {recap.houseGame ? "House game recap" : "Trivia recap"}
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            {winner
              ? `${winner.username} topped ${headlineVenue}`
              : `${headlineVenue} trivia`}
          </h1>
          <p className="text-sm text-white/70">
            {recap.theme ? `${recap.theme} · ` : ""}
            {startLabel} · {recap.totalPlayers}{" "}
            {recap.totalPlayers === 1 ? "player" : "players"}
          </p>
        </header>

        {recap.top.length > 0 ? (
          <div className="overflow-hidden rounded-2xl bg-[var(--stage-glass)] ring-1 ring-white/10 shadow-[var(--shadow-card)] backdrop-blur-xl">
            <ol className="divide-y divide-white/5">
              {recap.top.map((entry, idx) => {
                const rank = idx + 1;
                const isPodium = rank <= 3;
                const tone =
                  rank === 1
                    ? "bg-amber-400/20 ring-amber-300/60 text-amber-200"
                    : rank === 2
                      ? "bg-slate-400/20 ring-slate-300/60 text-slate-100"
                      : rank === 3
                        ? "bg-orange-500/20 ring-orange-300/60 text-orange-200"
                        : "bg-white/5 ring-white/15 text-white/70";
                return (
                  <li
                    key={entry.playerId}
                    className="flex items-center gap-3 px-4 py-3 text-sm"
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold tabular-nums ring-1 ${tone}`}
                    >
                      {rank}
                    </span>
                    <span className="flex-1 truncate font-semibold text-white">
                      {entry.username}
                      {isPodium ? null : null}
                    </span>
                    <span className="shrink-0 font-mono text-sm tabular-nums text-white">
                      {entry.score.toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <div className="rounded-2xl bg-[var(--stage-glass)] p-6 text-center text-sm text-white/60 ring-1 ring-white/10 backdrop-blur-xl">
            No scores were recorded for this game.
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/play"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--stage-accent)] px-4 py-2 text-sm font-semibold text-black ring-1 ring-[var(--stage-accent)]/50 transition hover:brightness-110"
          >
            Play now
          </Link>
          {recap.venueSlug ? (
            <Link
              href={`/venues/${encodeURIComponent(recap.venueSlug)}`}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/15"
            >
              About {headlineVenue}
            </Link>
          ) : null}
          <ShareRecapButton
            url={shareUrl}
            title={
              winner
                ? `${winner.username} won at ${headlineVenue}`
                : `${headlineVenue} trivia recap`
            }
            text="Check out the final standings on Trivia.Box."
          />
        </div>
      </div>
    </div>
  );
}
