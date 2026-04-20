import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const pillVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] ring-1",
  {
    variants: {
      // Every tone references a `--neon-*` CSS variable so pills stay in
      // lockstep with the arcade-neon palette. `color-mix` keeps backgrounds
      // translucent without needing a Tailwind opacity variant per tone.
      tone: {
        neutral: "bg-muted/60 text-muted-foreground ring-border",
        info:
          "bg-[color-mix(in_oklab,var(--neon-cyan)_14%,transparent)] text-[var(--neon-cyan)] ring-[color-mix(in_oklab,var(--neon-cyan)_35%,transparent)]",
        success:
          "bg-[color-mix(in_oklab,var(--neon-lime)_14%,transparent)] text-[var(--neon-lime)] ring-[color-mix(in_oklab,var(--neon-lime)_35%,transparent)]",
        warning:
          "bg-[color-mix(in_oklab,var(--neon-amber)_14%,transparent)] text-[var(--neon-amber)] ring-[color-mix(in_oklab,var(--neon-amber)_35%,transparent)]",
        danger:
          "bg-[color-mix(in_oklab,var(--neon-magenta)_14%,transparent)] text-[var(--neon-magenta)] ring-[color-mix(in_oklab,var(--neon-magenta)_35%,transparent)]",
        accent:
          "bg-[color-mix(in_oklab,var(--neon-magenta)_14%,transparent)] text-[var(--neon-magenta)] ring-[color-mix(in_oklab,var(--neon-magenta)_35%,transparent)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

type StatusPillProps = VariantProps<typeof pillVariants> & {
  children: ReactNode;
  /** Show a small colored dot on the left. */
  dot?: boolean;
  /** Pulse the dot (for "live" indicators). */
  pulse?: boolean;
  /** Native browser tooltip text. */
  title?: string;
  className?: string;
};

/**
 * Small pill used to label statuses (Live, Paused, Draft, etc.). Six tones
 * cover the common cases; pass `dot` for a small colored dot and `pulse`
 * for a live-indicator.
 */
export function StatusPill({ children, tone, dot, pulse, title, className }: StatusPillProps) {
  return (
    <span className={cn(pillVariants({ tone }), className)} title={title}>
      {dot ? (
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full bg-current",
            pulse && "animate-pulse",
          )}
        />
      ) : null}
      {children}
    </span>
  );
}

export { pillVariants };
