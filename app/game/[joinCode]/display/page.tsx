"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Crown, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Countdown } from "@/components/game/Countdown";
import { FinalStandings } from "@/components/game/FinalStandings";
import { GameShell, buildVenueImageUrl } from "@/components/game/GameShell";
import {
  ANSWER_STYLES,
  answerCardStyle,
  answerTopStripeStyle,
} from "@/components/game/answerStyles";
import { useGameChannel } from "@/lib/ably/useGameChannel";

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
  status?: string;
  runMode?: string;
  houseGame?: boolean;
  pausedAt?: string | null;
  currentQuestion?: BootstrapQuestion | null;
  venueSlug?: string | null;
  venueImageUpdatedAt?: string | null;
  venueDisplayName?: string | null;
  venueHasImage?: boolean;
  leaderboard?: LeaderboardEntry[];
  totalQuestions?: number;
  completedCount?: number;
  error?: string;
};

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

const MEDAL_RING = [
  "ring-2 ring-amber-300/80 shadow-[0_0_40px_-10px_rgb(252_211_77_/_0.6)]",
  "ring-2 ring-slate-200/70 shadow-[0_0_40px_-12px_rgb(226_232_240_/_0.55)]",
  "ring-2 ring-orange-400/70 shadow-[0_0_40px_-12px_rgb(251_146_60_/_0.55)]",
];

export default function DisplayPage() {
  const routeParams = useParams<{ joinCode: string }>();
  const joinCode = String(routeParams.joinCode ?? "").toUpperCase();
  const { messages } = useGameChannel(joinCode);

  const [boot, setBoot] = useState<BootstrapResponse | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const refreshBootstrap = useCallback(async () => {
    if (joinCode.length !== 6) return;
    if (inFlightRef.current) return inFlightRef.current;
    const p = (async () => {
      try {
        const res = await fetch(
          `/api/game/public/session?code=${encodeURIComponent(joinCode)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as BootstrapResponse;
        setBoot(data);
      } catch {
        /* ignore */
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

  // Viewer-driven autopilot heartbeat — see the matching comment on the
  // hosted play page for the full rationale. The display screen acts as a
  // viewer for this purpose: as long as it's open, the house / autopilot
  // game keeps advancing even when the Vercel cron isn't running (dev) or
  // is trailing by up to a minute (prod).
  const isAutopilot = boot?.runMode === "autopilot";
  const sessionActive = boot?.status === "active";
  useEffect(() => {
    if (!joinCode || !isAutopilot || !sessionActive) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        await fetch("/api/game/public/autopilot-tick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ joinCode }),
          cache: "no-store",
        });
      } catch {
        /* Transient network blip — the next interval catches up. */
      }
    };
    void tick();
    const h = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(h);
    };
  }, [joinCode, isAutopilot, sessionActive]);

  // Proactive tick poke at countdown zero (display mirror of the
  // hosted play page). Collapses the otherwise ~0–2 s poll jitter so
  // the reveal flashes up on the big screen the instant the timer
  // hits 0 instead of on the next heartbeat.
  const activeQuestionStartMs = boot?.currentQuestion?.status === "active"
    ? boot?.currentQuestion?.timerStartedAtMs ?? null
    : null;
  const activeQuestionSeconds = boot?.currentQuestion?.status === "active"
    ? boot?.currentQuestion?.timerSeconds ?? null
    : null;
  useEffect(() => {
    if (!joinCode || !isAutopilot || !sessionActive) return;
    if (!activeQuestionStartMs || !activeQuestionSeconds) return;
    const deadlineMs = activeQuestionStartMs + activeQuestionSeconds * 1000;
    const waitMs = deadlineMs - Date.now();
    if (waitMs < -5000) return;
    const fire = async () => {
      try {
        await fetch("/api/game/public/autopilot-tick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ joinCode }),
          cache: "no-store",
        });
      } catch {
        /* swallow */
      }
      void refreshBootstrap();
    };
    if (waitMs <= 0) {
      void fire();
      return;
    }
    const h = setTimeout(() => void fire(), waitMs);
    return () => clearTimeout(h);
  }, [
    joinCode,
    isAutopilot,
    sessionActive,
    activeQuestionStartMs,
    activeQuestionSeconds,
    refreshBootstrap,
  ]);

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
  const leaderboard = boot?.leaderboard ?? [];
  const paused = !!boot?.pausedAt;

  // Between questions — no current question or answer just revealed — show
  // the scoreboard in big format so the room gets the payoff moment.
  const showLeaderboard = !current?.body || revealedForActive;

  // House games don't map to a real venue — swap the backdrop to the product
  // logo so the big-screen view doesn't inherit some random venue's photo.
  const venueImageUrl = boot?.houseGame
    ? "/logo.png"
    : buildVenueImageUrl({
        venueSlug: boot?.venueSlug,
        venueHasImage: boot?.venueHasImage,
        venueImageUpdatedAt: boot?.venueImageUpdatedAt,
      });

  const completedCount = boot?.completedCount ?? 0;
  const totalQuestions = boot?.totalQuestions ?? 0;

  const topBar = (
    <>
      <div className="flex flex-col gap-1">
        <div className="text-xs font-semibold uppercase tracking-[0.4em] text-white/70">
          Trivia.Box
        </div>
        <div className="flex items-baseline gap-6">
          {boot?.venueDisplayName ? (
            <div className="text-2xl font-bold leading-none">{boot.venueDisplayName}</div>
          ) : null}
          <div className="flex items-baseline gap-3">
            <span className="text-sm uppercase tracking-[0.3em] text-white/60">Join code</span>
            <span className="text-3xl font-mono font-black tracking-widest text-white">
              {joinCode}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center">
        {current?.body && !showLeaderboard ? (
          <Countdown
            timerSeconds={current.timerSeconds}
            timerStartedAtMs={current.timerStartedAtMs}
            locked={lockedForActive}
            size="xl"
          />
        ) : totalQuestions > 0 ? (
          <div className="flex items-center gap-3 rounded-full bg-[var(--stage-glass)] px-6 py-3 ring-1 ring-white/15 backdrop-blur-xl">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
              Question
            </span>
            <span className="font-mono text-2xl font-black tabular-nums text-white">
              {Math.min(completedCount, totalQuestions)}
              <span className="text-white/40"> / </span>
              {totalQuestions}
            </span>
          </div>
        ) : null}
      </div>
    </>
  );

  return (
    <GameShell
      venueImageUrl={venueImageUrl}
      topBar={topBar}
      className="max-w-7xl px-10 py-10"
      topBarClassName="px-10 py-6"
    >
      <div className="flex min-h-full flex-col">
        <AnimatePresence mode="wait">
          {paused ? (
            <motion.div
              key="paused"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="m-auto flex flex-col items-center gap-6 rounded-[2rem] bg-[var(--stage-glass)] px-20 py-16 text-center shadow-[var(--shadow-hero)] ring-1 ring-white/15 backdrop-blur-2xl"
            >
              <motion.div
                animate={{ opacity: [0.55, 1, 0.55], scale: [0.95, 1.05, 0.95] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-[var(--stage-accent)] ring-1 ring-white/15"
              >
                <Sparkles className="h-10 w-10" />
              </motion.div>
              <div className="text-sm font-semibold uppercase tracking-[0.4em] text-[var(--stage-accent)]">
                Paused
              </div>
              <div className="text-6xl font-black leading-none tracking-tight text-white drop-shadow-xl">
                Game Paused
              </div>
              <div className="text-lg uppercase tracking-[0.3em] text-white/60">
                Waiting for the host to resume
              </div>
            </motion.div>
          ) : boot?.status === "completed" ? (
            /* Terminal state: show the shared end card before any live-leaderboard
               / question branches so the TV never falls back to the generic
               "Live Results" panel once the game is over. */
            <motion.div
              key="completed"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="m-auto w-full max-w-5xl"
            >
              <FinalStandings
                variant="big-screen"
                leaderboard={boot?.leaderboard ?? []}
              />
            </motion.div>
          ) : showLeaderboard && leaderboard.length > 0 ? (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -24 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto w-full max-w-5xl"
            >
              <div className="mb-8 flex items-baseline justify-between">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.4em] text-white/60">
                    Live Results
                  </div>
                  <div className="mt-2 text-6xl font-black tracking-tight text-white drop-shadow-xl">
                    Standings
                  </div>
                </div>
                <div className="text-sm uppercase tracking-[0.3em] text-white/40">
                  Top {Math.min(10, leaderboard.length)}
                </div>
              </div>

              <ol className="space-y-3">
                {leaderboard.slice(0, 10).map((row, idx) => {
                  const medalRing = idx < 3 ? MEDAL_RING[idx] : "ring-1 ring-white/15";
                  return (
                    <motion.li
                      key={row.playerId}
                      layout
                      initial={{ opacity: 0, x: -24 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        layout: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
                        opacity: { duration: 0.4, delay: idx * 0.06 },
                        x: { duration: 0.5, delay: idx * 0.06, ease: "easeOut" },
                      }}
                      className={`flex items-center justify-between rounded-2xl bg-[var(--stage-glass)] px-6 py-5 shadow-[var(--shadow-card)] backdrop-blur-xl ${medalRing}`}
                    >
                      <div className="flex items-center gap-6">
                        <div className="flex w-16 items-center justify-center">
                          {idx === 0 ? (
                            <Crown
                              className="h-10 w-10 text-amber-300 drop-shadow-[0_0_12px_rgb(252_211_77_/_0.65)]"
                              aria-hidden
                            />
                          ) : (
                            <span
                              className={`font-mono text-4xl font-black tabular-nums ${
                                idx === 1
                                  ? "text-slate-200"
                                  : idx === 2
                                    ? "text-orange-300"
                                    : "text-white/40"
                              }`}
                            >
                              {idx + 1}
                            </span>
                          )}
                        </div>
                        <span className="text-3xl font-bold tracking-tight text-white">
                          {row.username}
                        </span>
                      </div>
                      <span className="font-mono text-4xl font-black tabular-nums text-[var(--stage-accent)]">
                        {row.score}
                      </span>
                    </motion.li>
                  );
                })}
              </ol>
            </motion.div>
          ) : current?.body ? (
            <motion.div
              key={`q-${activeQid}`}
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -32 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-1 flex-col gap-12"
            >
              <div className="text-sm font-semibold uppercase tracking-[0.4em] text-white/60">
                Question
                {totalQuestions > 0
                  ? ` ${Math.min(completedCount + 1, totalQuestions)} of ${totalQuestions}`
                  : ""}
              </div>

              <div className="text-5xl font-black leading-[1.05] tracking-tight text-white drop-shadow-xl md:text-7xl">
                {current.body}
              </div>

              {current.choices?.length ? (
                <div className="grid grid-cols-2 gap-6">
                  {current.choices.map((c, idx) => {
                    const style = ANSWER_STYLES[idx % ANSWER_STYLES.length]!;
                    const isCorrect = revealedForActive && current.correctAnswer === c;
                    const isWrongRevealed = revealedForActive && !isCorrect;
                    const state = isCorrect
                      ? "correct"
                      : isWrongRevealed
                        ? "wrong"
                        : "default";
                    return (
                      <div key={`${c}-${idx}`} className="relative">
                        <div
                          style={answerCardStyle({ tone: style.tone, state })}
                          className={`relative flex items-center gap-8 overflow-hidden rounded-3xl border px-10 py-10 transition-[filter,opacity,transform] duration-500 md:py-12 ${
                            isCorrect ? "scale-[1.02]" : ""
                          } ${isWrongRevealed ? "opacity-40" : ""}`}
                        >
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-x-0 top-0 h-px"
                            style={answerTopStripeStyle({ tone: style.tone })}
                          />
                          {isCorrect ? (
                            <motion.span
                              aria-hidden
                              className="pointer-events-none absolute inset-0 rounded-3xl"
                              style={{
                                boxShadow: `inset 0 0 0 3px color-mix(in oklab, ${style.tone} 95%, transparent)`,
                              }}
                              animate={{ opacity: [0.55, 1, 0.7, 1, 0.6] }}
                              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                            />
                          ) : null}
                          <span className="flex-1 text-4xl font-bold leading-tight text-white drop-shadow md:text-5xl">
                            {c}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="m-auto flex flex-col items-center gap-8 text-center"
            >
              <motion.span
                aria-hidden
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.9, 1.15, 0.9] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                className="inline-block h-4 w-4 rounded-full bg-[var(--stage-accent)] shadow-[0_0_24px_rgb(56_189_248_/_0.7)]"
              />
              <div className="text-6xl font-black tracking-tight text-white drop-shadow-xl">
                Waiting for the host…
              </div>
              <div className="text-sm uppercase tracking-[0.4em] text-white/60">
                The show is about to begin
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GameShell>
  );
}
