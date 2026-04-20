import { cn } from "@/lib/utils";

type SkeletonListProps = {
  /** Number of placeholder rows. Defaults to 3. */
  rows?: number;
  /** Show a small circle before each row (like avatar/icon placeholders). */
  avatar?: boolean;
  /** Row height tailwind class. */
  rowHeight?: string;
  className?: string;
};

/**
 * Shimmer-row skeleton, useful while a list endpoint is loading. Keeps the
 * layout stable during fetches without popping content in.
 */
export function SkeletonList({
  rows = 3,
  avatar,
  rowHeight = "h-4",
  className,
}: SkeletonListProps) {
  return (
    <div className={cn("w-full space-y-2", className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-md bg-muted/40 px-3 py-2"
        >
          {avatar ? (
            <div className="size-6 shrink-0 animate-pulse rounded-full bg-muted" />
          ) : null}
          <div className={cn("w-full animate-pulse rounded bg-muted", rowHeight)} />
        </div>
      ))}
    </div>
  );
}
