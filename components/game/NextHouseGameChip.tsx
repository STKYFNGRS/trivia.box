"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

type NextGame = {
  sessionId: string;
  joinCode: string;
  eventStartsAt: string;
  theme: string | null;
};

function formatCountdown(ms: number): string {
  if (ms <= 0) return "any moment";
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.ceil(totalSec / 60);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

/**
 * Post-game "Next house game in 14m" chip rendered under
 * `FinalStandings`. Keeps the player in the funnel even when they
 * didn't win — they can tap into the next house round with one touch.
 *
 * Uses a single fetch on mount (house games are created ~10 min in
 * advance so a minute-level countdown is plenty accurate) and a 30s
 * re-tick for the label. Hides itself when no house game is scheduled.
 */
export function NextHouseGameChip() {
  const [next, setNext] = useState<NextGame | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/game/public/next-house-game", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { next: NextGame | null };
        if (active) setNext(data.next);
      } catch {
        // Fail closed — the chip just doesn't render.
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(iv);
  }, []);

  if (!loaded || !next) return null;

  // Referenced so the effect dependency lint is happy with the 30s tick.
  void tick;
  const ms = new Date(next.eventStartsAt).getTime() - Date.now();
  // Don't advertise a game that's technically "future" but already well
  // past its start time (cron hiccup / timezone snafu) — wait for the
  // autopilot launcher to flip it to active, at which point another UI
  // already handles join flow.
  if (ms < -2 * 60 * 1000) return null;

  return (
    <Link
      href={`/game/${encodeURIComponent(next.joinCode)}/play`}
      className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--neon-cyan)_30%,transparent)] bg-[color-mix(in_oklab,var(--neon-cyan)_8%,transparent)] px-3.5 py-2 text-xs font-semibold text-[var(--neon-cyan)] transition hover:bg-[color-mix(in_oklab,var(--neon-cyan)_15%,transparent)]"
      title={
        next.theme
          ? `Next house game — ${next.theme}`
          : "Next house game on Trivia.Box"
      }
    >
      <Clock className="size-3.5" aria-hidden />
      {ms > 0
        ? `Next house game in ${formatCountdown(ms)}`
        : "House game starting"}
      {next.theme ? (
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-white/70">
          {next.theme}
        </span>
      ) : null}
    </Link>
  );
}
