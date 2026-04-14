import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublicPlayerStats } from "@/lib/game/publicPlayerStats";

export async function generateMetadata(props: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await props.params;
  return { title: `${username} · trivia.box` };
}

export default async function PublicPlayerPage(props: { params: Promise<{ username: string }> }) {
  const { username } = await props.params;
  const stats = await getPublicPlayerStats(username);
  if (!stats) notFound();

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-12">
      <div>
        <div className="text-muted-foreground text-sm">Player</div>
        <h1 className="text-4xl font-semibold tracking-tight">{stats.player.username}</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Career</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <div>Games played: {stats.gamesPlayed}</div>
            <div>Correct answers: {stats.correctAnswers}</div>
            <div>Accuracy: {stats.accuracy}%</div>
            <div>Best category: {stats.bestCategory}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Podium</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <div>1st: {stats.wins}</div>
            <div>2nd: {stats.second}</div>
            <div>3rd: {stats.third}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Venue passport</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <div>Venues visited: {stats.venuesVisited}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Last game</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {stats.lastSession ? (
              <>
                <div>Score: {stats.lastSession.score}</div>
                <div>Rank: {stats.lastSession.rank ?? "—"}</div>
              </>
            ) : (
              <div>No games yet.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
