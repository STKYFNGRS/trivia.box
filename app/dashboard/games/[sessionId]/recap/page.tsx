import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BarChart3, Clock, Users } from "lucide-react";
import { getCurrentAccount } from "@/lib/accounts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { getSessionAnalytics } from "@/lib/game/sessionAnalytics";
import { formatMs } from "@/lib/format";

export const dynamic = "force-dynamic";

function fmtMs(ms: number | null | undefined): string {
  return formatMs(ms) ?? "—";
}

function difficultyLabel(n: number): string {
  if (n <= 1) return "Easy";
  if (n >= 3) return "Hard";
  return "Medium";
}

export default async function GameRecapPage(props: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await props.params;
  const account = await getCurrentAccount();
  if (!account) redirect("/sign-in");

  const data = await getSessionAnalytics(sessionId);
  if (!data) notFound();

  // Authorization — only the host who owned the session (or a venue staff
  // linked via `host_venue_relationships`) can see the recap. House games are
  // visible to anyone who happens to be signed in as the house account.
  if (
    data.session.hostAccountId !== account.id &&
    data.session.venueAccountId !== account.id
  ) {
    // Be terse; 404 rather than 403 avoids leaking that the id exists.
    notFound();
  }

  const { session, attendance, scoring, topPlayers, perQuestion } = data;
  const easiest = [...perQuestion].sort((a, b) => b.accuracyPct - a.accuracyPct)[0];
  const hardest = [...perQuestion].sort((a, b) => a.accuracyPct - b.accuracyPct)[0];
  const fastest = [...perQuestion]
    .filter((q) => q.medianResponseMs != null)
    .sort(
      (a, b) => (a.medianResponseMs ?? Infinity) - (b.medianResponseMs ?? Infinity)
    )[0];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/dashboard/games"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to games
        </Link>
        <SectionHeader
          as="h1"
          eyebrow={`Session ${session.joinCode}`}
          title={session.theme ?? "Game recap"}
          description={
            session.endedAt
              ? `Ended ${new Date(session.endedAt).toLocaleString()}`
              : `Status: ${session.status}`
          }
        />
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Users className="size-4" aria-hidden />}
          label="Players joined"
          value={attendance.joined.toLocaleString()}
        />
        <Stat
          icon={<BarChart3 className="size-4" aria-hidden />}
          label="Questions asked"
          value={attendance.questionsAsked.toLocaleString()}
        />
        <Stat
          icon={<BarChart3 className="size-4" aria-hidden />}
          label="Overall accuracy"
          value={`${scoring.accuracyPct}%`}
          hint={`${scoring.correctAnswers.toLocaleString()} / ${scoring.answersGraded.toLocaleString()} correct`}
        />
        <Stat
          icon={<Clock className="size-4" aria-hidden />}
          label="Median response"
          value={fmtMs(scoring.medianResponseMs)}
        />
      </section>

      {topPlayers.length > 0 ? (
        <section>
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Top players</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-2">
                {topPlayers.map((p, i) => (
                  <li
                    key={p.playerId}
                    className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.04] p-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="text-muted-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-white/10 text-xs tabular-nums">
                        {i + 1}
                      </span>
                      <Link
                        href={`/u/${encodeURIComponent(p.username)}`}
                        className="truncate text-sm font-semibold hover:underline"
                      >
                        {p.username}
                      </Link>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-semibold tabular-nums">
                        {p.totalPoints.toLocaleString()} pts
                      </div>
                      <div className="text-muted-foreground">
                        {p.correctCount}/{p.answered} correct
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {easiest || hardest || fastest ? (
        <section className="grid gap-3 sm:grid-cols-3">
          {easiest ? (
            <Highlight
              label="Crowd pleaser"
              body={easiest.prompt}
              footer={`${easiest.accuracyPct}% correct · ${easiest.category}`}
            />
          ) : null}
          {hardest ? (
            <Highlight
              label="Stumper"
              body={hardest.prompt}
              footer={`${hardest.accuracyPct}% correct · ${hardest.category}`}
            />
          ) : null}
          {fastest ? (
            <Highlight
              label="Snappiest"
              body={fastest.prompt}
              footer={`median ${fmtMs(fastest.medianResponseMs)} · ${fastest.category}`}
            />
          ) : null}
        </section>
      ) : null}

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Per-question breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ol className="divide-y divide-white/10">
              {perQuestion.map((q) => (
                <li key={q.sessionQuestionId} className="flex flex-col gap-1.5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="text-muted-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-white/10 text-xs tabular-nums">
                        {q.orderIndex + 1}
                      </span>
                      <p className="text-sm leading-snug">{q.prompt}</p>
                    </div>
                    <div className="text-muted-foreground shrink-0 text-right text-xs tabular-nums">
                      {q.accuracyPct}% · {fmtMs(q.medianResponseMs)}
                    </div>
                  </div>
                  <div className="text-muted-foreground flex flex-wrap items-center gap-2 pl-9 text-xs">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5">
                      {q.category}
                      {q.subcategory ? ` · ${q.subcategory}` : ""}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5">
                      {difficultyLabel(q.difficulty)}
                    </span>
                    <span>
                      {q.correct}/{q.answered} correct
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em]">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? (
        <div className="text-muted-foreground text-xs">{hint}</div>
      ) : null}
    </div>
  );
}

function Highlight({
  label,
  body,
  footer,
}: {
  label: string;
  body: string;
  footer: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <div className="text-muted-foreground text-xs font-semibold uppercase tracking-[0.14em]">
        {label}
      </div>
      <p className="line-clamp-3 text-sm leading-snug">{body}</p>
      <p className="text-muted-foreground text-xs">{footer}</p>
    </div>
  );
}
