import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { Gift, Inbox, Trophy } from "lucide-react";
import { getCurrentAccount } from "@/lib/accounts";
import { BecomeHostCard } from "@/components/billing/BecomeHostCard";
import { XpLevelBadge } from "@/components/player/XpLevelBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { listPlayerClaims } from "@/lib/prizes";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { db } from "@/lib/db/client";
import {
  accounts,
  achievementDefinitions,
  playerAchievementGrants,
  playerSessions,
  playerStats,
  sessions,
  venueProfiles,
} from "@/lib/db/schema";
import { getPublicPlayerStats } from "@/lib/game/publicPlayerStats";
import { getPlayerByAccountId } from "@/lib/players";

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

function statusPillFor(status: string) {
  if (status === "active") {
    return (
      <StatusPill tone="success" dot pulse>
        Live
      </StatusPill>
    );
  }
  if (status === "paused") {
    return (
      <StatusPill tone="warning" dot pulse>
        Paused
      </StatusPill>
    );
  }
  if (status === "pending") {
    return (
      <StatusPill tone="info" dot>
        Scheduled
      </StatusPill>
    );
  }
  if (status === "completed") {
    return <StatusPill tone="neutral">Completed</StatusPill>;
  }
  return <StatusPill tone="neutral">{status}</StatusPill>;
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

  const trophies = await db
    .select({
      title: achievementDefinitions.title,
      description: achievementDefinitions.description,
      slug: achievementDefinitions.slug,
      earnedAt: playerAchievementGrants.earnedAt,
    })
    .from(playerAchievementGrants)
    .innerJoin(
      achievementDefinitions,
      eq(achievementDefinitions.id, playerAchievementGrants.achievementId),
    )
    .where(eq(playerAchievementGrants.playerId, player.id))
    .orderBy(desc(playerAchievementGrants.earnedAt));

  const rollupRows = await db
    .select()
    .from(playerStats)
    .where(eq(playerStats.playerId, player.id))
    .limit(1);
  const rollup = rollupRows[0] ?? null;

  const recentGames = await db
    .select({
      sessionId: sessions.id,
      status: sessions.status,
      eventStartsAt: sessions.eventStartsAt,
      score: playerSessions.score,
      rank: playerSessions.rank,
      joinedAt: playerSessions.joinedAt,
      venueDisplayName: venueProfiles.displayName,
      venueSlug: venueProfiles.slug,
      venueName: accounts.name,
    })
    .from(playerSessions)
    .innerJoin(sessions, eq(sessions.id, playerSessions.sessionId))
    .innerJoin(accounts, eq(accounts.id, sessions.venueAccountId))
    .leftJoin(venueProfiles, eq(venueProfiles.accountId, sessions.venueAccountId))
    .where(eq(playerSessions.playerId, player.id))
    .orderBy(desc(playerSessions.joinedAt))
    .limit(8);

  const totalPoints = Number(rollup?.totalPoints ?? 0);
  const totalXp = Number(rollup?.totalXp ?? 0);
  const gamesPlayed = rollup?.totalGames ?? stats.gamesPlayed;
  const longestStreak = rollup?.longestStreak ?? 0;
  const bestFinish = formatRank(rollup?.bestRank);
  const fastest = formatMs(rollup?.fastestCorrectMs);

  const claims = await listPlayerClaims(player.id, { status: "all" });

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
              <div className="mt-4">
                <XpLevelBadge xp={totalXp} />
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

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="tracking-tight">Career</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Games played</span>
              <span className="text-foreground font-medium tabular-nums">
                {(rollup?.totalGames ?? stats.gamesPlayed).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Correct answers</span>
              <span className="text-foreground font-medium tabular-nums">
                {(rollup?.totalCorrect ?? stats.correctAnswers).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Accuracy</span>
              <span className="text-foreground font-medium tabular-nums">{stats.accuracy}%</span>
            </div>
            <div className="flex justify-between">
              <span>Best category</span>
              <span className="text-foreground font-medium">{stats.bestCategory}</span>
            </div>
            <div className="flex justify-between">
              <span>Venues visited</span>
              <span className="text-foreground font-medium tabular-nums">
                {stats.venuesVisited}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="tracking-tight">Points &amp; speed</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Total points</span>
              <span className="text-foreground font-semibold tabular-nums">
                {totalPoints.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Longest streak</span>
              <span className="text-foreground font-medium tabular-nums">{longestStreak}</span>
            </div>
            {fastest ? (
              <div className="flex justify-between">
                <span>Fastest correct</span>
                <span className="text-foreground font-medium tabular-nums">{fastest}</span>
              </div>
            ) : null}
            {bestFinish ? (
              <div className="flex justify-between">
                <span>Best finish</span>
                <span className="text-foreground font-medium">{bestFinish}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="tracking-tight">Podium</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-1 text-sm">
            <div className="flex justify-between">
              <span>1st</span>
              <span className="text-foreground font-medium tabular-nums">{stats.wins}</span>
            </div>
            <div className="flex justify-between">
              <span>2nd</span>
              <span className="text-foreground font-medium tabular-nums">{stats.second}</span>
            </div>
            <div className="flex justify-between">
              <span>3rd</span>
              <span className="text-foreground font-medium tabular-nums">{stats.third}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-4">
        <SectionHeader
          title="Recent games"
          description="Your last eight sessions across any venue."
        />
        {recentGames.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-6" aria-hidden />}
            title="No games yet"
            description="Join one with a six-letter code."
            actions={
              <Link href="/join" className={cn(buttonVariants({ size: "sm" }))}>
                Join a game
              </Link>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[var(--shadow-card)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Venue</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Rank</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentGames.map((g) => {
                  const venueLabel = g.venueDisplayName ?? g.venueName;
                  const when = g.eventStartsAt
                    ? new Date(g.eventStartsAt)
                    : new Date(g.joinedAt);
                  return (
                    <TableRow key={g.sessionId}>
                      <TableCell className="font-medium text-foreground">
                        {g.venueSlug ? (
                          <Link
                            href={`/v/${g.venueSlug}`}
                            className="hover:underline underline-offset-4"
                          >
                            {venueLabel}
                          </Link>
                        ) : (
                          venueLabel
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs tabular-nums">
                        {when.toLocaleString()}
                      </TableCell>
                      <TableCell>{statusPillFor(g.status)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatRank(g.rank) ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {g.score.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

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
                  const rankLabel =
                    c.finalRank === 1
                      ? "1st"
                      : c.finalRank === 2
                        ? "2nd"
                        : c.finalRank === 3
                          ? "3rd"
                          : `${c.finalRank}th`;
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

      <section className="flex flex-col gap-4">
        <SectionHeader
          title="Trophies"
          description="Earned by playing games and answering questions."
        />
        {trophies.length === 0 ? (
          <EmptyState
            icon={<Trophy className="size-6" aria-hidden />}
            title="No trophies yet"
            description="Play games and answer questions to unlock achievements."
          />
        ) : (
          <Card className="shadow-[var(--shadow-card)]">
            <CardContent className="text-muted-foreground pt-6 text-sm">
              <ul className="divide-y divide-border/70">
                {trophies.map((t) => (
                  <li key={t.slug} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
                    <div className="text-foreground font-medium">{t.title}</div>
                    <div>{t.description}</div>
                    <div className="text-xs opacity-80 tabular-nums">
                      {t.earnedAt.toISOString().slice(0, 10)}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
