"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, Trophy } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ANSWER_STYLES,
  ChoiceShape,
  PILL_CLASSES,
} from "@/components/game/answerStyles";
import { GameShell } from "@/components/game/GameShell";
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

/** Hosted games use GameShell with a venue image backdrop; solo reuses the
 *  same shell and swaps the backdrop for the brand logo so the cabinet
 *  looks identical across hosted and solo play. */
const SOLO_BRAND_IMAGE = "/logo.png";

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
        setTimeout(() => {
          if (abortedRef.current) return;
          if (data.complete) {
            setComplete(true);
            setQuestion(null);
            setLastResult(null);
            setSubmitting(false);
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

  const topBar = (
    <>
      <div className="flex min-w-0 items-center gap-3 leading-tight">
        <Link
          href="/play"
          aria-label="Back to Play hub"
          className="flex items-center gap-2 text-white transition hover:opacity-90"
        >
          <span className="relative inline-flex h-8 w-8 overflow-hidden rounded-lg bg-white/10 ring-1 ring-white/15">
            <Image
              src={SOLO_BRAND_IMAGE}
              alt=""
              fill
              sizes="32px"
              className="object-contain p-1"
              priority
            />
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold text-white">
              Trivia.Box
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/60">
              Solo run
            </span>
          </span>
        </Link>
      </div>
      <div className="flex items-center gap-2">
        {question ? (
          <span className={cn(PILL_CLASSES, "text-white/80")}>
            <span className="tabular-nums">
              Q{question.position + 1} / {question.totalQuestions}
            </span>
          </span>
        ) : null}
        <span className={cn(PILL_CLASSES)} aria-label="Your score">
          <Trophy className="h-3 w-3 text-[var(--stage-accent)]" aria-hidden />
          <span className="tabular-nums text-white">{totals.score}</span>
        </span>
      </div>
    </>
  );

  if (loading && !question && !complete) {
    return (
      <GameShell venueImageUrl={SOLO_BRAND_IMAGE} topBar={topBar}>
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 py-16 text-center text-sm text-white/70">
          <Loader2 className="size-5 animate-spin text-white/70" aria-hidden />
          Loading your run...
        </div>
      </GameShell>
    );
  }

  if (complete) {
    return (
      <GameShell venueImageUrl={SOLO_BRAND_IMAGE} topBar={topBar}>
        <SoloCompleteCard sessionId={sessionId} totals={totals} />
      </GameShell>
    );
  }

  if (!question) {
    return (
      <GameShell venueImageUrl={SOLO_BRAND_IMAGE} topBar={topBar}>
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 py-16 text-center text-sm text-white/70">
          <Loader2 className="size-5 animate-spin text-white/70" aria-hidden />
          Setting things up...
        </div>
      </GameShell>
    );
  }

  return (
    <GameShell venueImageUrl={SOLO_BRAND_IMAGE} topBar={topBar}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 md:gap-5">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-white/80">
            {question.category}
          </span>
          <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-white/60">
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

        <section
          className={cn(
            "relative rounded-3xl bg-[var(--stage-glass)] px-6 py-5 md:px-8 md:py-6",
            "ring-1 ring-white/10 backdrop-blur-xl",
            "shadow-[var(--shadow-hero)]",
          )}
        >
          <AnimatePresence mode="wait">
            <motion.h1
              key={question.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              // Fluid clamp mirrors the hosted play surface so a long prompt
              // never pushes the answer tiles below the fold on laptops.
              className="text-balance font-semibold leading-[1.2] tracking-tight text-white [font-size:clamp(1.2rem,1.6vw+0.8rem,2rem)]"
            >
              {question.body}
            </motion.h1>
          </AnimatePresence>
        </section>

        <div className="grid auto-rows-fr gap-3 md:grid-cols-2">
          {question.choices.map((choice, i) => {
            const style = ANSWER_STYLES[i % ANSWER_STYLES.length]!;
            const isPicked = selectedChoice === choice;
            const revealing = !!lastResult;
            const isCorrect = revealing && lastResult?.correctAnswer === choice;
            const isWrongPick = revealing && isPicked && !lastResult?.correct;
            const disabled = submitting || revealing;
            const showSpinner = isPicked && submitting && !revealing;
            return (
              <motion.button
                key={`${question.id}-${i}`}
                type="button"
                disabled={disabled}
                onClick={() => void handleChoice(choice)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: i * 0.04, ease: "easeOut" }}
                aria-pressed={isPicked}
                className={cn(
                  "group relative flex h-full min-h-[4.5rem] items-center gap-3 overflow-hidden rounded-2xl px-5 py-4 text-left text-base font-semibold text-white md:text-lg",
                  "ring-1 ring-white/15 shadow-[var(--shadow-card)]",
                  "transition-all duration-200",
                  style.bg,
                  !disabled && "hover:scale-[1.015] hover:ring-white/30",
                  isPicked &&
                    "scale-[1.03] ring-2 ring-white/70 shadow-[var(--shadow-hero)]",
                  isWrongPick && "opacity-50 saturate-50",
                  revealing && !isCorrect && !isWrongPick && "opacity-80",
                  "disabled:cursor-not-allowed",
                )}
              >
                {isCorrect ? (
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-white/90"
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                  />
                ) : null}
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/20 ring-1 ring-white/20"
                  aria-hidden
                >
                  <ChoiceShape shape={style.shape} />
                </span>
                <span className="flex-1 leading-snug">{choice}</span>
                {showSpinner ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-white/90" aria-hidden />
                ) : (
                  <span className="shrink-0 text-sm font-bold opacity-80">{style.label}</span>
                )}
              </motion.button>
            );
          })}
        </div>

        {lastResult ? (
          <motion.div
            key="revealed"
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className={cn(
              "mx-auto flex w-full max-w-md flex-col items-center gap-2 rounded-2xl px-6 py-4 text-center",
              "bg-[var(--stage-glass)] ring-1 ring-white/10 backdrop-blur-md",
              "shadow-[var(--shadow-card)]",
            )}
          >
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60">
              <CheckCircle2
                className={cn(
                  "h-3.5 w-3.5",
                  lastResult.correct
                    ? "text-[var(--answer-emerald)]"
                    : "text-[var(--answer-rose)]",
                )}
                aria-hidden
              />
              Answer
            </span>
            <div className="text-xl font-semibold text-white">
              {lastResult.correctAnswer}
            </div>
            <div className="text-xs text-white/60">
              {lastResult.correct
                ? `+${lastResult.pointsAwarded} points · streak ${lastResult.streak}`
                : `${lastResult.correctCount} / ${lastResult.totalQuestions} correct so far`}
            </div>
          </motion.div>
        ) : null}
      </div>
    </GameShell>
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
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 py-12 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-[var(--stage-accent)]/15 text-[var(--stage-accent)] ring-1 ring-[var(--stage-accent)]/30">
        <Trophy className="size-8" />
      </div>
      <h1 className="text-4xl font-black tracking-tight text-white">Run complete</h1>
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
  );
}
