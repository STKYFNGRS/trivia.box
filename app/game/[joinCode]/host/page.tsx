"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronRight,
  Eye,
  Flag,
  Lock,
  Pause,
  Play,
  Trophy,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Countdown } from "@/components/game/Countdown";
import { FinalStandings } from "@/components/game/FinalStandings";
import { GameShell } from "@/components/game/GameShell";
import { useGameChannel } from "@/lib/ably/useGameChannel";
import type { GameChannelMessage } from "@/lib/ably/useGameChannel";
import { cn } from "@/lib/utils";

// Keep in sync with `AUTOPILOT_POST_LOCK_MS` in `lib/game/hostActions.ts`.
// Collapsed to 0 — the client-side hybrid auto-advance preview goes
// straight from lock to reveal, matching the server-side autopilot
// behaviour that now fires the reveal the instant the countdown hits 0.
const POST_LOCK_MS = 0;
// Keep in sync with `AUTOPILOT_POST_REVEAL_MS` in `lib/game/hostActions.ts`.
// 3s gives players enough of a beat to actually read the revealed answer
// before the screen flips to the next question.
const POST_REVEAL_MS = 3000;

const TIMELINE_MAX = 20;

const ANSWER_TINTS = [
  "bg-[var(--answer-rose)]/15 ring-[var(--answer-rose)]/40 text-white",
  "bg-[var(--answer-sky)]/15 ring-[var(--answer-sky)]/40 text-white",
  "bg-[var(--answer-amber)]/15 ring-[var(--answer-amber)]/40 text-white",
  "bg-[var(--answer-emerald)]/15 ring-[var(--answer-emerald)]/40 text-white",
] as const;

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

type PublicSessionJson = {
  sessionId?: string;
  status?: string;
  runMode?: string;
  timerMode?: string;
  secondsPerQuestion?: number | null;
  pausedAt?: string | null;
  currentQuestion?: BootstrapQuestion | null;
  totalQuestions?: number;
  completedCount?: number;
  leaderboard?: LeaderboardEntry[];
  error?: string;
};

type AnswerReceivedPayload = {
  sessionQuestionId?: string;
  answeredCount?: number;
  totalPlayers?: number;
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

function lastMessageNamed(messages: GameChannelMessage[], name: string): GameChannelMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].name === name) return messages[i];
  }
  return null;
}

/** Extracts the wall-clock timestamp encoded by `useGameChannel` into the message id
 *  (format: `${timestamp}-${counter}`). Returns `null` if unparsable. */
function timestampFromId(id: string): number | null {
  const dash = id.indexOf("-");
  if (dash <= 0) return null;
  const n = Number(id.slice(0, dash));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatRelative(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

type TimelineIcon = typeof Flag;

function timelineVisual(name: string): { Icon: TimelineIcon; label: string; tone: string } {
  switch (name) {
    case "game_launched":
      return { Icon: Flag, label: "Game launched", tone: "text-sky-300" };
    case "question_started":
      return { Icon: Play, label: "Question started", tone: "text-emerald-300" };
    case "answer_received":
      return { Icon: UserCheck, label: "Answer received", tone: "text-white/70" };
    case "answers_locked":
      return { Icon: Lock, label: "Answers locked", tone: "text-amber-300" };
    case "answer_revealed":
      return { Icon: Eye, label: "Answer revealed", tone: "text-[var(--stage-accent)]" };
    case "game_paused":
      return { Icon: Pause, label: "Paused", tone: "text-amber-300" };
    case "game_resumed":
      return { Icon: Play, label: "Resumed", tone: "text-emerald-300" };
    case "game_completed":
      return { Icon: Trophy, label: "Game complete", tone: "text-yellow-300" };
    default:
      return { Icon: Flag, label: name, tone: "text-white/60" };
  }
}

function GlassPill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-[var(--stage-glass)] px-2.5 py-1 text-xs uppercase tracking-widest ring-1 ring-white/10 backdrop-blur-md",
        className,
      )}
    >
      {children}
    </span>
  );
}

function ThinProgress({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-white/10",
        className,
      )}
    >
      <div
        className="h-full rounded-full bg-[var(--stage-accent)] transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function AutopilotStripe({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden rounded-full",
        className,
      )}
    >
      <div
        className="absolute inset-y-0 -left-1/2 w-1/2 animate-[autopilot-sweep_2.4s_linear_infinite]"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgb(255 255 255 / 0.35) 50%, transparent 100%)",
        }}
      />
      <style>{`@keyframes autopilot-sweep { 0% { transform: translateX(0%); } 100% { transform: translateX(400%); } }`}</style>
    </div>
  );
}

export default function HostPage() {
  const routeParams = useParams<{ joinCode: string }>();
  const joinCode = String(routeParams.joinCode ?? "").toUpperCase();
  const searchParams = useSearchParams();
  const sessionIdFromUrl = searchParams.get("sessionId");

  const { messages, connectionState } = useGameChannel(joinCode);

  const [boot, setBoot] = useState<PublicSessionJson | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [resolvedSessionId, setResolvedSessionId] = useState<string | null>(sessionIdFromUrl);

  const pageStartRef = useRef<number>(Date.now());

  const inFlightRef = useRef<Promise<PublicSessionJson | null> | null>(null);
  const refreshBootstrap = useCallback(async (): Promise<PublicSessionJson | null> => {
    if (!joinCode || joinCode.length !== 6) return null;
    if (inFlightRef.current) return inFlightRef.current;
    const p = (async () => {
      try {
        const res = await fetch(
          `/api/game/public/session?code=${encodeURIComponent(joinCode)}`,
          { cache: "no-store" }
        );
        const data = (await res.json()) as PublicSessionJson;
        if (!res.ok) {
          setBootError(typeof data.error === "string" ? data.error : "Could not load session");
          return null;
        }
        setBootError(null);
        setBoot(data);
        return data;
      } catch {
        setBootError("Could not load session");
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

  // Ably → invalidate bootstrap (same pattern as the play page).
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

  // Fallback: if `?sessionId` is missing, resolve via by-code so shared host
  // URLs keep working. The server endpoint is host-gated so only the actual
  // host can do this.
  useEffect(() => {
    if (resolvedSessionId) return;
    if (!joinCode || joinCode.length !== 6) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/game/sessions/by-code?code=${encodeURIComponent(joinCode)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as { sessionId?: string };
        if (!cancelled && data.sessionId) {
          setResolvedSessionId(data.sessionId);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedSessionId, joinCode]);

  const answered = useMemo(() => {
    const msg = lastMessageNamed(messages, "answer_received");
    return msg?.data as AnswerReceivedPayload | undefined;
  }, [messages]);

  const current = boot?.currentQuestion ?? null;
  const activeQid = current?.sessionQuestionId ?? null;
  const lockedForActive = current?.status === "locked" || current?.status === "revealed";
  const revealedForActive = current?.status === "revealed";
  const answeredForActive =
    activeQid && answered?.sessionQuestionId === activeQid ? answered : undefined;

  const sessionIdMismatch =
    sessionIdFromUrl && boot?.sessionId && sessionIdFromUrl !== boot.sessionId;

  const effectiveSessionId = resolvedSessionId ?? boot?.sessionId ?? null;

  const [busy, setBusy] = useState(false);
  const autopilotRunIdRef = useRef(0);
  const timeoutHandlesRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const manualRevealDoneForSqIdRef = useRef<string | null>(null);

  const invalidateAutopilot = useCallback(() => {
    autopilotRunIdRef.current += 1;
    for (const t of timeoutHandlesRef.current) clearTimeout(t);
    timeoutHandlesRef.current = [];
  }, []);

  useEffect(() => {
    manualRevealDoneForSqIdRef.current = null;
  }, [joinCode, effectiveSessionId]);

  const pushTimeout = useCallback((h: ReturnType<typeof setTimeout>) => {
    timeoutHandlesRef.current.push(h);
  }, []);

  const callHost = useCallback(
    async (
      action: "start" | "lock" | "reveal" | "next" | "pause" | "resume",
      opts?: { silent?: boolean }
    ): Promise<boolean> => {
      if (!effectiveSessionId) {
        if (!opts?.silent) toast.error("Missing sessionId — resync the tab");
        return false;
      }
      if (!opts?.silent) setBusy(true);
      try {
        const res = await fetch(`/api/game/sessions/${effectiveSessionId}/host`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const data = (await res.json()) as { error?: unknown };
        if (!res.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "Request failed");
        }
        return true;
      } catch (e) {
        if (!opts?.silent) {
          toast.error(e instanceof Error ? e.message : "Request failed");
        }
        return false;
      } finally {
        if (!opts?.silent) setBusy(false);
      }
    },
    [effectiveSessionId]
  );

  const runRevealThenNext = useCallback(
    async (runId: number) => {
      const okReveal = await callHost("reveal", { silent: true });
      if (runId !== autopilotRunIdRef.current || !okReveal) return;
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, POST_REVEAL_MS);
        pushTimeout(t);
      });
      if (runId !== autopilotRunIdRef.current) return;
      await callHost("next", { silent: true });
    },
    [callHost, pushTimeout]
  );

  useEffect(() => {
    return () => invalidateAutopilot();
  }, [joinCode, effectiveSessionId, invalidateAutopilot]);

  // Autopilot (auto/hybrid): timed lock after timer expires, then reveal → next.
  useEffect(() => {
    if (sessionIdMismatch || !effectiveSessionId || !boot) return;
    if (boot.runMode !== "autopilot") return;
    if (boot.timerMode === "manual") return;
    if (boot.pausedAt) return;
    if (!current || current.status !== "active") return;

    invalidateAutopilot();
    const runId = autopilotRunIdRef.current;

    const timerSeconds =
      typeof current.timerSeconds === "number"
        ? current.timerSeconds
        : boot.secondsPerQuestion ?? 0;
    const startedAt = current.timerStartedAtMs ?? Date.now();
    const deadlineMs = startedAt + Math.max(0, timerSeconds) * 1000;
    const lockDelayMs = Math.max(0, deadlineMs - Date.now());

    const isHybrid = boot.timerMode === "hybrid";
    const t0 = setTimeout(async () => {
      if (runId !== autopilotRunIdRef.current) return;
      const okLock = await callHost("lock", { silent: true });
      if (runId !== autopilotRunIdRef.current || !okLock) return;
      // Hybrid: we lock on the timer but wait for the host to reveal / advance.
      if (isHybrid) return;
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, POST_LOCK_MS);
        pushTimeout(t);
      });
      if (runId !== autopilotRunIdRef.current) return;
      await runRevealThenNext(runId);
    }, lockDelayMs);
    pushTimeout(t0);

    return () => invalidateAutopilot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    current?.sessionQuestionId,
    current?.status,
    current?.timerStartedAtMs,
    current?.timerSeconds,
    boot?.runMode,
    boot?.timerMode,
    boot?.secondsPerQuestion,
    boot?.pausedAt,
    effectiveSessionId,
    sessionIdMismatch,
    callHost,
    runRevealThenNext,
    pushTimeout,
    invalidateAutopilot,
  ]);

  // Autopilot (manual timer): after host clicks Lock, auto reveal → next.
  useEffect(() => {
    if (sessionIdMismatch || !effectiveSessionId || !boot) return;
    if (boot.runMode !== "autopilot" || boot.timerMode !== "manual") return;
    if (boot.pausedAt) return;
    if (!current || current.status !== "locked") return;

    const sqId = current.sessionQuestionId;
    if (manualRevealDoneForSqIdRef.current === sqId) return;
    manualRevealDoneForSqIdRef.current = sqId;

    invalidateAutopilot();
    const runId = autopilotRunIdRef.current;
    void (async () => {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, POST_LOCK_MS);
        pushTimeout(t);
      });
      if (runId !== autopilotRunIdRef.current) return;
      await runRevealThenNext(runId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    current?.sessionQuestionId,
    current?.status,
    boot?.runMode,
    boot?.timerMode,
    boot?.pausedAt,
    effectiveSessionId,
    sessionIdMismatch,
    invalidateAutopilot,
    runRevealThenNext,
    pushTimeout,
  ]);

  const onManualHostAction = useCallback(
    (action: "start" | "lock" | "reveal" | "next" | "pause" | "resume") => {
      invalidateAutopilot();
      void callHost(action);
    },
    [invalidateAutopilot, callHost]
  );

  const autopilotOn = boot?.runMode === "autopilot" && !sessionIdMismatch;
  const paused = !!boot?.pausedAt;

  const connectionPillLabel =
    connectionState === "connected" || connectionState === "initialized"
      ? null
      : `Realtime: ${connectionState}`;

  const totalQuestions = typeof boot?.totalQuestions === "number" ? boot.totalQuestions : null;
  const completedCount = boot?.completedCount ?? 0;
  const progressPct =
    totalQuestions && totalQuestions > 0
      ? Math.min(100, Math.round((completedCount / totalQuestions) * 100))
      : 0;

  const currentQuestionNumber = totalQuestions
    ? Math.min(totalQuestions, completedCount + (current ? 1 : 0))
    : null;

  const answeredCount = answeredForActive?.answeredCount ?? 0;
  const totalPlayers =
    typeof answeredForActive?.totalPlayers === "number" ? answeredForActive.totalPlayers : null;
  const answerPct =
    totalPlayers && totalPlayers > 0 ? Math.round((answeredCount / totalPlayers) * 100) : 0;

  const runModeLabel = boot?.runMode
    ? `${boot.runMode.charAt(0).toUpperCase()}${boot.runMode.slice(1)}${
        boot?.timerMode ? ` · ${boot.timerMode}` : ""
      }`
    : null;

  const timeline = useMemo(() => {
    const slice = messages.slice(-TIMELINE_MAX).slice().reverse();
    return slice.map((m) => {
      const ts = timestampFromId(m.id) ?? pageStartRef.current;
      const rel = Math.max(0, ts - pageStartRef.current);
      return { message: m, relativeMs: rel };
    });
  }, [messages]);

  const topBar = (
    <div className="flex w-full items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/50">
            Host control
          </span>
          <span className="font-mono text-base font-semibold text-white">{joinCode}</span>
        </div>
        {totalQuestions ? (
          <GlassPill>
            <span className="text-white/60">Progress</span>
            <span className="font-mono normal-case tracking-normal text-white">
              {completedCount} / {totalQuestions}
            </span>
          </GlassPill>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {connectionPillLabel ? (
          <GlassPill className="text-amber-300">{connectionPillLabel}</GlassPill>
        ) : (
          <GlassPill className="text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_currentColor]" />
            Live
          </GlassPill>
        )}
        {runModeLabel ? (
          <GlassPill className={autopilotOn ? "text-[var(--stage-accent)]" : "text-white/70"}>
            {runModeLabel}
          </GlassPill>
        ) : null}
        {paused ? <GlassPill className="text-amber-300">Paused</GlassPill> : null}
        {current?.body ? (
          <Countdown
            timerSeconds={current.timerSeconds}
            timerStartedAtMs={current.timerStartedAtMs}
            locked={lockedForActive || revealedForActive}
            size="sm"
          />
        ) : null}
      </div>
    </div>
  );

  return (
    <GameShell plain topBar={topBar} className="max-w-6xl">
      <div className="grid w-full gap-4 lg:grid-cols-3">
        <section className="flex flex-col gap-4 lg:col-span-2">
          <div className="rounded-2xl bg-[var(--stage-glass)] p-4 ring-1 ring-white/10 shadow-[var(--shadow-card)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                  Question
                </span>
                <span className="font-mono text-sm text-white">
                  {currentQuestionNumber ?? "—"}
                  {totalQuestions ? (
                    <span className="text-white/40"> / {totalQuestions}</span>
                  ) : null}
                </span>
              </div>
              {autopilotOn ? (
                <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--stage-accent)]">
                  <span className="relative h-1.5 w-1.5 rounded-full bg-[var(--stage-accent)] shadow-[0_0_6px_currentColor]" />
                  Auto-advancing
                </span>
              ) : null}
            </div>
            <div className="relative mt-2">
              <ThinProgress value={progressPct} />
              {autopilotOn ? <AutopilotStripe /> : null}
            </div>
          </div>

          {bootError ? (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive ring-1 ring-destructive/30">
              {bootError}
            </div>
          ) : null}
          {sessionIdMismatch ? (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive ring-1 ring-destructive/30">
              This join code belongs to session{" "}
              <span className="font-mono">{boot?.sessionId}</span> but the URL has{" "}
              <span className="font-mono">{sessionIdFromUrl}</span>. Fix the{" "}
              <code className="rounded bg-black/30 px-1">sessionId</code> query param.
            </div>
          ) : null}
          {autopilotOn && boot?.timerMode === "manual" ? (
            <p className="text-xs text-white/60">
              Manual timer + autopilot: tap <strong className="text-white">Lock answers</strong>{" "}
              when ready; reveal and next run automatically.
            </p>
          ) : null}

          {boot?.status === "completed" ? (
            /* Completed session: swap the live question panel + control
               buttons for a shared FinalStandings card. Keeps the
               timeline visible in the aside so post-mortem review still
               works. */
            <div className="rounded-2xl bg-[var(--stage-glass)] p-5 ring-1 ring-white/10 shadow-[var(--shadow-card)] backdrop-blur-xl">
              <FinalStandings
                variant="host"
                leaderboard={boot?.leaderboard ?? []}
                shareUrl={
                  effectiveSessionId
                    ? `/r/session/${effectiveSessionId}`
                    : null
                }
                shareTitle="Trivia.Box recap"
              />
            </div>
          ) : (
            <>
              <div className="rounded-2xl bg-[var(--stage-glass)] p-5 ring-1 ring-white/10 shadow-[var(--shadow-card)] backdrop-blur-xl">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                      Current question
                    </div>
                    <div className="mt-2 text-xl font-semibold leading-snug text-white">
                      {current?.body ?? "—"}
                    </div>
                  </div>
                </div>

                {current?.choices?.length ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {current.choices.map((c, i) => {
                      const tint = ANSWER_TINTS[i % ANSWER_TINTS.length];
                      const isCorrect = revealedForActive && current.correctAnswer === c;
                      return (
                        <div
                          key={`${current.sessionQuestionId}-${i}-${c}`}
                          className={cn(
                            "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm ring-1",
                            tint,
                            isCorrect &&
                              "ring-2 ring-emerald-400/80 bg-emerald-400/20 shadow-[0_0_24px_-8px_theme(colors.emerald.400)]",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                              isCorrect
                                ? "bg-emerald-400 text-emerald-950"
                                : "bg-white/10 text-white/70",
                            )}
                          >
                            {isCorrect ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              String.fromCharCode(65 + i)
                            )}
                          </span>
                          <span className="flex-1 leading-snug">{c}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {answeredForActive ? (
                  <div className="mt-4 flex items-center gap-3">
                    <ThinProgress value={answerPct} className="flex-1" />
                    <div className="shrink-0 text-xs tabular-nums text-white/70">
                      <span className="font-semibold text-white">{answeredCount}</span>
                      {totalPlayers !== null ? (
                        <>
                          <span className="text-white/40"> / </span>
                          <span>{totalPlayers}</span>
                        </>
                      ) : null}
                      <span className="ml-1 text-white/50">answered</span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  disabled={busy || paused}
                  onClick={() => onManualHostAction("start")}
                >
                  <Play className="h-4 w-4" />
                  Start question
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || paused}
                  onClick={() => onManualHostAction("lock")}
                >
                  <Lock className="h-4 w-4" />
                  Lock answers
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || paused}
                  onClick={() => onManualHostAction("reveal")}
                >
                  <Eye className="h-4 w-4" />
                  Reveal
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || paused}
                  onClick={() => onManualHostAction("next")}
                >
                  <ChevronRight className="h-4 w-4" />
                  Next
                </Button>

                <div className="ml-auto flex items-center gap-2">
                  <Separator orientation="vertical" className="h-6 bg-white/15" />
                  {paused ? (
                    <Button
                      type="button"
                      variant="default"
                      disabled={busy}
                      onClick={() => onManualHostAction("resume")}
                    >
                      <Play className="h-4 w-4" />
                      Resume
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => onManualHostAction("pause")}
                    >
                      <Pause className="h-4 w-4" />
                      Pause
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="flex flex-col">
          <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-[var(--stage-glass)] ring-1 ring-white/10 shadow-[var(--shadow-card)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                Timeline
              </span>
              <span className="text-[10px] uppercase tracking-widest text-white/40">
                {timeline.length} event{timeline.length === 1 ? "" : "s"}
              </span>
            </div>
            <ol className="flex max-h-[560px] flex-col divide-y divide-white/5 overflow-y-auto">
              {timeline.length === 0 ? (
                <li className="px-4 py-6 text-center text-xs text-white/40">
                  Waiting for events…
                </li>
              ) : (
                timeline.map(({ message, relativeMs }) => {
                  const { Icon, label, tone } = timelineVisual(message.name);
                  const known = label !== message.name;
                  return (
                    <li
                      key={message.id}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm"
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", tone)} aria-hidden />
                      <span
                        className={cn(
                          "flex-1 truncate",
                          known ? "text-white/90" : "font-mono text-white/60",
                        )}
                      >
                        {label}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-white/40">
                        {formatRelative(relativeMs)}
                      </span>
                    </li>
                  );
                })
              )}
            </ol>
          </div>
        </aside>
      </div>
    </GameShell>
  );
}
