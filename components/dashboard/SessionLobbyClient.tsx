"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import {
  Calendar,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  MessageSquare,
  Play,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CancelSessionButton } from "@/components/dashboard/CancelSessionButton";
import { useGameChannel } from "@/lib/ably/useGameChannel";
import { cn } from "@/lib/utils";

export type LobbyPlayer = {
  playerId: string;
  username: string;
  joinedAt: string | null;
};

export type SessionLobbyInitial = {
  sessionId: string;
  joinCode: string;
  status: "pending" | "active" | "paused" | "completed" | "cancelled" | "draft";
  runMode: "hosted" | "autopilot";
  timerMode: "auto" | "manual" | "hybrid";
  eventStartsAt: string | null;
  eventTimezone: string | null;
  estimatedEndAt: string | null;
  hasPrize: boolean;
  prizeDescription: string | null;
  onlineMeetingUrl: string | null;
  players: LobbyPlayer[];
};

type PlayerJoinedPayload = {
  playerId?: unknown;
  username?: unknown;
  joinedAt?: unknown;
};

function formatStartLabel(iso: string | null, tz: string | null): string {
  if (!iso) return "No start time set";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz ?? undefined,
      timeZoneName: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

export function SessionLobbyClient({ initial }: { initial: SessionLobbyInitial }) {
  const router = useRouter();
  const [players, setPlayers] = useState<LobbyPlayer[]>(initial.players);
  const [launching, setLaunching] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const { messages, connectionState } = useGameChannel(initial.joinCode);
  const lastSeenIdx = useRef(0);

  /** Absolute-ish join URL the host can paste anywhere. */
  const joinUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return `/join?code=${initial.joinCode}`;
    }
    return `${window.location.origin}/join?code=${initial.joinCode}`;
  }, [initial.joinCode]);

  // Replay only the new messages since the last render so we never
  // double-insert a player after Strict Mode re-runs the effect.
  useEffect(() => {
    if (messages.length <= lastSeenIdx.current) return;
    const fresh = messages.slice(lastSeenIdx.current);
    lastSeenIdx.current = messages.length;
    for (const m of fresh) {
      if (m.name === "player_joined") {
        const data = (m.data ?? {}) as PlayerJoinedPayload;
        const playerId = typeof data.playerId === "string" ? data.playerId : "";
        const username = typeof data.username === "string" ? data.username : "";
        const joinedAt =
          typeof data.joinedAt === "string" ? data.joinedAt : new Date().toISOString();
        if (!playerId || !username) continue;
        setPlayers((prev) => {
          if (prev.some((p) => p.playerId === playerId)) return prev;
          return [...prev, { playerId, username, joinedAt }];
        });
      }
      if (m.name === "game_launched") {
        // Someone (or the cron) launched out from under us — bounce
        // straight to the host control screen so we don't get stuck on
        // a stale lobby.
        router.push(
          `/game/${initial.joinCode}/host?sessionId=${initial.sessionId}`
        );
      }
    }
  }, [messages, router, initial.joinCode, initial.sessionId]);

  /** Periodic backfill in case an Ably message was missed (e.g. during reconnect). */
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/game/sessions/${initial.sessionId}/lobby`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = (await res.json()) as { players?: LobbyPlayer[] };
        if (cancelled || !Array.isArray(data.players)) return;
        setPlayers((prev) => {
          // Merge: keep order from server, add anything optimistic on top.
          const seen = new Set(data.players!.map((p) => p.playerId));
          const tail = prev.filter((p) => !seen.has(p.playerId));
          return [...data.players!, ...tail];
        });
      } catch {
        // Ignore — Ably will catch us up.
      }
    };
    const id = window.setInterval(tick, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [initial.sessionId]);

  const copy = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      toast.success("Copied");
      window.setTimeout(() => {
        setCopied((cur) => (cur === key ? null : cur));
      }, 1800);
    } catch {
      toast.error("Could not copy");
    }
  }, []);

  const launch = useCallback(async () => {
    setLaunching(true);
    try {
      const res = await fetch(
        `/api/game/sessions/${initial.sessionId}/launch?force=1`,
        { method: "POST" }
      );
      const data = (await res.json()) as {
        joinCode?: string;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Could not start the game");
        return;
      }
      toast.success("Game started");
      router.push(
        `/game/${data.joinCode ?? initial.joinCode}/host?sessionId=${initial.sessionId}`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the game");
    } finally {
      setLaunching(false);
    }
  }, [initial.joinCode, initial.sessionId, router]);

  const startLabel = formatStartLabel(initial.eventStartsAt, initial.eventTimezone);
  const endLabel = formatStartLabel(initial.estimatedEndAt, initial.eventTimezone);

  const smsBody = `Join my Trivia.Box game! Code ${initial.joinCode} → ${joinUrl}`;
  const emailSubject = "Join my Trivia.Box game";
  const emailBody =
    `Hey — I'm hosting a Trivia.Box game${
      initial.hasPrize && initial.prizeDescription
        ? ` with a prize: ${initial.prizeDescription}`
        : ""
    }.\n\nStart time: ${startLabel}\n\nUse code ${initial.joinCode} or open: ${joinUrl}`;

  const playersCount = players.length;
  const liveOk = connectionState === "connected";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        {/* Code + QR + share */}
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle>Join code</CardTitle>
            <CardDescription>
              Anyone with this code can drop into the lobby. The game won&apos;t
              start until you click <strong>Start game</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
            <div className="flex items-center justify-center md:block">
              <div className="rounded-xl border bg-background p-3 shadow-sm">
                <QRCodeSVG
                  value={joinUrl}
                  size={148}
                  marginSize={2}
                  bgColor="transparent"
                  fgColor="currentColor"
                  className="text-foreground"
                />
              </div>
            </div>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => copy("code", initial.joinCode)}
                className="bg-muted/40 hover:bg-muted/60 group inline-flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition"
              >
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                    Code
                  </div>
                  <div className="font-mono text-3xl font-semibold tracking-[0.4em] tabular-nums">
                    {initial.joinCode}
                  </div>
                </div>
                {copied === "code" ? (
                  <Check className="size-5 text-emerald-500" aria-hidden />
                ) : (
                  <Copy className="text-muted-foreground group-hover:text-foreground size-5" aria-hidden />
                )}
              </button>

              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copy("link", joinUrl)}
                  className="justify-start"
                >
                  {copied === "link" ? (
                    <Check className="mr-2 size-4 text-emerald-500" aria-hidden />
                  ) : (
                    <Copy className="mr-2 size-4" aria-hidden />
                  )}
                  Copy join link
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copy("sms", smsBody)}
                  className="justify-start"
                >
                  {copied === "sms" ? (
                    <Check className="mr-2 size-4 text-emerald-500" aria-hidden />
                  ) : (
                    <MessageSquare className="mr-2 size-4" aria-hidden />
                  )}
                  Copy SMS message
                </Button>
                <a
                  href={`mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "justify-start"
                  )}
                >
                  <Mail className="mr-2 size-4" aria-hidden />
                  Email invite
                </a>
                <a
                  href={`/game/${initial.joinCode}/display`}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "justify-start"
                  )}
                >
                  <ExternalLink className="mr-2 size-4" aria-hidden />
                  Open display
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Live roster */}
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="size-4 text-muted-foreground" aria-hidden />
                  Players
                  <span className="text-muted-foreground text-base font-normal tabular-nums">
                    {playersCount}
                  </span>
                </CardTitle>
                <CardDescription>
                  Live roster of everyone who&apos;s entered the lobby.
                </CardDescription>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  liveOk
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }`}
                aria-live="polite"
              >
                <span
                  className={`size-1.5 rounded-full ${
                    liveOk ? "bg-emerald-500" : "bg-muted-foreground/50"
                  }`}
                  aria-hidden
                />
                {liveOk ? "Live" : "Connecting…"}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {playersCount === 0 ? (
              <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center">
                <p className="text-sm font-medium">No one&apos;s here yet.</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Share the code — players will appear here as they join.
                </p>
              </div>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {players.map((p) => (
                  <li
                    key={p.playerId}
                    className="bg-muted/20 hover:bg-muted/40 animate-in fade-in slide-in-from-bottom-1 flex items-center gap-3 rounded-md border px-3 py-2 transition"
                  >
                    <div className="bg-foreground text-background flex size-8 flex-none items-center justify-center rounded-full text-xs font-semibold uppercase">
                      {p.username.slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.username}</div>
                      {p.joinedAt ? (
                        <div className="text-muted-foreground text-xs">
                          Joined{" "}
                          {new Date(p.joinedAt).toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right rail */}
      <div className="space-y-6">
        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="size-4 text-muted-foreground" aria-hidden />
              Session details
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <DetailRow label="Starts" value={startLabel} />
            <DetailRow label="Ends ~" value={endLabel} />
            <DetailRow
              label="Run mode"
              value={initial.runMode === "autopilot" ? "Autopilot" : "Hosted"}
            />
            <DetailRow
              label="Timer"
              value={
                initial.timerMode === "manual"
                  ? "Manual"
                  : initial.timerMode === "hybrid"
                    ? "Hybrid"
                    : "Auto"
              }
            />
            {initial.hasPrize && initial.prizeDescription ? (
              <DetailRow label="Prize" value={initial.prizeDescription} />
            ) : null}
            {initial.onlineMeetingUrl ? (
              <DetailRow
                label="Meeting"
                value={
                  <a
                    href={initial.onlineMeetingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-foreground underline underline-offset-2"
                  >
                    {initial.onlineMeetingUrl}
                  </a>
                }
              />
            ) : null}
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle>Manage</CardTitle>
            <CardDescription>Change settings or call it off before launch.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/games/${initial.sessionId}/edit`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Edit settings
            </Link>
            <CancelSessionButton sessionId={initial.sessionId} joinCode={initial.joinCode} />
          </CardContent>
        </Card>
      </div>

      {/* Sticky launch footer */}
      <div className="sticky bottom-4 z-10 lg:col-span-2">
        <div className="border-border/70 bg-background/85 supports-[backdrop-filter]:bg-background/70 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur">
          <div className="text-sm">
            <span className="text-muted-foreground">Lobby: </span>
            <span className="font-semibold">
              {playersCount} player{playersCount === 1 ? "" : "s"} ready
            </span>
            {initial.runMode === "autopilot" ? (
              <span className="text-muted-foreground">
                {" "}
                · autopilot will launch automatically at{" "}
                <span className="text-foreground font-medium">{startLabel}</span>
                . Press Start to launch sooner.
              </span>
            ) : (
              <span className="text-muted-foreground">
                {" "}
                · click Start when you&apos;re ready — you&apos;ll control each question manually
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/game/${initial.joinCode}/display`}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <ExternalLink className="mr-1.5 size-4" aria-hidden />
              Open display
            </a>
            <Button type="button" size="lg" disabled={launching} onClick={launch}>
              {launching ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Starting…
                </>
              ) : (
                <>
                  <Play className="mr-2 size-4" aria-hidden />
                  {initial.runMode === "autopilot" ? "Start now" : "Start game"}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(72px,auto)_1fr] gap-3">
      <div className="text-muted-foreground text-xs uppercase tracking-wider">{label}</div>
      <div className="text-foreground/90">{value}</div>
    </div>
  );
}
