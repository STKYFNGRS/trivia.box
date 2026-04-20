import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const pillVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] ring-1",
  {
    variants: {
      tone: {
        neutral: "bg-muted/60 text-muted-foreground ring-border",
        info: "bg-sky-500/15 text-sky-600 ring-sky-500/20 dark:text-sky-300",
        success: "bg-emerald-500/15 text-emerald-600 ring-emerald-500/20 dark:text-emerald-300",
        warning: "bg-amber-500/15 text-amber-700 ring-amber-500/25 dark:text-amber-300",
        danger: "bg-rose-500/15 text-rose-600 ring-rose-500/20 dark:text-rose-300",
        accent:
          "bg-[var(--stage-accent)]/15 text-[var(--stage-accent)] ring-[var(--stage-accent)]/25",
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
  className?: string;
};

/**
 * Small pill used to label statuses (Live, Paused, Draft, etc.). Six tones
 * cover the common cases; pass `dot` for a small colored dot and `pulse`
 * for a live-indicator.
 */
export function StatusPill({ children, tone, dot, pulse, className }: StatusPillProps) {
  return (
    <span className={cn(pillVariants({ tone }), className)}>
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
