"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type CountdownProps = {
  /** Total duration of the timer in seconds, as the server resolved at start. */
  timerSeconds: number | null | undefined;
  /** Wall-clock (`Date.now()`) stamp from the server when the question started. */
  timerStartedAtMs: number | null | undefined;
  /** When true, the countdown freezes at its current value (answers locked). */
  locked?: boolean;
  /** Called once when the countdown naturally reaches 0. */
  onExpire?: () => void;
  /**
   * Visual size. Actual usage in the app:
   *  - `sm`  → host sidebar chip
   *  - `md`  → player screen
   *  - `lg`  → large surface / compact display
   *  - `xl`  → full display wall
   */
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const SIZE_MAP: Record<NonNullable<CountdownProps["size"]>, { box: string; ring: number }> = {
  sm: { box: "h-14 w-14 text-xl", ring: 3 },
  md: { box: "h-24 w-24 text-3xl", ring: 4 },
  lg: { box: "h-36 w-36 text-5xl", ring: 5 },
  xl: { box: "h-56 w-56 text-7xl", ring: 6 },
};

/**
 * Server-synchronized countdown. Reads remaining time from `Date.now() -
 * timerStartedAtMs`, so every screen (host/play/display) shows the same value
 * regardless of tab latency, and a mid-round refresh snaps back to the correct
 * remaining. Uses `requestAnimationFrame` for smooth ring updates.
 *
 * Visual states:
 *  - `> 50%`  emerald
 *  - `> 25%`  amber
 *  - `<= 5s`  rose + subtle bloom pulse
 *  - `locked` frozen at current progress, desaturated, no bloom/pulse
 */
export function Countdown({
  timerSeconds,
  timerStartedAtMs,
  locked,
  onExpire,
  size = "md",
  className,
}: CountdownProps) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const expiredRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;
    if (!timerSeconds || !timerStartedAtMs) {
      setRemaining(null);
      return;
    }
    let rafId = 0;
    const total = timerSeconds * 1000;
    function tick() {
      if (!timerStartedAtMs || !timerSeconds) return;
      const elapsed = Date.now() - timerStartedAtMs;
      const remMs = Math.max(0, total - elapsed);
      setRemaining(remMs);
      if (remMs <= 0) {
        if (!expiredRef.current) {
          expiredRef.current = true;
          onExpire?.();
        }
        return;
      }
      rafId = requestAnimationFrame(tick);
    }
    tick();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [timerSeconds, timerStartedAtMs, onExpire]);

  const sizing = SIZE_MAP[size];

  if (!timerSeconds || !timerStartedAtMs) {
    return (
      <div className={cn("flex items-center justify-center text-sm text-white/60", className)}>
        <div
          className={cn(
            "rounded-full border border-white/10 bg-white/5 flex items-center justify-center font-mono font-bold",
            sizing.box,
          )}
        >
          —
        </div>
      </div>
    );
  }

  const totalMs = timerSeconds * 1000;
  const remMs = remaining ?? totalMs;
  const seconds = Math.max(0, Math.ceil(remMs / 1000));
  const fraction = Math.max(0, Math.min(1, remMs / totalMs));

  const ringStroke = sizing.ring;
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - fraction);

  const urgent = seconds <= 5;
  const colorClass = locked
    ? "text-white/50"
    : urgent
      ? "text-rose-400"
      : fraction > 0.5
        ? "text-emerald-400"
        : fraction > 0.25
          ? "text-amber-300"
          : "text-orange-400";

  return (
    <div
      className={cn(
        "relative flex items-center justify-center select-none",
        sizing.box,
        className,
      )}
      role="timer"
      aria-label={
        locked
          ? `Answers locked at ${seconds} seconds remaining`
          : `${seconds} seconds remaining to answer`
      }
      style={{
        filter: urgent && !locked ? "drop-shadow(0 0 14px currentColor)" : undefined,
        transition: "filter 300ms ease",
      }}
    >
      <svg
        viewBox="0 0 100 100"
        className={cn("absolute inset-0 -rotate-90", colorClass)}
        aria-hidden
        style={{
          transition: "color 400ms ease",
        }}
      >
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.15"
          strokeWidth={ringStroke}
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={ringStroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            transition: locked ? "none" : "stroke-dashoffset 120ms linear",
          }}
        />
      </svg>
      <span
        className={cn(
          "relative font-mono font-black tabular-nums",
          colorClass,
          urgent && !locked && "animate-pulse",
        )}
        aria-hidden
      >
        {seconds}
      </span>
    </div>
  );
}
