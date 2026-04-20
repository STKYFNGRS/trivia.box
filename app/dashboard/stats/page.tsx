import Link from "next/link";
import { redirect } from "next/navigation";
import { Trophy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusPill } from "@/components/ui/status-pill";
import { getCurrentAccount } from "@/lib/accounts";
import { getHostVenueOpsStats, getVenueStats } from "@/lib/stats/aggregate";

function fmtNum(n: number): string {
  return new Intl.NumberFormat().format(n);
}

export const dynamic = "force-dynamic";

export default async function HostStatsPage() {
  const account = await getCurrentAccount();
  if (!account) {
    redirect("/sign-in");
  }
  if (account.accountType === "player") {
    redirect("/dashboard/player");
  }

  const venueAccountId = account.id;
  const [stats, ops] = await Promise.all([
    getVenueStats(venueAccountId),
    getHostVenueOpsStats(venueAccountId),
  ]);

  if (!stats) {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader
          as="h1"
          eyebrow="Stats"
          title="Your venue stats"
          description="We could not find a venue profile for your account yet."
        />
        <Card>
          <CardContent className="text-muted-foreground p-5 text-sm">
            Set up your venue profile from game setup to start tracking per-venue stats.{" "}
            <Link href="/dashboard/games/new" className="underline">
              Open game setup
            </Link>
            .
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        as="h1"
        eyebrow="Stats"
        title={`${stats.venue.displayName} · venue stats`}
        description={
          <>
            Public snapshot available at{" "}
            <Link href={`/v/${stats.venue.slug}`} className="underline">
              /v/{stats.venue.slug}
            </Link>
            .
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Completed games" value={fmtNum(stats.totals.completedGames)} />
        <StatCard label="Unique players" value={fmtNum(stats.totals.uniquePlayers)} />
        <StatCard label="Answers recorded" value={fmtNum(stats.totals.totalAnswers)} />
        <StatCard label="Avg. score" value={fmtNum(stats.totals.averageScore)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="tracking-tight">Session funnel</CardTitle>
          <CardDescription>
            How games flow from scheduling to completed. No-shows are scheduled games whose start
            time passed without launching.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <FunnelCell label="Pending" value={fmtNum(ops.sessionFunnel.pending)} />
          <FunnelCell label="Active" value={fmtNum(ops.sessionFunnel.active)} tone="success" />
          <FunnelCell label="Completed" value={fmtNum(ops.sessionFunnel.completed)} />
          <FunnelCell
            label="No-shows"
            value={fmtNum(ops.sessionFunnel.noShows)}
            tone={ops.sessionFunnel.noShows > 0 ? "warning" : "neutral"}
          />
          <div className="md:col-span-4 text-muted-foreground text-xs">
            Average players per completed game:{" "}
            <span className="text-foreground font-medium tabular-nums">
              {ops.averagePlayersPerGame}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trophy className="size-4" aria-hidden />
              <CardTitle className="tracking-tight">Top 50 at this venue</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {stats.topPlayers.length === 0 ? (
              <p className="text-muted-foreground text-sm">No players yet.</p>
            ) : (
              <div className="flex flex-col gap-1">
                <div className="grid grid-cols-[2.5rem_1fr_auto_auto] gap-3 border-b pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <div>#</div>
                  <div>Player</div>
                  <div className="text-right">Games</div>
                  <div className="text-right">Points</div>
                </div>
                {stats.topPlayers.map((p, idx) => (
                  <div
                    key={p.username}
                    className="grid grid-cols-[2.5rem_1fr_auto_auto] items-center gap-3 border-b py-2 text-sm last:border-b-0"
                  >
                    <div className="tabular-nums text-muted-foreground">{idx + 1}</div>
                    <Link
                      href={`/u/${encodeURIComponent(p.username)}`}
                      className="truncate font-medium underline-offset-4 hover:underline"
                    >
                      {p.username}
                    </Link>
                    <div className="text-muted-foreground text-right tabular-nums">
                      {fmtNum(p.games)}
                    </div>
                    <div className="text-right tabular-nums font-semibold">
                      {fmtNum(p.totalScore)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="tracking-tight">Hot categories here</CardTitle>
            <CardDescription>Most-answered at this venue.</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.topCategories.length === 0 ? (
              <p className="text-muted-foreground text-sm">Waiting on more play data.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {stats.topCategories.map((c) => (
                  <li key={c.category} className="flex items-center justify-between text-sm">
                    <span className="truncate">{c.category}</span>
                    <span className="text-muted-foreground tabular-nums">
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
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-5">
        <div className="text-muted-foreground text-[10px] font-semibold uppercase tracking-[0.22em]">
          {label}
        </div>
        <div className="text-3xl font-black tabular-nums tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}

function FunnelCell({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="flex flex-col">
        <div className="text-muted-foreground text-[10px] font-semibold uppercase tracking-[0.18em]">
          {label}
        </div>
        <div className="text-2xl font-black tabular-nums">{value}</div>
      </div>
      <StatusPill tone={tone === "success" ? "success" : tone === "warning" ? "warning" : "neutral"}>
        {label}
      </StatusPill>
    </div>
  );
}
