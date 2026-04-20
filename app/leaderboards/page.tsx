import Link from "next/link";
import { Trophy } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { getGlobalStats } from "@/lib/stats/aggregate";
import { cn } from "@/lib/utils";

function fmtNum(n: number): string {
  return new Intl.NumberFormat().format(n);
}

export const dynamic = "force-dynamic";

export default async function LeaderboardsPage() {
  const data = await getGlobalStats();
  const hasPlayers = data.topPlayers.length > 0;

  return (
    <MarketingShell wide>
      <div className="mx-auto max-w-5xl px-6 py-12">
        <SectionHeader
          as="h1"
          eyebrow="Leaderboards"
          title="Top players across Trivia.Box"
          description="Live ranks across every hosted and house game. Play more to climb - solo runs count at a reduced weight."
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
          <StatCard label="Players" value={fmtNum(data.totals.totalPlayers)} />
          <StatCard label="Games completed" value={fmtNum(data.totals.completedGames)} />
          <StatCard label="Games live" value={fmtNum(data.totals.activeGames)} />
          <StatCard label="Answers recorded" value={fmtNum(data.totals.totalAnswers)} />
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card className="border-white/10 bg-white/[0.04] text-white shadow-[var(--shadow-card)] backdrop-blur">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Trophy className="size-4" aria-hidden />
                <CardTitle className="tracking-tight">Top 100 lifetime</CardTitle>
              </div>
              <CardDescription className="text-white/60">
                Ranked by total points earned across every session.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!hasPlayers ? (
                <p className="text-sm text-white/70">
                  No scores on the board yet.{" "}
                  <Link href="/play/solo" className="underline underline-offset-4 hover:text-white">
                    Be the first.
                  </Link>
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="grid grid-cols-[2.5rem_1fr_auto_auto] gap-3 border-b border-white/10 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
                    <div>#</div>
                    <div>Player</div>
                    <div className="text-right">Games</div>
                    <div className="text-right">Points</div>
                  </div>
                  {data.topPlayers.map((p, idx) => (
                    <div
                      key={p.username}
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
                        {fmtNum(p.totalGames)}
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
              {data.topCategories.length === 0 ? (
                <p className="text-sm text-white/70">Waiting on more play data.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.topCategories.map((c) => (
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
