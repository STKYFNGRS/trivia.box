import Link from "next/link";
import { Flame, Trophy } from "lucide-react";
import { getCurrentAccount } from "@/lib/accounts";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { getPlayerByAccountId } from "@/lib/players";
import {
  getGlobalStats,
  getScopedLeaderboard,
  getScopedPlayerRank,
  type LeaderboardScope,
} from "@/lib/stats/aggregate";
import { cn } from "@/lib/utils";

function fmtNum(n: number): string {
  return new Intl.NumberFormat().format(n);
}

export const dynamic = "force-dynamic";

const SCOPE_TABS: Array<{ id: LeaderboardScope; label: string; blurb: string }> = [
  {
    id: "today",
    label: "Today",
    blurb: "Rolling last 24h — daily-challenge runs count here too.",
  },
  {
    id: "week",
    label: "This week",
    blurb: "Rolling 7 days across every hosted, house, and solo game.",
  },
  {
    id: "season",
    label: "Season",
    blurb:
      "Resets every quarter — compete for the season crown before the next reset.",
  },
  {
    id: "all",
    label: "All time",
    blurb: "Ranked by total points earned across every session.",
  },
];

function parseScope(raw: string | undefined): LeaderboardScope {
  if (raw === "today" || raw === "week" || raw === "season" || raw === "all") {
    return raw;
  }
  return "all";
}

export default async function LeaderboardsPage(props: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const { scope: rawScope } = await props.searchParams;
  const scope = parseScope(rawScope);

  // Totals block + category breakdown stay lifetime — switching those on
  // every tab would hide how big the whole community is.
  const [globals, scoped, account] = await Promise.all([
    getGlobalStats(),
    getScopedLeaderboard(scope),
    getCurrentAccount(),
  ]);

  // "You rank" chip: only render when the viewer is authenticated AND has
  // at least one point in the current scope — a 0-point chip would feel
  // like public shaming.
  let viewerRank: { rank: number; totalPoints: number } | null = null;
  if (account) {
    const player = await getPlayerByAccountId(account.id);
    if (player) {
      viewerRank = await getScopedPlayerRank(scope, player.id);
    }
  }

  const currentTab = SCOPE_TABS.find((t) => t.id === scope) ?? SCOPE_TABS[2];
  const hasPlayers = scoped.rows.length > 0;

  return (
    <MarketingShell wide>
      <div className="mx-auto max-w-5xl px-6 py-12">
        <SectionHeader
          as="h1"
          eyebrow="Leaderboards"
          title="Top players across Trivia.Box"
          description="Live ranks across every hosted, house, and solo game. Daily and weekly boards reset on a rolling window."
          className="text-white [&_*]:text-white [&_p]:text-white/70"
          actions={
            <div className="flex items-center gap-2">
              <Link
                href="/play"
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "bg-[var(--stage-accent)] text-slate-950 hover:bg-[var(--stage-accent)]/90"
                )}
              >
                Play now
              </Link>
              <Link
                href="/games/upcoming"
                className={cn(
                  buttonVariants({ size: "sm", variant: "outline" }),
                  "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
                )}
              >
                Upcoming
              </Link>
            </div>
          }
        />

        <div className="mt-8 grid gap-6 md:grid-cols-4">
          <StatCard label="Players" value={fmtNum(globals.totals.totalPlayers)} />
          <StatCard label="Games completed" value={fmtNum(globals.totals.completedGames)} />
          <StatCard label="Games live" value={fmtNum(globals.totals.activeGames)} />
          <StatCard label="Answers recorded" value={fmtNum(globals.totals.totalAnswers)} />
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card className="border-white/10 bg-white/[0.04] text-white shadow-[var(--shadow-card)] backdrop-blur">
            <CardHeader className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Trophy className="size-4" aria-hidden />
                <CardTitle className="tracking-tight">
                  Top 100 · {currentTab.label.toLowerCase()}
                </CardTitle>
              </div>
              <CardDescription className="text-white/60">
                {currentTab.blurb}
              </CardDescription>
              <div
                role="tablist"
                aria-label="Leaderboard scope"
                className="inline-flex w-max rounded-full border border-white/10 bg-white/[0.04] p-1"
              >
                {SCOPE_TABS.map((tab) => {
                  const active = tab.id === scope;
                  return (
                    <Link
                      key={tab.id}
                      href={
                        tab.id === "all"
                          ? "/leaderboards"
                          : `/leaderboards?scope=${tab.id}`
                      }
                      role="tab"
                      aria-selected={active}
                      className={cn(
                        "rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition",
                        active
                          ? "bg-[var(--stage-accent)] text-slate-950"
                          : "text-white/70 hover:text-white"
                      )}
                    >
                      {tab.label}
                    </Link>
                  );
                })}
              </div>
              {viewerRank ? (
                <div className="inline-flex w-max items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200">
                  <Flame className="size-3.5" aria-hidden />
                  You rank #{fmtNum(viewerRank.rank)} ·{" "}
                  {fmtNum(viewerRank.totalPoints)} pts {currentTab.label.toLowerCase()}
                </div>
              ) : null}
            </CardHeader>
            <CardContent>
              {!hasPlayers ? (
                <p className="text-sm text-white/70">
                  No scores in this window yet.{" "}
                  <Link
                    href="/play/solo"
                    className="underline underline-offset-4 hover:text-white"
                  >
                    Be the first.
                  </Link>
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="grid grid-cols-[2.5rem_1fr_auto_auto] gap-3 border-b border-white/10 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
                    <div>#</div>
                    <div>Player</div>
                    <div className="text-right">Correct</div>
                    <div className="text-right">Points</div>
                  </div>
                  {scoped.rows.map((p, idx) => (
                    <div
                      key={p.playerId}
                      className="grid grid-cols-[2.5rem_1fr_auto_auto] items-center gap-3 border-b border-white/5 py-2 text-sm last:border-b-0"
                    >
                      <div className="tabular-nums text-white/60">{idx + 1}</div>
                      <Link
                        href={`/u/${encodeURIComponent(p.username)}`}
                        className="truncate font-medium text-white underline-offset-4 hover:underline"
                      >
                        {p.username}
                      </Link>
                      <div className="text-right tabular-nums text-white/70">
                        {fmtNum(p.totalCorrect)}
                      </div>
                      <div className="text-right tabular-nums font-semibold">
                        {fmtNum(p.totalPoints)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.04] text-white shadow-[var(--shadow-card)] backdrop-blur">
            <CardHeader>
              <CardTitle className="tracking-tight">Hot categories</CardTitle>
              <CardDescription className="text-white/60">
                Most-answered across every game. Accuracy is community-wide.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {globals.topCategories.length === 0 ? (
                <p className="text-sm text-white/70">Waiting on more play data.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {globals.topCategories.map((c) => (
                    <li
                      key={c.category}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="truncate">{c.category}</span>
                      <span className="tabular-nums text-white/70">
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
    </MarketingShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-white/10 bg-white/[0.04] text-white shadow-[var(--shadow-card)] backdrop-blur">
      <CardContent className="flex flex-col gap-1 p-5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">
          {label}
        </div>
        <div className="text-3xl font-black tabular-nums tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}
