import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Presentational-only wrapper that renders the three "Career / Points & speed
 * / Podium" cards shared by `/dashboard/player` (the owner's view) and
 * `/u/[username]` (the public profile). The owner view just passes its
 * existing data through — no extra query cost — and the public view uses
 * the same merged rollup from `getPublicPlayerStats`, so the two surfaces
 * can never drift visually.
 */
export type PlayerStatCardsProps = {
  stats: {
    totalGames: number;
    totalCorrect: number;
    totalPoints: number;
    accuracy: number;
    bestCategory: string;
    venuesVisited: number;
    longestStreak: number;
    fastestCorrectMs: number | null;
    bestRank: number | null;
    wins: number;
    second: number;
    third: number;
  };
};

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

export function PlayerStatCards({ stats }: PlayerStatCardsProps) {
  const fastest = formatMs(stats.fastestCorrectMs);
  const bestFinish = formatRank(stats.bestRank);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="tracking-tight">Career</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-1 text-sm">
          <Row label="Games played" value={stats.totalGames.toLocaleString()} />
          <Row label="Correct answers" value={stats.totalCorrect.toLocaleString()} />
          <Row label="Accuracy" value={`${stats.accuracy}%`} />
          <Row label="Best category" value={stats.bestCategory} mono={false} />
          <Row label="Venues visited" value={stats.venuesVisited.toLocaleString()} />
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="tracking-tight">Points &amp; speed</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-1 text-sm">
          <Row label="Total points" value={stats.totalPoints.toLocaleString()} emphasis />
          <Row label="Longest streak" value={stats.longestStreak.toLocaleString()} />
          {fastest ? <Row label="Fastest correct" value={fastest} /> : null}
          {bestFinish ? <Row label="Best finish" value={bestFinish} mono={false} /> : null}
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="tracking-tight">Podium</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-1 text-sm">
          <Row label="1st" value={stats.wins.toLocaleString()} />
          <Row label="2nd" value={stats.second.toLocaleString()} />
          <Row label="3rd" value={stats.third.toLocaleString()} />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  emphasis = false,
  mono = true,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span
        className={[
          "text-foreground",
          emphasis ? "font-semibold" : "font-medium",
          mono ? "tabular-nums" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </span>
    </div>
  );
}
