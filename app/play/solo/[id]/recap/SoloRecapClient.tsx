"use client";

import { Check, ChevronLeft, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";

type RecapQuestion = {
  position: number;
  correct: boolean;
  answered: boolean;
  timeToAnswerMs: number | null;
  pointsAwarded: number;
  body: string;
  correctAnswer: string;
  category: string;
  subcategory: string;
};

type Recap = {
  id: string;
  status: string;
  speed: string;
  totalScore: number;
  correctCount: number;
  questionCount: number;
  timerSeconds: number;
  startedAt: string;
  completedAt: string | null;
  questions: RecapQuestion[];
  maxScorePerQuestion: number;
};

export function SoloRecapClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [recap, setRecap] = useState<Recap | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/solo/${sessionId}/recap`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 403) {
            toast.error("That run belongs to someone else.");
            router.replace("/play");
            return null;
          }
          if (res.status === 404) {
            router.replace("/play/solo");
            return null;
          }
          throw new Error("Failed to load recap");
        }
        return (await res.json()) as Recap;
      })
      .then((data) => {
        if (!cancelled && data) setRecap(data);
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Failed to load recap");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router, sessionId]);

  if (loading || !recap) {
    return (
      <div className="min-h-screen bg-[var(--stage-bg)] p-6 text-sm text-white/70">
        Loading recap...
      </div>
    );
  }

  const accuracy =
    recap.questionCount > 0
      ? Math.round((recap.correctCount / recap.questionCount) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-[var(--stage-bg)] text-white">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <SectionHeader
          as="h1"
          eyebrow="Solo recap"
          title={`${recap.correctCount} of ${recap.questionCount} correct`}
          description={`${recap.speed.toUpperCase()} · ${recap.timerSeconds}s per question · ${accuracy}% accuracy`}
          className="text-white [&_*]:text-white [&_p]:text-white/70"
          actions={
            <Link
              href="/play"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "text-white/80 hover:bg-white/10 hover:text-white"
              )}
            >
              <ChevronLeft className="mr-1 size-4" />
              Play hub
            </Link>
          }
        />

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <StatTile label="Score" value={recap.totalScore.toLocaleString()} />
          <StatTile label="Correct" value={`${recap.correctCount} / ${recap.questionCount}`} />
          <StatTile label="Accuracy" value={`${accuracy}%`} />
        </div>

        <Card className="mt-8 border-white/10 bg-white/[0.04] text-white shadow-[var(--shadow-card)] backdrop-blur">
          <CardHeader>
            <CardTitle className="tracking-tight">Per question</CardTitle>
            <CardDescription className="text-white/60">
              Click through to see what you got, what the answer was, and how long you took.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {recap.questions.map((q) => (
              <div
                key={q.position}
                className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:flex-row sm:items-start"
              >
                <div className="flex items-center gap-2 sm:w-40 sm:shrink-0">
                  <div
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                      q.correct
                        ? "bg-emerald-500/20 text-emerald-200"
                        : "bg-rose-500/20 text-rose-200"
                    )}
                  >
                    {q.correct ? <Check className="size-4" /> : <X className="size-4" />}
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
                    Q{q.position + 1}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
                    <StatusPill tone="neutral">{q.category}</StatusPill>
                    <span>{q.subcategory}</span>
                  </div>
                  <div className="mt-1 text-sm text-white">{q.body}</div>
                  <div className="mt-1 text-xs text-white/60">
                    Answer: <span className="text-white/90">{q.correctAnswer}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-white/60">
                  <span className="tabular-nums text-white">+{q.pointsAwarded}</span>
                  {q.timeToAnswerMs != null ? (
                    <span className="tabular-nums">{(q.timeToAnswerMs / 1000).toFixed(1)}s</span>
                  ) : (
                    <span>—</span>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/play/solo"
            className={cn(
              buttonVariants({ size: "sm" }),
              "bg-[var(--stage-accent)] text-slate-950 hover:bg-[var(--stage-accent)]/90"
            )}
          >
            Start another run
          </Link>
          <Link
            href="/leaderboards"
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
            )}
          >
            Leaderboards
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-white/10 bg-white/[0.04] text-white shadow-[var(--shadow-card)] backdrop-blur">
      <CardContent className="flex flex-col gap-1 p-5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">
          {label}
        </div>
        <div className="text-2xl font-black tabular-nums tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}
