import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddFriendButton } from "@/components/social/AddFriendButton";
import { XpLevelBadge } from "@/components/player/XpLevelBadge";
import { PlayerStatCards } from "@/components/player/PlayerStatCards";
import { TrophyWall } from "@/components/player/TrophyWall";
import { PrizeWall } from "@/components/player/PrizeWall";
import { RecentGamesTable } from "@/components/player/RecentGamesTable";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getPublicPlayerStats } from "@/lib/game/publicPlayerStats";
import { xpToLevel } from "@/lib/xp";
import { formatMs, formatRank } from "@/lib/format";

export async function generateMetadata(props: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await props.params;
  const stats = await getPublicPlayerStats(username);
  if (!stats) {
    // Let the template do its thing so the tab reads "username · trivia.box".
    return { title: username };
  }
  const description = `Level ${xpToLevel(stats.rollup.totalXp).level} · ${stats.rollup.totalPoints.toLocaleString()} lifetime points · ${stats.achievements.length} trophies on trivia.box`;
  // Root layout's `title.template = "%s · trivia.box"` appends the suffix,
  // so we return just the username here.
  return {
    title: stats.player.username,
    description,
    openGraph: {
      title: `${stats.player.username} · trivia.box`,
      description,
      type: "profile",
    },
    twitter: {
      card: "summary_large_image",
      title: `${stats.player.username} · trivia.box`,
      description,
    },
  };
}

export default async function PublicPlayerPage(props: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await props.params;
  const stats = await getPublicPlayerStats(username);
  if (!stats) notFound();

  const { rollup } = stats;
  const bestFinish = formatRank(rollup.bestRank);
  const fastest = formatMs(rollup.fastestCorrectMs);
  const memberSince = stats.player.createdAt.toISOString().slice(0, 7); // YYYY-MM

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10 md:py-14">
      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-2xl ring-1 ring-white/10"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in oklab, var(--neon-magenta) 18%, var(--stage-bg)) 0%, color-mix(in oklab, var(--neon-violet) 15%, var(--stage-bg)) 55%, var(--stage-bg) 100%)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 80% -10%, color-mix(in oklab, var(--neon-cyan) 18%, transparent), transparent 55%), radial-gradient(ellipse at 0% 120%, color-mix(in oklab, var(--neon-magenta) 22%, transparent), transparent 55%)",
          }}
        />
        <div className="relative grid gap-8 p-6 md:grid-cols-[1.2fr,1fr] md:p-10">
          <div className="flex flex-col justify-between gap-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">
                Trivia.Box player
              </div>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                {stats.player.username}
              </h1>
              <p className="mt-3 max-w-lg text-sm text-white/70">
                Public profile · member since{" "}
                <span className="tabular-nums">{memberSince}</span>. Everything
                below reflects live stats across every venue they&apos;ve played.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <XpLevelBadge xp={rollup.totalXp} />
                {rollup.dailyStreak > 0 ? (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300"
                    title="Active daily challenge streak"
                  >
                    {/* inline SVG to avoid new lucide import here */}
                    <svg
                      viewBox="0 0 24 24"
                      width="12"
                      height="12"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d="M12 2c0 3 3 5 3 8a3 3 0 1 1-6 0c0-2 1-4 3-8zm-2 12a5 5 0 1 0 10 0c0-3-2-5-4-7 1 3-1 4-2 4-1 0-2-1-2-3-2 2-2 4-2 6z" />
                    </svg>
                    Daily streak {rollup.dailyStreak}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/play"
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "h-9 px-4 text-[0.8rem] font-bold uppercase tracking-[0.14em] text-[color:var(--primary-foreground)]"
                )}
                style={{
                  background:
                    "linear-gradient(135deg, var(--neon-magenta), var(--neon-violet))",
                  boxShadow:
                    "0 0 0 1px color-mix(in oklab, var(--neon-magenta) 45%, transparent), 0 8px 24px -8px color-mix(in oklab, var(--neon-magenta) 70%, transparent)",
                }}
              >
                Play a game
              </Link>
              <Link
                href="/leaderboards"
                className={cn(
                  buttonVariants({ variant: "secondary", size: "sm" }),
                  "h-9 px-4 text-[0.8rem] font-semibold uppercase tracking-[0.14em]"
                )}
              >
                Leaderboards
              </Link>
              <AddFriendButton
                targetPlayerId={stats.player.id}
                targetLabel={stats.player.username}
              />
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-5 self-start">
            <HeroStat
              label="Lifetime score"
              value={rollup.totalPoints.toLocaleString()}
              big
            />
            <HeroStat
              label="Games played"
              value={rollup.totalGames.toLocaleString()}
              big
            />
            <HeroStat label="Trophies" value={stats.achievements.length.toLocaleString()} />
            <HeroStat label="Venues" value={stats.venuesVisited.toLocaleString()} />
            {bestFinish ? <HeroStat label="Best finish" value={bestFinish} /> : null}
            {fastest ? <HeroStat label="Fastest correct" value={fastest} /> : null}
            {rollup.longestStreak > 0 ? (
              <HeroStat
                label="Longest streak"
                value={rollup.longestStreak.toLocaleString()}
              />
            ) : null}
            {stats.accuracy > 0 ? (
              <HeroStat label="Accuracy" value={`${stats.accuracy}%`} />
            ) : null}
          </dl>
        </div>
      </section>

      {/* Stat cards (shared with owner dashboard) */}
      <PlayerStatCards
        stats={{
          totalGames: rollup.totalGames,
          totalCorrect: rollup.totalCorrect,
          totalPoints: rollup.totalPoints,
          accuracy: stats.accuracy,
          bestCategory: stats.bestCategory,
          venuesVisited: stats.venuesVisited,
          longestStreak: rollup.longestStreak,
          fastestCorrectMs: rollup.fastestCorrectMs,
          bestRank: rollup.bestRank,
          wins: stats.wins,
          second: stats.second,
          third: stats.third,
        }}
      />

      <TrophyWall items={stats.achievements} />

      <PrizeWall items={stats.prizes} />

      <RecentGamesTable
        rows={stats.recentGames}
        title="Recent games"
        description={`Last ${stats.recentGames.length || ""} sessions played.`.trim()}
      />

      {/* Footer CTA row — keeps anonymous visitors from dead-ending on the
          profile. Auth-aware nav in the shell handles the signed-in case. */}
      <section
        className="relative overflow-hidden rounded-2xl p-6 ring-1 ring-white/10 sm:p-8"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in oklab, var(--neon-violet) 14%, var(--stage-bg)), color-mix(in oklab, var(--neon-cyan) 10%, var(--stage-bg)))",
        }}
      >
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Think you can beat {stats.player.username}?
            </h2>
            <p className="mt-2 max-w-xl text-sm text-white/70">
              Join a free house game or host your own trivia night in minutes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/play"
              className={cn(
                buttonVariants({ size: "sm" }),
                "h-9 px-4 text-[0.8rem] font-bold uppercase tracking-[0.14em] text-[color:var(--primary-foreground)]"
              )}
              style={{
                background:
                  "linear-gradient(135deg, var(--neon-magenta), var(--neon-violet))",
                boxShadow:
                  "0 0 0 1px color-mix(in oklab, var(--neon-magenta) 45%, transparent), 0 8px 24px -8px color-mix(in oklab, var(--neon-magenta) 70%, transparent)",
              }}
            >
              Play a house game
            </Link>
            <Link
              href="/sign-up"
              className={cn(
                buttonVariants({ variant: "secondary", size: "sm" }),
                "h-9 px-4 text-[0.8rem] font-semibold uppercase tracking-[0.14em]"
              )}
            >
              Host your own trivia night
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function HeroStat({
  label,
  value,
  big = false,
}: {
  label: string;
  value: string;
  big?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-[0.14em] text-white/55">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 font-semibold tabular-nums tracking-tight text-white",
          big ? "text-3xl sm:text-4xl" : "text-xl",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
