import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getVenueStats } from "@/lib/stats/aggregate";
import { getVenueProfileBySlug } from "@/lib/venue";

export const dynamic = "force-dynamic";

/**
 * Venue top-players embed.
 *
 * Minimal chrome, self-contained styling — intended to be iframed onto
 * the venue's own website to keep the marketing funnel pointing back at
 * `/v/<slug>`. Transparent background so the host's page theme shows
 * through and the widget feels native.
 *
 * `noindex, nofollow` because the same data is already public at
 * `/v/<slug>` and we don't want duplicate-content penalties on the
 * plain embed layout.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

function fmt(n: number): string {
  return new Intl.NumberFormat().format(n);
}

export default async function VenueLeaderboardEmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ limit?: string; theme?: string }>;
}) {
  const { slug } = await params;
  const { limit: rawLimit, theme: rawTheme } = await searchParams;

  const venue = await getVenueProfileBySlug(slug);
  if (!venue) notFound();
  const stats = await getVenueStats(venue.accountId);
  if (!stats) notFound();

  // `?limit=N` clamps between 3 and 25 so hosts can fit the widget to
  // their sidebar. Default 10.
  const requested = Number.parseInt(rawLimit ?? "10", 10);
  const limit = Number.isFinite(requested)
    ? Math.min(25, Math.max(3, requested))
    : 10;
  const rows = stats.topPlayers.slice(0, limit);
  // `?theme=light` gives dark text on transparent — default is light text
  // on transparent for use on dark venue sites.
  const light = rawTheme === "light";

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://trivia.box");

  return (
    <main
      className={
        "mx-auto flex w-full max-w-md flex-col gap-3 p-4 text-sm " +
        (light ? "text-slate-900" : "text-white")
      }
      style={{ background: "transparent" }}
    >
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div
            className={
              "text-[10px] font-semibold uppercase tracking-[0.22em] " +
              (light ? "text-slate-500" : "text-white/60")
            }
          >
            Top players
          </div>
          <div className="truncate text-base font-semibold tracking-tight">
            {venue.displayName}
          </div>
        </div>
        <a
          href={`${siteUrl}/v/${encodeURIComponent(venue.slug)}`}
          target="_top"
          rel="noopener"
          className={
            "shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] underline-offset-4 hover:underline " +
            (light ? "text-slate-600" : "text-white/70")
          }
        >
          Powered by Trivia.Box
        </a>
      </header>

      {rows.length === 0 ? (
        <div
          className={
            "rounded-xl p-4 text-xs " +
            (light
              ? "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
              : "bg-white/5 text-white/70 ring-1 ring-white/10")
          }
        >
          No scores yet. Play a game to land on the board.
        </div>
      ) : (
        <ol
          className={
            "flex flex-col rounded-xl p-2 " +
            (light ? "bg-white/70 ring-1 ring-slate-200" : "bg-white/[0.04] ring-1 ring-white/10")
          }
        >
          {rows.map((row, idx) => (
            <li
              key={row.username}
              className={
                "grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 " +
                (idx < rows.length - 1
                  ? light
                    ? "border-b border-slate-200/70"
                    : "border-b border-white/5"
                  : "")
              }
            >
              <span
                className={
                  "inline-flex size-6 items-center justify-center rounded-full text-[11px] font-bold tabular-nums " +
                  (idx === 0
                    ? "bg-amber-400/90 text-slate-950"
                    : idx === 1
                      ? "bg-slate-200 text-slate-900"
                      : idx === 2
                        ? "bg-amber-700/70 text-white"
                        : light
                          ? "bg-slate-100 text-slate-600"
                          : "bg-white/5 text-white/60")
                }
              >
                {idx + 1}
              </span>
              <span className="truncate font-medium">{row.username}</span>
              <span className="text-right font-semibold tabular-nums">
                {fmt(row.totalScore)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
