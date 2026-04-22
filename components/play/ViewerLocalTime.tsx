"use client";

import { useEffect, useState } from "react";

type Format = "short" | "long";

type TimeProps = {
  /** ISO-8601 timestamp. Stable across SSR + client. */
  value: string;
  /**
   * Server-rendered string to show until hydration completes. Should be
   * the formatted-in-some-timezone version the server already produced so
   * the initial render doesn't shift layout or trigger a hydration
   * mismatch warning — we swap it for a viewer-local format in `useEffect`
   * once we know the browser's `Intl` settings.
   */
  fallback: string;
  /**
   * `short` → "Wed 10:00 AM" (card rows).
   * `long`  → "Wed, Apr 22, 2026, 10:00 AM PDT" (detail rows).
   */
  format?: Format;
};

const SHORT_OPTS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
};

const LONG_OPTS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
};

/**
 * Formats a timestamp in the **viewer's** local timezone, not the server's.
 *
 * We use this for platform-wide events (house games) that have no
 * geographic venue — the server has no way to know whether the visitor is
 * in San Diego or Sydney, so it emits a sensible `fallback` label (today
 * that's UTC) and this component rewrites it client-side using
 * `Intl.DateTimeFormat(undefined, …)`, which honors the browser locale.
 *
 * Purposely uses a post-mount `setState` rather than reading `navigator`
 * inside `useState`'s initializer so the SSR output and the first client
 * render match exactly — no hydration warnings, just a one-tick flip
 * after hydrate.
 */
export function ViewerLocalTime({ value, fallback, format = "short" }: TimeProps) {
  const [label, setLabel] = useState(fallback);

  useEffect(() => {
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return;
      const opts = format === "long" ? LONG_OPTS : SHORT_OPTS;
      setLabel(new Intl.DateTimeFormat(undefined, opts).format(d));
    } catch {
      // Intl.DateTimeFormat failed (ancient browser) — keep the server
      // fallback, which is still a valid label.
    }
  }, [value, format]);

  return <time dateTime={value}>{label}</time>;
}

type PartsProps = {
  value: string;
  fallbackWeekday: string;
  fallbackDay: string;
  fallbackMonth: string;
  className?: string;
};

/**
 * Three-part calendar tile used by `/games/upcoming` (weekday / day /
 * month stacked). Same viewer-local story as `ViewerLocalTime`: the
 * server emits a fallback rendered in the session's recorded timezone,
 * and we rewrite it to the browser's locale after hydration so a house
 * game close to midnight doesn't flip to the wrong day for users on the
 * other side of the UTC line.
 */
export function ViewerLocalDateParts({
  value,
  fallbackWeekday,
  fallbackDay,
  fallbackMonth,
}: PartsProps) {
  const [parts, setParts] = useState({
    weekday: fallbackWeekday,
    day: fallbackDay,
    month: fallbackMonth,
  });

  useEffect(() => {
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return;
      setParts({
        weekday: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(d),
        day: new Intl.DateTimeFormat(undefined, { day: "2-digit" }).format(d),
        month: new Intl.DateTimeFormat(undefined, { month: "short" }).format(d),
      });
    } catch {
      // Keep SSR fallback.
    }
  }, [value]);

  // Render as a fragment; the caller owns the tile layout.
  return (
    <>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">
        {parts.weekday}
      </span>
      <span className="block text-2xl font-black tabular-nums tracking-tight">
        {parts.day}
      </span>
      <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
        {parts.month}
      </span>
    </>
  );
}
