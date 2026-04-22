"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2, Lock, Trophy, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ANSWER_STYLES,
  answerCardStyle,
  answerTopStripeStyle,
  PILL_CLASSES,
} from "@/components/game/answerStyles";
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
  runMode?: string;
  houseGame?: boolean;
  pausedAt?: string | null;
  venueSlug?: string | null;
  venueDisplayName?: string | null;
  venueImageUpdatedAt?: string | null;
  venueHasImage?: boolean;
  /**
   * Optional Zoom / Teams / Meet link for online games. Only present
   * once the player has joined (the upcoming-games listing never
   * surfaces it).
   */
  onlineMeetingUrl?: string | null;
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

  // Viewer-driven autopilot heartbeat. For house / autopilot sessions the
  // server state machine is nominally advanced by the Vercel cron (
  // `/api/cron/autopilot-tick`, once per minute). That cadence is too slow
  // for per-question timers and doesn't run at all in local dev — so while
  // at least one player has the page open we poke the single-session
  // public tick endpoint every 2 s. `advanceAutopilotSession` is idempotent
  // on the server, so concurrent pokes from multiple viewers are safe.
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
        // Transient network blips are fine — the next interval catches up.
      }
    };
    void tick();
    const h = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(h);
    };
  }, [joinCode, isAutopilot, sessionActive]);

  // Proactive tick poke at countdown zero. The 2 s interval above is fine
  // for the "advance after 3 s hold" transition, but it meant reveals
  // could lag up to ~2 s behind the user's visible countdown. This
  // schedules a single immediate poke + bootstrap refresh at the moment
  // the question deadline elapses so the reveal feels instant — the
  // server action is idempotent, so overlapping pokes are harmless.
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

  // Post-session unlock toasts. Fire once per (sessionId) when the client
  // first sees `completed` — `tryGrantAchievementsAfterSession` already
  // ran server-side by then, so `/new-achievements` can cheaply report
  // what this viewer just unlocked.
  const sessionId = boot?.sessionId ?? null;
  const announcedAchievementsForSessionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!completed || !sessionId) return;
    if (announcedAchievementsForSessionRef.current === sessionId) return;
    announcedAchievementsForSessionRef.current = sessionId;
    // Survive a page reload on the same completed session — `sessionStorage`
    // is scoped to this tab, which matches our "one toast stream per
    // game attendance" semantics.
    const storageKey = `trivia.announced.achievements.${sessionId}`;
    try {
      if (sessionStorage.getItem(storageKey)) return;
    } catch {
      // private mode / storage disabled → fall through and just toast.
    }
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `/api/game/sessions/${sessionId}/new-achievements`,
          { signal: ac.signal, cache: "no-store" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          achievements?: Array<{
            slug: string;
            title: string;
            description?: string | null;
          }>;
        };
        const list = data.achievements ?? [];
        if (list.length === 0) return;
        try {
          sessionStorage.setItem(storageKey, "1");
        } catch {
          /* noop */
        }
        list.forEach((a, i) => {
          // Stagger so a big unlock dump doesn't pile into a single
          // toast stack — this way the player actually sees each one.
          setTimeout(() => {
            toast.success(`Achievement unlocked: ${a.title}`, {
              description: a.description ?? undefined,
              duration: 6000,
            });
          }, i * 900);
        });
      } catch {
        // Non-fatal; the achievements still exist on the profile.
      }
    })();
    return () => ac.abort();
  }, [completed, sessionId]);

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

  // House games are Trivia.Box-owned and don't live at a real venue, so we
  // swap the backdrop to the product logo (matching solo). Everything else
  // (display name, online meeting URL, etc.) still flows through the normal
  // bootstrap fields.
  const venueImageUrl = boot?.houseGame
    ? "/logo.png"
    : buildVenueImageUrl(boot ?? {});

  const myLeaderboard = useMemo(() => {
    if (!playerId || !boot?.leaderboard?.length) return null;
    const idx = boot.leaderboard.findIndex((e) => e.playerId === playerId);
    if (idx < 0) return null;
    return { rank: idx + 1, score: boot.leaderboard[idx].score };
  }, [boot?.leaderboard, playerId]);

  // Viewer's username comes straight off the leaderboard row (already keyed
  // by playerId). Gives `FinalStandings` the `/u/<username>` deep link so
  // the end-of-game screen isn't a single exit ramp back to `/play`.
  const viewerUsername = useMemo(() => {
    if (!playerId || !boot?.leaderboard?.length) return null;
    return (
      boot.leaderboard.find((e) => e.playerId === playerId)?.username ?? null
    );
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
        {boot?.onlineMeetingUrl ? (
          <a
            href={boot.onlineMeetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              PILL_CLASSES,
              "text-sky-200 hover:text-sky-100 hover:ring-sky-400/60"
            )}
            aria-label="Open online meeting"
          >
            <Video className="h-3 w-3" aria-hidden />
            Meeting
          </a>
        ) : null}
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
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 md:gap-5">
        <section
          className={cn(
            "relative rounded-3xl bg-[var(--stage-glass)] px-6 py-5 md:px-8 md:py-6",
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
                className="flex flex-col items-center gap-3 py-6 text-center"
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
                // Fluid clamp keeps the question readable on phones while
                // preventing a long prompt from eating the whole viewport on
                // a typical laptop (≈1024x768/900). 1.2 → 2 rem maps to
                // 19px → 32px without hitting the old 3xl/4xl breakpoints
                // that were pushing answer buttons below the fold.
                className="text-balance font-semibold leading-[1.2] tracking-tight text-white [font-size:clamp(1.2rem,1.6vw+0.8rem,2rem)]"
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
                  profileHref={
                    viewerUsername
                      ? `/u/${encodeURIComponent(viewerUsername)}`
                      : null
                  }
                  shareUrl={
                    boot?.sessionId ? `/r/session/${boot.sessionId}` : null
                  }
                  shareTitle={
                    boot?.venueDisplayName
                      ? `${boot.venueDisplayName} trivia recap`
                      : "Trivia.Box recap"
                  }
                  venueSlug={boot?.venueSlug ?? null}
                  venueDisplayName={boot?.venueDisplayName ?? null}
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
          // `auto-rows-fr` forces both grid rows to the same track size so
          // the taller of A/B/C/D pushes every other cell up to match. Paired
          // with `h-full` on the buttons this gives four perfectly
          // symmetrical tiles regardless of text length — no more lopsided
          // bottom row when one answer is 3 lines and its neighbour is 1.
          <div className="grid auto-rows-fr gap-3 md:grid-cols-2">
            {current!.choices.map((c, i) => {
              const style = ANSWER_STYLES[i % ANSWER_STYLES.length]!;
              const isPicked = picked === c;
              const isCorrect = correctChoice != null && correctChoice === c;
              const isWrongPick = correctChoice != null && isPicked && correctChoice !== c;
              const showSpinner = isPicked && submitting && !revealedForActive;
              const state = isCorrect
                ? "correct"
                : isWrongPick
                  ? "wrong"
                  : isPicked
                    ? "picked"
                    : "default";
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
                  style={answerCardStyle({ tone: style.tone, state })}
                  className={cn(
                    "group relative flex h-full min-h-[4.5rem] items-center gap-3 overflow-hidden rounded-2xl border px-5 py-4 text-left text-base font-semibold text-white md:text-lg",
                    "transition-all duration-200",
                    !disabled && "hover:-translate-y-0.5",
                    isPicked && "scale-[1.02]",
                    disabled && !isPicked && !isCorrect && "opacity-80",
                    "disabled:cursor-not-allowed",
                  )}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-px"
                    style={answerTopStripeStyle({ tone: style.tone })}
                  />
                  {isCorrect ? (
                    <motion.span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-2xl"
                      style={{
                        boxShadow: `inset 0 0 0 2px color-mix(in oklab, ${style.tone} 90%, transparent)`,
                      }}
                      animate={{ opacity: [0.55, 1, 0.55] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                    />
                  ) : null}
                  <span className="flex-1 leading-snug">{c}</span>
                  {showSpinner ? (
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin text-white/90" aria-hidden />
                  ) : (
                    <span
                      className="shrink-0 text-sm font-bold tracking-[0.2em]"
                      style={{ color: `color-mix(in oklab, ${style.tone} 80%, white)` }}
                    >
                      {style.label}
                    </span>
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
