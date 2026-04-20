"use client";

import { Check, Flame, Trophy, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SoloQuestion = {
  id: string;
  position: number;
  body: string;
  choices: string[];
  category: string;
  subcategory: string;
  difficulty: number;
  timerSeconds: number;
  shownAtMs: number;
  totalQuestions: number;
};

type NextResult =
  | { complete: false; status: string; question: SoloQuestion; totalScore: number; correctCount: number }
  | { complete: true; status: string; totalScore: number; correctCount: number; totalQuestions: number };

type AnswerResult = {
  correct: boolean;
  correctAnswer: string;
  pointsAwarded: number;
  streak: number;
  alreadyAnswered: boolean;
  complete: boolean;
  totalScore: number;
  correctCount: number;
  totalQuestions: number;
};

const REVEAL_MS = 1400;

export function SoloPlayClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState<SoloQuestion | null>(null);
  const [totals, setTotals] = useState({ score: 0, correct: 0, total: 0 });
  const [complete, setComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<AnswerResult | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const abortedRef = useRef(false);

  const fetchNext = useCallback(async () => {
    setLoading(true);
    setLastResult(null);
    setSelectedChoice(null);
    try {
      const res = await fetch(`/api/solo/${sessionId}/next`, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 403) {
          toast.error("That run belongs to someone else.");
          router.replace("/play");
          return;
        }
        if (res.status === 404) {
          toast.error("Couldn't find that run.");
          router.replace("/play/solo");
          return;
        }
        throw new Error("Failed to load question");
      }
      const data = (await res.json()) as NextResult;
      setTotals((prev) => ({
        score: data.totalScore,
        correct: data.correctCount,
        total: prev.total || (data.complete ? data.totalQuestions : data.question.totalQuestions),
      }));
      if (data.complete) {
        setComplete(true);
        setQuestion(null);
      } else {
        setQuestion(data.question);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load question");
    } finally {
      setLoading(false);
    }
  }, [router, sessionId]);

  useEffect(() => {
    abortedRef.current = false;
    void fetchNext();
    return () => {
      abortedRef.current = true;
    };
  }, [fetchNext]);

  // Timer tick. We only display elapsed; server does actual scoring.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  const remainingMs = useMemo(() => {
    if (!question) return 0;
    const elapsed = now - question.shownAtMs;
    return Math.max(0, question.timerSeconds * 1000 - elapsed);
  }, [now, question]);

  const timerPct = useMemo(() => {
    if (!question) return 0;
    const total = question.timerSeconds * 1000;
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, (remainingMs / total) * 100));
  }, [question, remainingMs]);

  const handleChoice = useCallback(
    async (choice: string) => {
      if (!question || submitting || lastResult) return;
      setSubmitting(true);
      setSelectedChoice(choice);
      try {
        const res = await fetch(`/api/solo/${sessionId}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ soloQuestionId: question.id, answer: choice }),
        });
        if (!res.ok) {
          const msg = (await res.json().catch(() => ({}))).error as string | undefined;
          throw new Error(msg || "Couldn't submit answer");
        }
        const data = (await res.json()) as AnswerResult;
        setLastResult(data);
        setTotals({
          score: data.totalScore,
          correct: data.correctCount,
          total: data.totalQuestions,
        });
        // Auto-advance.
        setTimeout(() => {
          if (abortedRef.current) return;
          if (data.complete) {
            setComplete(true);
            setQuestion(null);
            setLastResult(null);
            setSubmitting(false);
            // Recap loads via /recap.
          } else {
            void fetchNext().finally(() => setSubmitting(false));
          }
        }, REVEAL_MS);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't submit answer");
        setSelectedChoice(null);
        setSubmitting(false);
      }
    },
    [fetchNext, lastResult, question, sessionId, submitting]
  );

  // Auto-submit blank answer when time runs out to move on.
  useEffect(() => {
    if (!question || lastResult || submitting) return;
    if (remainingMs > 0) return;
    void handleChoice("__timeout__");
  }, [handleChoice, lastResult, question, remainingMs, submitting]);

  if (loading && !question && !complete) {
    return (
      <div className="min-h-screen bg-[var(--stage-bg)] p-6 text-sm text-white/70">
        Loading your run...
      </div>
    );
  }

  if (complete) {
    return <SoloCompleteCard sessionId={sessionId} totals={totals} />;
  }

  if (!question) {
    return (
      <div className="min-h-screen bg-[var(--stage-bg)] p-6 text-sm text-white/70">
        Setting things up...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--stage-bg)] text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/play"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60 hover:text-white"
          >
            ← Play hub
          </Link>
          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
            <span>
              Q{question.position + 1} / {question.totalQuestions}
            </span>
            <span className="tabular-nums text-white">Score {totals.score}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/80">
            {question.category}
          </span>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/60">
            {question.subcategory}
          </span>
          <span className="ml-auto tabular-nums text-white/80">
            {(remainingMs / 1000).toFixed(1)}s
          </span>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-[var(--stage-accent)] transition-[width]"
            style={{ width: `${timerPct}%`, transitionDuration: "180ms" }}
          />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-[var(--shadow-card)] backdrop-blur">
          <div className="text-xl font-semibold leading-tight tracking-tight md:text-2xl">
            {question.body}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {question.choices.map((choice) => {
            const isSelected = selectedChoice === choice;
            const revealing = !!lastResult;
            const isCorrect = revealing && lastResult?.correctAnswer === choice;
            const isWrongPicked = revealing && isSelected && !lastResult?.correct;
            return (
              <button
                key={choice}
                type="button"
                disabled={submitting || !!lastResult}
                onClick={() => void handleChoice(choice)}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl border px-4 py-4 text-left text-base font-medium transition",
                  !revealing && !isSelected &&
                    "border-white/10 bg-white/[0.03] hover:border-[var(--stage-accent)]/40 hover:bg-white/[0.07]",
                  !revealing && isSelected &&
                    "border-[var(--stage-accent)] bg-[var(--stage-accent)]/15",
                  isCorrect && "border-emerald-400 bg-emerald-500/15 text-white",
                  isWrongPicked && "border-rose-400 bg-rose-500/15 text-white",
                  revealing && !isCorrect && !isWrongPicked && "border-white/5 bg-white/[0.02] text-white/60"
                )}
              >
                <span className="truncate">{choice}</span>
                {isCorrect ? <Check className="size-5 text-emerald-300" /> : null}
                {isWrongPicked ? <X className="size-5 text-rose-300" /> : null}
              </button>
            );
          })}
        </div>

        {lastResult ? (
          <div
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm backdrop-blur",
              lastResult.correct
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                : "border-rose-400/40 bg-rose-500/10 text-rose-100"
            )}
          >
            <div className="flex items-center gap-2">
              {lastResult.correct ? (
                <Flame className="size-4" />
              ) : (
                <X className="size-4" />
              )}
              <span>
                {lastResult.correct
                  ? `+${lastResult.pointsAwarded} · streak ${lastResult.streak}`
                  : `Answer: ${lastResult.correctAnswer}`}
              </span>
            </div>
            <span className="tabular-nums text-white/80">
              {lastResult.correctCount} / {lastResult.totalQuestions}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SoloCompleteCard({
  sessionId,
  totals,
}: {
  sessionId: string;
  totals: { score: number; correct: number; total: number };
}) {
  return (
    <div className="min-h-screen bg-[var(--stage-bg)] text-white">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-6 py-16 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-[var(--stage-accent)]/15 text-[var(--stage-accent)] ring-1 ring-[var(--stage-accent)]/30">
          <Trophy className="size-8" />
        </div>
        <h1 className="text-4xl font-black tracking-tight">Run complete</h1>
        <div className="text-sm text-white/70">
          You answered {totals.correct} of {totals.total} correctly.
        </div>
        <div className="text-6xl font-black tabular-nums text-[var(--stage-accent)]">
          {totals.score}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/play/solo/${sessionId}/recap`}
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
            )}
          >
            Review answers
          </Link>
          <Link
            href="/play/solo"
            className={cn(
              buttonVariants({ size: "sm" }),
              "bg-[var(--stage-accent)] text-slate-950 hover:bg-[var(--stage-accent)]/90"
            )}
          >
            Play again
          </Link>
          <Link
            href="/leaderboards"
            className={cn(
              buttonVariants({ size: "sm", variant: "ghost" }),
              "text-white/80 hover:bg-white/10 hover:text-white"
            )}
          >
            See leaderboard
          </Link>
        </div>
      </div>
    </div>
  );
}
