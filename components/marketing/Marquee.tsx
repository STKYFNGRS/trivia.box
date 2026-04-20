import { cn } from "@/lib/utils";

/**
 * Generic horizontal infinite marquee. Children are rendered twice so the
 * animation can translate by `-50%` without a visible seam. CSS-only via the
 * `.marquee` / `.marquee-track` utilities in `globals.css` — which also
 * respect `prefers-reduced-motion`.
 */
export function Marquee({
  children,
  className,
  pauseOnHover = true,
}: {
  children: React.ReactNode;
  className?: string;
  pauseOnHover?: boolean;
}) {
  return (
    <div
      aria-hidden
      className={cn("marquee", className, pauseOnHover && "group/marquee")}
    >
      <div
        className={cn(
          "marquee-track",
          pauseOnHover && "group-hover/marquee:[animation-play-state:paused]"
        )}
      >
        <div className="flex shrink-0 items-center gap-12">{children}</div>
        <div className="flex shrink-0 items-center gap-12">{children}</div>
      </div>
    </div>
  );
}
