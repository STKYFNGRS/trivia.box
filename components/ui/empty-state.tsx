import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  /** Typically a lucide icon rendered at `h-10 w-10`. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Primary/secondary actions — usually one button. */
  actions?: ReactNode;
  className?: string;
  /** When true, renders without the dashed border (useful inline in a card). */
  borderless?: boolean;
};

/**
 * Centered empty-state placeholder. Defaults to a dashed-border card so any
 * parent container gets a nice "this panel has nothing yet" look.
 */
export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
  borderless,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl px-6 py-10 text-center",
        borderless ? "" : "border border-dashed border-border/70 bg-muted/30",
        className,
      )}
    >
      {icon ? (
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <div>
        <div className="text-base font-semibold text-foreground">{title}</div>
        {description ? (
          <div className="mt-1 max-w-md text-sm text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {actions ? <div className="mt-1 flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
