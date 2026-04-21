"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2, Lock, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Countdown } from "@/components/game/Countdown";
import { FinalStandings } from "@/components/game/FinalStandings";
import { GameShell, buildVenueImageUrl } from "@/components/game/GameShell";
import { useGameChannel } from "@/lib/ably/useGameChannel";

/**
 * Bootstrap is the **authoritative** source of truth for `currentQuestion`,
 * status, and correctAnswer. The Ably channel is used only as an invalidation
 * signal that triggers a re-bootstrap (debounced). This removes the earlier
 * race where a stale `question_started` in the 2-minute rewind buffer pointed
 * `activeQid` at a dead id and caused every answer click to silently 400.
 */
type BootstrapQuestion = {
  sessionQuestionId: string;
  body: string;
  choices: string[];
  timerSeconds: number | null;
  timerStartedAtMs: number | null;
  status: "active" | "locked" | "revealed";
  correctAnswer: string | null;
};

type LeaderboardEntry = { playerId: string; username: string; score: number };

type BootstrapResponse = {
  sessionId?: string;
  status?: string;
  pausedAt?: string | null;
  venueSlug?: string | null;
  venueDisplayName?: string | null;
  venueImageUpdatedAt?: string | null;
  venueHasImage?: boolean;
  currentQuestion?: BootstrapQuestion | null;
  totalQuestions?: number;
  completedCount?: number;
  leaderboard?: LeaderboardEntry[];
  serverTimeMs?: number;
};

type AnswerErrorResponse = {
  error?: string;
  code?:
    | "STALE_QUESTION"
    | "LOCKED"
    | "SESSION_NOT_FOUND"
    | "NOT_IN_SESSION"
    | "ALREADY_ANSWERED"
    | "SESSION_PAUSED";
};

/**
 * Four shape/color answer slots. Deterministic by choice index so the same
 * answer always lights up the same color across the play / display screens.
 */
const ANSWER_STYLES: Array<{
  bg: string;
  label: string;
  shape: "triangle" | "diamond" | "circle" | "square";
}> = [
  { bg: "bg-[var(--answer-rose)]", label: "A", shape: "triangle" },
  { bg: "bg-[var(--answer-sky)]", label: "B", shape: "diamond" },
  { bg: "bg-[var(--answer-amber)]", label: "C", shape: "circle" },
  { bg: "bg-[var(--answer-emerald)]", label: "D", shape: "square" },
];

function ChoiceShape({ shape }: { shape: (typeof ANSWER_STYLES)[number]["shape"] }) {
  const common = "h-6 w-6 shrink-0";
  if (shape === "triangle") {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden>
        <polygon points="12,3 22,21 2,21" fill="currentColor" />
      </svg>
    );
  }
  if (shape === "diamond") {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden>
        <polygon points="12,2 22,12 12,22 2,12" fill="currentColor" />
      </svg>
    );
  }
  if (shape === "circle") {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden>
        <circle cx="12" cy="12" r="10" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={common} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" />
    </svg>
  );
}

/** Event names that should trigger a re-bootstrap. */
const INVALIDATING_EVENTS = new Set([
  "question_started",
  "answers_locked",
  "answer_revealed",
  "leaderboard_updated",
  "game_paused",
  "game_resumed",
  "game_completed",
  "game_launched",
]);

const PILL_CLASSES =
  "inline-flex items-center gap-1.5 rounded-full bg-[var(--stage-glass)] px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-white/80 ring-1 ring-white/10 backdrop-blur-md";

export default function PlayPage() {
  const routeParams = useParams<{ joinCode: string }>();
  const joinCode = String(routeParams.joinCode ?? "").toUpperCase();
  const searchParams = useSearchParams();
  const playerId = searchParams.get("playerId");

  const { messages, connectionState } = useGameChannel(joinCode);

  const [boot, setBoot] = useState<BootstrapResponse | null>(null);
  const [resyncing, setResyncing] = useState(false);
  const inFlightRef = useRef<Promise<BootstrapResponse | null> | null>(null);

  const refreshBootstrap = useCallback(async (): Promise<BootstrapResponse | null> => {
    if (!joinCode || joinCode.length !== 6) return null;
    if (inFlightRef.current) return inFlightRef.current;
    const p = (async () => {
      try {
        const res = await fetch(
          `/api/game/public/session?code=${encodeURIComponent(joinCode)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return null;
        const data = (await res.json()) as BootstrapResponse;
        setBoot(data);
        return data;
      } catch {
        return null;
      } finally {
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = p;
    return p;
  }, [joinCode]);

  useEffect(() => {
    void refreshBootstrap();
  }, [refreshBootstrap]);

  // Ably events are treated as invalidation signals. We debounce slightly so a
  // burst of messages (answers_locked → answer_revealed → leaderboard_updated)
  // collapses into a single re-fetch.
  const lastProcessedRef = useRef(0);
  useEffect(() => {
    if (messages.length <= lastProcessedRef.current) return;
    const fresh = messages.slice(lastProcessedRef.current);
    lastProcessedRef.current = messages.length;
    if (!fresh.some((m) => INVALIDATING_EVENTS.has(m.name))) return;
    const h = setTimeout(() => {
      void refreshBootstrap();
    }, 80);
    return () => clearTimeout(h);
  }, [messages, refreshBootstrap]);

  const current = boot?.currentQuestion ?? null;
  const activeQid = current?.sessionQuestionId ?? null;
  const lockedForActive = current?.status === "locked" || current?.status === "revealed";
  const revealedForActive = current?.status === "revealed";
  const pausedAt = boot?.pausedAt ?? null;
  const completed = boot?.status === "completed";

  const [picked, setPicked] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Client-side fallback marker for manual timer mode.
  const clientStartedAtMsRef = useRef<number>(Date.now());
  useEffect(() => {
    setPicked(null);
    setSubmitting(false);
    clientStartedAtMsRef.current = Date.now();
  }, [activeQid]);

  const disabled = submitting || lockedForActive || revealedForActive || !!pausedAt;
  const timerSeconds = current?.timerSeconds ?? null;
  const timerStartedAtMs = current?.timerStartedAtMs ?? null;

  const venueImageUrl = buildVenueImageUrl(boot ?? {});

  const myLeaderboard = useMemo(() => {
    if (!playerId || !boot?.leaderboard?.length) return null;
    const idx = boot.leaderboard.findIndex((e) => e.playerId === playerId);
    if (idx < 0) return null;
    return { rank: idx + 1, score: boot.leaderboard[idx].score };
  }, [boot?.leaderboard, playerId]);

  /**
   * Post one answer attempt. Returns the fetch result so `submitAnswer` can
   * decide whether to self-heal and retry.
   */
  const postAnswer = useCallback(
    async (sqId: string, choice: string) => {
      const startRef = timerStartedAtMs ?? clientStartedAtMsRef.current;
      const rawElapsed = Math.max(0, Date.now() - startRef);
      const cap = (timerSeconds ?? 60) * 1000;
      const timeToAnswerMs = Math.min(rawElapsed, cap);
      const res = await fetch("/api/game/public/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          joinCode,
          playerId,
          sessionQuestionId: sqId,
          answer: choice,
          timeToAnswerMs,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as AnswerErrorResponse & {
        ok?: boolean;
        isCorrect?: boolean;
      };
      return { res, data };
    },
    [joinCode, playerId, timerSeconds, timerStartedAtMs]
  );

  async function submitAnswer(choice: string) {
    if (!playerId) {
      toast.error("Missing player id — rejoin the game");
      return;
    }
    if (!activeQid) {
      toast.error("No active question yet");
      return;
    }
    setSubmitting(true);
    setPicked(choice);
    try {
      let attempt = await postAnswer(activeQid, choice);
      if (attempt.res.ok && attempt.data.ok) {
        toast.message(attempt.data.isCorrect ? "Correct!" : "Nice try");
        return;
      }

      // Self-heal: if the server says our sqId is stale or just-locked, re-sync
      // the bootstrap and try exactly once more with whatever the server now
      // considers active.
      const code = attempt.data.code;
      if (code === "STALE_QUESTION" || code === "LOCKED") {
        setResyncing(true);
        try {
          const fresh = await refreshBootstrap();
          const freshQid = fresh?.currentQuestion?.sessionQuestionId;
          const freshStatus = fresh?.currentQuestion?.status;
          if (freshQid && freshQid !== activeQid && freshStatus === "active") {
            attempt = await postAnswer(freshQid, choice);
            if (attempt.res.ok && attempt.data.ok) {
              toast.message(attempt.data.isCorrect ? "Correct!" : "Nice try");
              return;
            }
          }
        } finally {
          setResyncing(false);
        }
      }

      const msg = attempt.data.error || "Submit failed";
      toast.error(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  const correctChoice = revealedForActive ? current?.correctAnswer ?? null : null;

  const connectionPillLabel =
    connectionState === "connected" || connectionState === "initialized"
      ? null
      : connectionState === "connecting"
        ? "Connecting…"
        : connectionState === "disconnected"
          ? "Reconnecting…"
          : connectionState === "suspended"
            ? "Offline"
            : connectionState === "failed"
              ? "Connection failed"
              : connectionState;

  const topBar = (
    <>
      <div className="flex min-w-0 flex-col leading-tight">
        {boot?.venueDisplayName ? (
          <span className="truncate text-sm font-semibold text-white">
            {boot.venueDisplayName}
          </span>
        ) : null}
        <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/60">
          Code {joinCode}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {connectionPillLabel ? (
          <span className={cn(PILL_CLASSES, "text-amber-200")}>{connectionPillLabel}</span>
        ) : null}
        {resyncing ? (
          <span className={PILL_CLASSES}>
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Resyncing
          </span>
        ) : null}
        {myLeaderboard ? (
          <span className={PILL_CLASSES} aria-label="Your rank and score">
            <Trophy className="h-3 w-3 text-[var(--stage-accent)]" aria-hidden />
            <span className="tabular-nums">#{myLeaderboard.rank}</span>
            <span className="text-white/50">·</span>
            <span className="tabular-nums text-white">{myLeaderboard.score}</span>
          </span>
        ) : null}
        {current?.body ? (
          <Countdown
            timerSeconds={timerSeconds}
            timerStartedAtMs={timerStartedAtMs}
            locked={lockedForActive}
            size="md"
          />
        ) : null}
      </div>
    </>
  );

  const showChoices = !!current?.choices?.length && !pausedAt && !completed;

  return (
    <GameShell venueImageUrl={venueImageUrl} topBar={topBar}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <section
          className={cn(
            "relative rounded-3xl bg-[var(--stage-glass)] p-8 md:p-10",
            "ring-1 ring-white/10 backdrop-blur-xl",
            "shadow-[var(--shadow-hero)]",
          )}
        >
          <AnimatePresence mode="wait">
            {pausedAt ? (
              <motion.div
                key="paused"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="flex flex-col items-center gap-3 py-8 text-center"
              >
                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-200/90">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-300" />
                  </span>
                  Paused
                </span>
                <p className="max-w-md text-lg text-white/80">
                  The host has paused the game. Hang tight…
                </p>
              </motion.div>
            ) : current?.body ? (
              <motion.h1
                key={activeQid ?? "q"}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="text-balance text-3xl font-semibold leading-[1.15] tracking-tight text-white md:text-4xl"
              >
                {current.body}
              </motion.h1>
            ) : completed ? (
              <motion.div
                key="completed"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="py-2"
              >
                <FinalStandings
                  variant="phone"
                  leaderboard={boot?.leaderboard ?? []}
                  viewerPlayerId={playerId ?? null}
                />
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center gap-3 py-6 text-center"
              >
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/60 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white/80" />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">
                  Waiting for the host…
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {showChoices ? (
          <div className="grid gap-3 md:grid-cols-2">
            {current!.choices.map((c, i) => {
              const style = ANSWER_STYLES[i % ANSWER_STYLES.length];
              const isPicked = picked === c;
              const isCorrect = correctChoice != null && correctChoice === c;
              const isWrongPick = correctChoice != null && isPicked && correctChoice !== c;
              const showSpinner = isPicked && submitting && !revealedForActive;
              return (
                <motion.button
                  key={`${activeQid ?? "q"}-${i}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => submitAnswer(c)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: i * 0.04, ease: "easeOut" }}
                  aria-pressed={isPicked}
                  className={cn(
                    "group relative flex items-center gap-3 overflow-hidden rounded-2xl px-5 py-5 text-left text-lg font-semibold text-white",
                    "ring-1 ring-white/15 shadow-[var(--shadow-card)]",
                    "transition-all duration-200",
                    style.bg,
                    !disabled && "hover:scale-[1.015] hover:ring-white/30",
                    isPicked &&
                      "scale-[1.03] ring-2 ring-white/70 shadow-[var(--shadow-hero)]",
                    isWrongPick && "opacity-50 saturate-50",
                    disabled && !isPicked && !isCorrect && "opacity-80",
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
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 ring-1 ring-white/20"
                    aria-hidden
                  >
                    <ChoiceShape shape={style.shape} />
                  </span>
                  <span className="flex-1 leading-snug">{c}</span>
                  {showSpinner ? (
                    <Loader2 className="h-5 w-5 animate-spin text-white/90" aria-hidden />
                  ) : (
                    <span className="text-sm font-bold opacity-80">{style.label}</span>
                  )}
                </motion.button>
              );
            })}
          </div>
        ) : null}

        <div aria-live="polite" className="flex flex-col items-center gap-2">
          {lockedForActive && !revealedForActive && !pausedAt ? (
            <motion.span
              key="locked"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(PILL_CLASSES, "text-white/80")}
            >
              <Lock className="h-3 w-3" aria-hidden />
              Answers locked · awaiting reveal
            </motion.span>
          ) : null}

          {revealedForActive ? (
            <motion.div
              key="revealed"
              initial={{ opacity: 0, y: 6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className={cn(
                "flex flex-col items-center gap-2 rounded-2xl px-6 py-4 text-center",
                "bg-[var(--stage-glass)] ring-1 ring-white/10 backdrop-blur-md",
                "shadow-[var(--shadow-card)]",
              )}
            >
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60">
                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--answer-emerald)]" aria-hidden />
                Answer
              </span>
              <div className="text-xl font-semibold text-white">
                {current?.correctAnswer ?? "—"}
              </div>
            </motion.div>
          ) : null}
        </div>
      </div>
    </GameShell>
  );
}
