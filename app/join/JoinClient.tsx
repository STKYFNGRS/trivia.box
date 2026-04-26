"use client";

import { SignedIn, SignedOut, SignInButton, useAuth } from "@clerk/nextjs";
import { Loader2, Sparkles, Timer } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type SessionProbe = {
  status: "pending" | "active" | "paused" | "completed" | "cancelled" | "draft";
  houseGame: boolean;
  venueDisplayName: string | null;
  /** ISO string — present on the public session endpoint. */
  eventStartsAt?: string | null;
};

type LobbyState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "waiting"; session: SessionProbe; startsAt: Date | null }
  | { kind: "ready"; session: SessionProbe }
  | { kind: "ended"; reason: string }
  | { kind: "missing" }
  | { kind: "cooldown"; retryAt: Date };

const POLL_MS = 3000;

export function JoinClient() {
  const router = useRouter();
  const { isLoaded, userId } = useAuth();
  const searchParams = useSearchParams();
  const initialCode = useMemo(
    () => (searchParams.get("code") ?? "").toUpperCase(),
    [searchParams],
  );

  const [joinCode, setJoinCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [profileReady, setProfileReady] = useState<boolean | null>(null);
  const [lobby, setLobby] = useState<LobbyState>(
    initialCode.length === 6 ? { kind: "checking" } : { kind: "idle" },
  );
  const autoJoinedRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || !userId) {
      setProfileReady(null);
      return;
    }
    void (async () => {
      const res = await fetch("/api/me/player");
      setProfileReady(res.ok);
    })();
  }, [isLoaded, userId]);

  const performJoin = useCallback(
    async (codeToJoin: string) => {
      setLoading(true);
      try {
        const res = await fetch("/api/players/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ joinCode: codeToJoin.trim().toUpperCase() }),
        });
        const data = (await res.json()) as {
          playerId?: string;
          error?: unknown;
          code?: string;
          retryAt?: string;
        };
        // 409 + `code: "cooldown"` = user finished a house game in the
        // last 30 min. Swap the card into a friendly countdown + subscribe
        // upsell rather than toast-and-forget. This also prevents the
        // auto-join loop from retrying every poll tick.
        if (res.status === 409 && data.code === "cooldown" && data.retryAt) {
          const retryAt = new Date(data.retryAt);
          if (!Number.isNaN(retryAt.getTime())) {
            setLobby({ kind: "cooldown", retryAt });
            return;
          }
        }
        if (!res.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "Could not join");
        }
        if (!data.playerId) {
          throw new Error("Missing player id");
        }
        const code = codeToJoin.trim().toUpperCase();
        router.push(
          `/game/${code}/play?playerId=${encodeURIComponent(data.playerId)}`,
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not join");
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  // Poll the public session endpoint whenever a full code is loaded. This
  // makes the "Enter Lobby" experience work for house games that haven't
  // started yet — the page shows a countdown while `status = pending`, then
  // auto-forwards the player into the live game the instant it flips to
  // `active`. Cancels cleanly on unmount / code change.
  const code6 = joinCode.trim().toUpperCase();
  useEffect(() => {
    if (code6.length !== 6) {
      setLobby({ kind: "idle" });
      autoJoinedRef.current = false;
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const probe = async () => {
      if (cancelled) return;
      setLobby((prev) => (prev.kind === "idle" ? { kind: "checking" } : prev));
      try {
        const res = await fetch(
          `/api/game/public/session?code=${encodeURIComponent(code6)}`,
          { cache: "no-store" },
        );
        if (cancelled) return;
        if (res.status === 404) {
          setLobby({ kind: "missing" });
          return;
        }
        if (!res.ok) {
          // Transient / rate-limit — keep the previous state and retry.
          timer = setTimeout(probe, POLL_MS);
          return;
        }
        const raw = (await res.json()) as Partial<SessionProbe> & {
          status?: string;
          eventStartsAt?: string | null;
        };
        const status = (raw.status ?? "pending") as SessionProbe["status"];
        const session: SessionProbe = {
          status,
          houseGame: raw.houseGame === true,
          venueDisplayName: raw.venueDisplayName ?? null,
          eventStartsAt: raw.eventStartsAt ?? null,
        };
        if (status === "completed" || status === "cancelled") {
          setLobby({
            kind: "ended",
            reason:
              status === "completed"
                ? "This game has already wrapped up."
                : "This game was cancelled.",
          });
          return;
        }
        if (status === "active" || status === "paused") {
          // Don't stomp the cooldown card — once the join API has told
          // us the player has to wait, the probe loop just keeps the
          // lobby state alive so the countdown can tick down.
          setLobby((prev) =>
            prev.kind === "cooldown" ? prev : { kind: "ready", session },
          );
          // If the user arrived with a pre-filled code and is already
          // signed in, auto-join so the CTA feels as immediate as
          // "Enter Lobby" → play. We only fire this once per mount.
          if (
            !autoJoinedRef.current &&
            profileReady === true &&
            initialCode === code6
          ) {
            autoJoinedRef.current = true;
            void performJoin(code6);
          }
          return;
        }
        // pending / draft: show lobby countdown, keep polling.
        const startsAt = session.eventStartsAt
          ? new Date(session.eventStartsAt)
          : null;
        setLobby({ kind: "waiting", session, startsAt });
        timer = setTimeout(probe, POLL_MS);
      } catch {
        if (cancelled) return;
        timer = setTimeout(probe, POLL_MS);
      }
    };

    void probe();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [code6, initialCode, performJoin, profileReady]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await performJoin(joinCode);
  }

  const padded = joinCode.padEnd(6, "·");
  const isLobbyWaiting = lobby.kind === "waiting";
  const isLobbyEnded = lobby.kind === "ended";
  const isLobbyMissing = lobby.kind === "missing";
  const isLobbyCooldown = lobby.kind === "cooldown";

  return (
    <div className="relative flex min-h-[calc(100vh-14rem)] items-center justify-center overflow-hidden px-6 py-12 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, color-mix(in oklab, var(--neon-magenta) 18%, transparent), transparent 55%), radial-gradient(ellipse at 80% 100%, color-mix(in oklab, var(--neon-cyan) 14%, transparent), transparent 55%)",
        }}
      />

      <div className="relative z-10 w-full max-w-xl">
        <div className="mb-10 text-center">
          <span
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/85 backdrop-blur"
            style={{
              borderColor:
                "color-mix(in oklab, var(--neon-magenta) 35%, transparent)",
              background:
                "color-mix(in oklab, var(--neon-magenta) 10%, transparent)",
            }}
          >
            <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--neon-lime)" }} />
            {isLobbyWaiting ? "In the lobby" : "Ready to play"}
          </span>
          <h1
            className="mt-4 font-[family-name:var(--font-display)] font-extrabold tracking-[-0.03em] text-white"
            style={{ fontSize: "clamp(2.25rem, 6vw, 4rem)", lineHeight: 1 }}
          >
            {isLobbyWaiting
              ? "Hold tight — the game starts soon"
              : "Enter the join code"}
          </h1>
          <p className="mt-3 text-sm text-white/70 md:text-base">
            {isLobbyWaiting
              ? "We'll drop you straight into the game the instant it goes live."
              : "Grab the six-character code from the host's display and type it in."}
          </p>
        </div>

        <SignedOut>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center shadow-[var(--shadow-card)] backdrop-blur">
            <p className="text-sm text-white/80">
              Sign in with your <span className="font-semibold text-white">player account</span> so your
              stats and trophies follow you across venues.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <SignInButton mode="modal">
                <Button
                  type="button"
                  className="h-11 w-full font-bold uppercase tracking-[0.12em]"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--neon-magenta), var(--neon-violet))",
                    color: "oklch(0.1 0.02 270)",
                    boxShadow:
                      "0 0 0 1px color-mix(in oklab, var(--neon-magenta) 40%, transparent), 0 10px 30px -10px color-mix(in oklab, var(--neon-magenta) 55%, transparent)",
                  }}
                >
                  Sign in to continue
                </Button>
              </SignInButton>
              <p className="text-xs text-white/60">
                New here?{" "}
                <Link
                  href="/sign-up"
                  className="font-semibold text-white underline underline-offset-4"
                >
                  Sign up as a player
                </Link>
              </p>
            </div>
          </div>
        </SignedOut>

        <SignedIn>
          {profileReady === false ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-white/80 shadow-[var(--shadow-card)] backdrop-blur">
              We could not load your profile. Try signing out and back in, or contact support.
            </div>
          ) : profileReady === null ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-white/70 shadow-[var(--shadow-card)] backdrop-blur">
              Checking your profile…
            </div>
          ) : isLobbyCooldown ? (
            <LobbyCooldownCard
              retryAt={lobby.retryAt}
              onRetry={() => performJoin(code6)}
              manualJoining={loading}
            />
          ) : isLobbyWaiting ? (
            <LobbyWaitingCard
              startsAt={lobby.startsAt}
              onJoin={() => performJoin(code6)}
              venueDisplayName={lobby.session.venueDisplayName}
              isHouseGame={lobby.session.houseGame}
              manualJoining={loading}
            />
          ) : isLobbyEnded ? (
            <div className="rounded-2xl border border-amber-300/30 bg-amber-400/[0.05] p-6 text-sm text-amber-100/90 shadow-[var(--shadow-card)] backdrop-blur">
              {lobby.reason}{" "}
              <Link
                href="/games/upcoming"
                className="font-semibold text-white underline underline-offset-4"
              >
                See upcoming games
              </Link>
              .
            </div>
          ) : isLobbyMissing ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-sm text-white/80 shadow-[var(--shadow-card)] backdrop-blur">
              That code doesn&rsquo;t match any game. Double-check with the host, or{" "}
              <Link
                href="/games/upcoming"
                className="font-semibold text-white underline underline-offset-4"
              >
                browse upcoming games
              </Link>
              .
            </div>
          ) : (
            <form
              onSubmit={onSubmit}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-[var(--shadow-hero)] backdrop-blur"
            >
              <Label
                htmlFor="code"
                className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60"
              >
                Join code
              </Label>

              <div className="relative mt-3">
                <div
                  aria-hidden
                  className="pointer-events-none flex select-none items-center justify-center gap-2 py-2 font-mono text-4xl font-black uppercase tracking-tight md:text-5xl"
                >
                  {padded.split("").map((ch, i) => {
                    const filled = i < joinCode.length;
                    const isCursor = i === joinCode.length;
                    return (
                      <span
                        key={i}
                        className="inline-flex h-14 w-12 items-center justify-center rounded-lg border transition md:h-16 md:w-14"
                        style={{
                          background: filled
                            ? "color-mix(in oklab, var(--neon-magenta) 14%, transparent)"
                            : "color-mix(in oklab, var(--stage-surface) 75%, transparent)",
                          borderColor: filled
                            ? "color-mix(in oklab, var(--neon-magenta) 55%, transparent)"
                            : isCursor
                              ? "color-mix(in oklab, var(--neon-cyan) 55%, transparent)"
                              : "color-mix(in oklab, white 14%, transparent)",
                          color: filled ? "white" : "color-mix(in oklab, white 20%, transparent)",
                          boxShadow: filled
                            ? "0 0 24px -8px color-mix(in oklab, var(--neon-magenta) 55%, transparent)"
                            : undefined,
                        }}
                      >
                        {filled ? ch : ""}
                      </span>
                    );
                  })}
                </div>
                <input
                  id="code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.replace(/\s+/g, "").toUpperCase().slice(0, 6))}
                  maxLength={6}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  autoComplete="one-time-code"
                  inputMode="text"
                  aria-label="6-character join code"
                  className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent outline-none focus:outline-none"
                />
              </div>

              <p className="mt-4 text-center text-xs text-white/50">
                6 letters or numbers · not case-sensitive
              </p>

              <Button
                type="submit"
                disabled={loading || joinCode.length !== 6 || isLobbyEnded || isLobbyMissing}
                className="mt-6 h-12 w-full text-base font-bold uppercase tracking-[0.12em]"
                style={{
                  background:
                    "linear-gradient(135deg, var(--neon-magenta), var(--neon-violet))",
                  color: "oklch(0.1 0.02 270)",
                  boxShadow:
                    "0 0 0 1px color-mix(in oklab, var(--neon-magenta) 40%, transparent), 0 16px 40px -12px color-mix(in oklab, var(--neon-magenta) 60%, transparent)",
                }}
              >
                {loading ? "Joining…" : "Enter game"}
              </Button>
            </form>
          )}
        </SignedIn>

        <p className="mt-8 text-center text-xs text-white/40">
          Don&rsquo;t have a code?{" "}
          <Link href="/games/upcoming" className="font-semibold text-white/70 hover:text-white">
            See upcoming games
          </Link>
        </p>
      </div>
    </div>
  );
}

/**
 * Visible lobby while the game hasn't started yet. Renders a live
 * countdown (updating once per second), the venue label, and a manual
 * "Enter now" button that becomes active the moment the session flips
 * to `active`. The auto-advance happens transparently via the parent's
 * polling loop — this button is just a fallback so an impatient player
 * can mash it after the countdown hits zero without waiting for the
 * next poll cycle.
 */
function LobbyWaitingCard({
  startsAt,
  onJoin,
  venueDisplayName,
  isHouseGame,
  manualJoining,
}: {
  startsAt: Date | null;
  onJoin: () => void;
  venueDisplayName: string | null;
  isHouseGame: boolean;
  manualJoining: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);

  const msLeft = startsAt ? Math.max(0, startsAt.getTime() - now) : null;
  const countdown = formatCountdown(msLeft);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-6 text-center shadow-[var(--shadow-hero)] backdrop-blur"
      style={{
        background:
          "linear-gradient(180deg, color-mix(in oklab, var(--stage-surface) 96%, transparent), color-mix(in oklab, var(--stage-bg) 92%, transparent))",
        borderColor:
          "color-mix(in oklab, var(--neon-cyan) 40%, transparent)",
        boxShadow:
          "inset 0 1px 0 0 color-mix(in oklab, var(--neon-cyan) 22%, transparent), 0 16px 50px -16px color-mix(in oklab, var(--neon-cyan) 55%, transparent)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--neon-cyan), transparent)",
        }}
      />
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[var(--neon-cyan)]/15 text-[var(--neon-cyan)] ring-1 ring-[var(--neon-cyan)]/40">
        <Timer className="size-7" aria-hidden />
      </div>
      <div className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
        {isHouseGame ? "Trivia.Box house game" : "Scheduled game"}
      </div>
      <div className="mt-1 text-lg font-semibold text-white">
        {venueDisplayName ?? "Next round"}
      </div>
      <div className="mt-6 font-mono text-5xl font-black tracking-tight text-white tabular-nums md:text-6xl">
        {countdown.label}
      </div>
      <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
        {countdown.sublabel}
      </div>
      <Button
        type="button"
        onClick={onJoin}
        disabled={manualJoining}
        className="mt-6 h-11 w-full text-sm font-bold uppercase tracking-[0.12em]"
        style={{
          background:
            "linear-gradient(135deg, var(--neon-cyan), var(--neon-violet))",
          color: "oklch(0.1 0.02 270)",
          boxShadow:
            "0 0 0 1px color-mix(in oklab, var(--neon-cyan) 40%, transparent), 0 14px 40px -14px color-mix(in oklab, var(--neon-cyan) 55%, transparent)",
        }}
      >
        {manualJoining ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Joining…
          </span>
        ) : (
          "Enter now"
        )}
      </Button>
      <p className="mt-3 text-[11px] text-white/50">
        You&rsquo;ll be forwarded automatically the moment the game goes live.
      </p>
    </div>
  );
}

/**
 * Rendered when the join API returns `409 { code: "cooldown" }` for a
 * player who finished a free Trivia.Box house game in the last 30
 * minutes. Shows the countdown until their next eligible play plus a
 * subtle "subscribe for hosting / achievements" nudge — the cooldown
 * exists specifically to steer heavy players toward the paid tier.
 */
function LobbyCooldownCard({
  retryAt,
  onRetry,
  manualJoining,
}: {
  retryAt: Date;
  onRetry: () => void;
  manualJoining: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);

  const msLeft = Math.max(0, retryAt.getTime() - now);
  const countdown = formatCountdown(msLeft);
  const canRetry = msLeft <= 0;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border p-6 text-center shadow-[var(--shadow-hero)] backdrop-blur"
      style={{
        background:
          "linear-gradient(180deg, color-mix(in oklab, var(--stage-surface) 96%, transparent), color-mix(in oklab, var(--stage-bg) 92%, transparent))",
        borderColor:
          "color-mix(in oklab, var(--neon-amber) 40%, transparent)",
        boxShadow:
          "inset 0 1px 0 0 color-mix(in oklab, var(--neon-amber) 22%, transparent), 0 16px 50px -16px color-mix(in oklab, var(--neon-amber) 55%, transparent)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--neon-amber), transparent)",
        }}
      />
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[var(--neon-amber)]/15 text-[var(--neon-amber)] ring-1 ring-[var(--neon-amber)]/40">
        <Timer className="size-7" aria-hidden />
      </div>
      <div className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-white/60">
        Nice run
      </div>
      <div className="mt-1 text-lg font-semibold text-white">
        You can play another Trivia.Box game in
      </div>
      <div className="mt-6 font-mono text-5xl font-black tracking-tight text-white tabular-nums md:text-6xl">
        {canRetry ? "Ready" : countdown.label}
      </div>
      <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
        {canRetry ? "Tap to rejoin" : "Cooldown"}
      </div>
      <Button
        type="button"
        onClick={onRetry}
        disabled={!canRetry || manualJoining}
        className="mt-6 h-11 w-full text-sm font-bold uppercase tracking-[0.12em]"
        style={{
          background: canRetry
            ? "linear-gradient(135deg, var(--neon-cyan), var(--neon-violet))"
            : "color-mix(in oklab, white 8%, transparent)",
          color: canRetry ? "oklch(0.1 0.02 270)" : "color-mix(in oklab, white 45%, transparent)",
          boxShadow: canRetry
            ? "0 0 0 1px color-mix(in oklab, var(--neon-cyan) 40%, transparent), 0 14px 40px -14px color-mix(in oklab, var(--neon-cyan) 55%, transparent)"
            : undefined,
        }}
      >
        {manualJoining ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Joining…
          </span>
        ) : canRetry ? (
          "Rejoin now"
        ) : (
          "Waiting…"
        )}
      </Button>
      <p className="mt-4 text-xs text-white/60">
        Want to host your own games and earn achievements without the wait?{" "}
        <button
          type="button"
          onClick={() => {
            void (async () => {
              try {
                const res = await fetch("/api/billing/checkout", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ returnPath: "/dashboard" }),
                });
                const data = (await res.json()) as { url?: string; error?: string };
                if (!res.ok || !data.url) throw new Error(data.error ?? "Checkout failed");
                window.location.href = data.url;
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Checkout failed");
              }
            })();
          }}
          className="cursor-pointer font-semibold text-white underline underline-offset-4 hover:text-[var(--neon-cyan)]"
        >
          Subscribe
        </button>
        .
      </p>
    </div>
  );
}

function formatCountdown(ms: number | null): { label: string; sublabel: string } {
  if (ms === null) return { label: "Soon", sublabel: "Waiting for the host" };
  if (ms <= 0) return { label: "Starting…", sublabel: "Dropping you in any second" };
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return {
      label: `${hrs}h ${String(remMins).padStart(2, "0")}m`,
      sublabel: "Until the game begins",
    };
  }
  return {
    label: `${mins}:${String(secs).padStart(2, "0")}`,
    sublabel: mins > 0 ? "Minutes until start" : "Seconds until start",
  };
}
