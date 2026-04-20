"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Count-up animation for stats band. Runs exactly once, when the element
 * scrolls into view, via `IntersectionObserver` + `requestAnimationFrame`.
 * No always-on rAF loop; cleans up its observer on unmount.
 *
 * Respects `prefers-reduced-motion` by jumping straight to the target value.
 */
export function NumberTicker({
  value,
  durationMs = 1400,
  format = new Intl.NumberFormat("en-US"),
  className,
}: {
  value: number;
  durationMs?: number;
  format?: Intl.NumberFormat;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!ref.current) return;
    const target = ref.current;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(value);
      started.current = true;
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || started.current) continue;
          started.current = true;

          const from = 0;
          const to = value;
          const start = performance.now();
          const ease = (t: number) => 1 - Math.pow(1 - t, 3);

          const step = (now: number) => {
            const t = Math.min(1, (now - start) / durationMs);
            setDisplay(Math.round(from + (to - from) * ease(t)));
            if (t < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [value, durationMs]);

  return (
    <span ref={ref} className={className}>
      {format.format(display)}
    </span>
  );
}
