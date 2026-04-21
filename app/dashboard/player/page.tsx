import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, Flame, Gift, Medal, Sparkles, Trophy, Users } from "lucide-react";
import { getCurrentAccount } from "@/lib/accounts";
import { BecomeHostCard } from "@/components/billing/BecomeHostCard";
import { XpLevelBadge } from "@/components/player/XpLevelBadge";
import { PlayerStatCards } from "@/components/player/PlayerStatCards";
import { TrophyWall } from "@/components/player/TrophyWall";
import { RecentGamesTable } from "@/components/player/RecentGamesTable";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { listPlayerClaims } from "@/lib/prizes";
import { cn } from "@/lib/utils";
import { getDailyStreak } from "@/lib/game/dailyChallenge";
import { getPublicPlayerStats } from "@/lib/game/publicPlayerStats";
import { getPlayerByAccountId } from "@/lib/players";
import { getScopedPlayerRank } from "@/lib/stats/aggregate";
import { xpToLevel } from "@/lib/xp";

function formatMs(ms: number | null | undefined): string | null {
  if (ms == null) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatRank(rank: number | null | undefined): string | null {
  if (rank == null) return null;
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `${rank}th`;
}

export default async function PlayerDashboardPage() {
  const account = await getCurrentAccount();
  if (!account) {
    redirect("/sign-in");
  }

  const player = await getPlayerByAccountId(account.id);
  if (!player) {
    redirect("/sign-in");
  }

  const stats = await getPublicPlayerStats(player.username);
  if (!stats) {
    redirect("/dashboard");
  }

  // Codes are surfaced *only* on the owner dashboard, so we fetch claims
  // separately here. The public profile uses `stats.prizes` (no codes).
  const [claims, dailyStreak, weeklyRank] = await Promise.all([
    listPlayerClaims(player.id, { status: "all" }),
    getDailyStreak(player.id),
    // Weekly is the most motivating window — "You're #14 this week" is a
    // sharper retention hook than "#2,143 all-time".
    getScopedPlayerRank("week", player.id),
  ]);

  const { rollup } = stats;
  const totalPoints = rollup.totalPoints;
  const totalXp = rollup.totalXp;
  const gamesPlayed = rollup.totalGames;
  const longestStreak = rollup.longestStreak;
  const bestFinish = formatRank(rollup.bestRank);
  const fastest = formatMs(rollup.fastestCorrectMs);

  return (
    <div className="flex flex-col gap-8">
      <section className="relative overflow-hidden rounded-2xl bg-card ring-1 ring-border shadow-[var(--shadow-card)]">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1 bg-[var(--stage-accent)]/60"
        />
        <div className="absolute inset-0 bg-[var(--stage-accent)]/5" aria-hidden />
        <div className="relative grid gap-8 p-6 md:grid-cols-[1.2fr,1fr] md:p-8">
          <div className="flex flex-col justify-between gap-6">
            <div>
              <div className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.18em]">
                Player
              </div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
                {stats.player.username}
              </h1>
              <p className="text-muted-foreground mt-2 max-w-md text-sm">
                Track your play, trophies, and venues. Join live games with a six-letter code.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <XpLevelBadge xp={totalXp} />
                {(() => {
                  const { level, needed, current } = xpToLevel(totalXp);
                  const xpToNext = Math.max(0, needed - current);
                  return (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--neon-cyan)_30%,transparent)] bg-[color-mix(in_oklab,var(--neon-cyan)_8%,transparent)] px-2.5 py-1 text-xs font-semibold text-[var(--neon-cyan)]"
                      title={`Earn ${xpToNext.toLocaleString()} more XP to reach Lv ${level + 1}`}
                    >
                      <Sparkles className="size-3" aria-hidden />
                      {xpToNext.toLocaleString()} XP to Lv {level + 1}
                    </span>
                  );
                })()}
                {dailyStreak.current > 0 ? (
                  <Link
                    href="/play/daily"
                    className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20"
                    title="Your daily challenge streak"
                  >
                    <Flame className="size-3" aria-hidden />
                    Daily streak {dailyStreak.current}
                  </Link>
                ) : (
                  <Link
                    href="/play/daily"
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
                    title="Play today's daily challenge"
                  >
                    <Flame className="size-3" aria-hidden />
                    Start a daily streak
                  </Link>
                )}
                {longestStreak > 0 ? (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white/70"
                    title="Your longest in-session answer streak"
                  >
                    Best answer streak {longestStreak}
                  </span>
                ) : null}
                {weeklyRank ? (
                  <Link
                    href="/leaderboards?scope=week"
                    className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--neon-magenta)_30%,transparent)] bg-[color-mix(in_oklab,var(--neon-magenta)_8%,transparent)] px-2.5 py-1 text-xs font-semibold text-[var(--neon-magenta)] transition hover:bg-[color-mix(in_oklab,var(--neon-magenta)_15%,transparent)]"
                    title={`You're ranked #${weeklyRank.rank} this week with ${weeklyRank.totalPoints.toLocaleString()} pts`}
                  >
                    <Medal className="size-3" aria-hidden />
                    #{weeklyRank.rank.toLocaleString()} this week
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/join" className={cn(buttonVariants())}>
                Join a game
              </Link>
              <Link
                href={`/u/${encodeURIComponent(player.username)}`}
                className={cn(buttonVariants({ variant: "secondary" }))}
              >
                View public profile
              </Link>
              <Link
                href="/dashboard/player/achievements"
                className={cn(buttonVariants({ variant: "ghost" }))}
                title="Browse all achievements and progress"
              >
                <Trophy className="size-4" aria-hidden />
                Achievements
              </Link>
              <Link
                href="/dashboard/player/friends"
                className={cn(buttonVariants({ variant: "ghost" }))}
                title="Manage friends + pending invites"
              >
                <Users className="size-4" aria-hidden />
                Friends
              </Link>
              <Link
                href="/dashboard/player/notifications"
                className={cn(buttonVariants({ variant: "ghost" }))}
                title="Email notification preferences"
              >
                <Bell className="size-4" aria-hidden />
                Emails
              </Link>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-4 sm:gap-6">
            <div>
              <dt className="text-muted-foreground text-xs font-medium uppercase tracking-[0.14em]">
                Lifetime score
              </dt>
              <dd className="mt-1 text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">
                {totalPoints.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs font-medium uppercase tracking-[0.14em]">
                Sessions played
              </dt>
              <dd className="mt-1 text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">
                {gamesPlayed.toLocaleString()}
              </dd>
            </div>
            {bestFinish ? (
              <div>
                <dt className="text-muted-foreground text-xs font-medium uppercase tracking-[0.14em]">
                  Best finish
                </dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight">{bestFinish}</dd>
              </div>
            ) : null}
            {longestStreak > 0 ? (
              <div>
                <dt className="text-muted-foreground text-xs font-medium uppercase tracking-[0.14em]">
                  Longest streak
                </dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
                  {longestStreak}
                </dd>
              </div>
            ) : null}
            {fastest ? (
              <div>
                <dt className="text-muted-foreground text-xs font-medium uppercase tracking-[0.14em]">
                  Fastest correct
                </dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
                  {fastest}
                </dd>
              </div>
            ) : null}
            {stats.accuracy ? (
              <div>
                <dt className="text-muted-foreground text-xs font-medium uppercase tracking-[0.14em]">
                  Accuracy
                </dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
                  {stats.accuracy}%
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </section>

      {account.accountType === "player" ? <BecomeHostCard /> : null}

      <PlayerStatCards
        stats={{
          totalGames: gamesPlayed,
          totalCorrect: rollup.totalCorrect,
          totalPoints,
          accuracy: stats.accuracy,
          bestCategory: stats.bestCategory,
          venuesVisited: stats.venuesVisited,
          longestStreak,
          fastestCorrectMs: rollup.fastestCorrectMs,
          bestRank: rollup.bestRank,
          wins: stats.wins,
          second: stats.second,
          third: stats.third,
        }}
      />

      <RecentGamesTable
        rows={stats.recentGames}
        description="Your last sessions across any venue."
        emptyCtaHref="/join"
        emptyCtaLabel="Join a game"
      />

      <section className="flex flex-col gap-4">
        <SectionHeader
          title="Prize claims"
          description="Wins you can redeem at the venue. Show the host your claim code on the day."
        />
        {claims.length === 0 ? (
          <EmptyState
            icon={<Gift className="size-6" aria-hidden />}
            title="No claims yet"
            description="Finish top-3 at a venue with a prize and your claim code shows up here."
          />
        ) : (
          <Card className="shadow-[var(--shadow-card)]">
            <CardContent className="pt-6">
              <ul className="divide-y divide-border/70">
                {claims.map((c) => {
                  const rankLabel = formatRank(c.finalRank) ?? "—";
                  const tone =
                    c.status === "redeemed"
                      ? "success"
                      : c.status === "expired" || c.status === "void"
                        ? "neutral"
                        : "accent";
                  return (
                    <li
                      key={c.id}
                      className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-foreground font-medium">
                            {c.prizeLabel}
                          </span>
                          <StatusPill tone={tone}>{c.status}</StatusPill>
                        </div>
                        <div className="text-muted-foreground mt-1 text-xs">
                          {rankLabel} at {c.venueName}
                          {c.expiresAt
                            ? ` · expires ${new Date(c.expiresAt).toLocaleDateString()}`
                            : ""}
                        </div>
                        {c.prizeDetails ? (
                          <p className="text-muted-foreground mt-1 text-xs">
                            {c.prizeDetails}
                          </p>
                        ) : null}
                      </div>
                      <div
                        className="rounded-md border border-dashed border-[color-mix(in_oklab,var(--neon-magenta)_40%,transparent)] bg-[color-mix(in_oklab,var(--neon-magenta)_10%,transparent)] px-3 py-2 text-center font-mono text-sm font-semibold tracking-[0.3em] text-[var(--neon-magenta)] sm:text-base"
                        title="Show this code to the host on the day"
                      >
                        {c.claimCode}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>

      <TrophyWall
        items={stats.achievements.map((a) => ({
          slug: a.slug,
          title: a.title,
          description: a.description,
          icon: a.icon,
          earnedAt: a.earnedAt,
        }))}
      />
    </div>
  );
}
