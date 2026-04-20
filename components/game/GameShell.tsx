import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type GameShellProps = {
  children: ReactNode;
  /** Absolute or same-origin URL to a venue image. Rendered as a faint
   * bottom-anchored hero behind the content. Pass `null` to omit. */
  venueImageUrl?: string | null;
  /** Optional sticky top bar (connection pill, score chip, etc.). */
  topBar?: ReactNode;
  /** Optional footer row. */
  footer?: ReactNode;
  /** Extra classes for the inner content wrapper. */
  className?: string;
  /** Extra classes for the sticky top bar (defaults to `px-4 py-3`). Use this
   * to give the display wall a larger broadcast top bar, for example. */
  topBarClassName?: string;
  /** Disables the vignette + grain — useful for the `/host` page, which is
   * more utility than theatre. */
  plain?: boolean;
};

/**
 * Cinematic stage backdrop shared by `/play`, `/host`, and `/display`.
 *
 * Composition (z-index ascending):
 *   0. deep navy stage background
 *   1. optional venue photo fading from bottom (20% max opacity)
 *   2. radial vignette darkening corners
 *   3. subtle CSS film grain
 *   4. content (children, topBar, footer)
 */
export function GameShell({
  children,
  venueImageUrl,
  topBar,
  footer,
  className,
  topBarClassName,
  plain = false,
}: GameShellProps) {
  return (
    <div
      className={cn(
        "relative min-h-dvh w-full overflow-hidden",
        "bg-[var(--stage-bg)] text-white",
        "grain",
      )}
    >
      {venueImageUrl ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(to top, rgb(0 0 0 / 0.85) 0%, rgb(0 0 0 / 0.55) 30%, transparent 70%), url(${venueImageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center bottom",
            backgroundRepeat: "no-repeat",
            opacity: 0.35,
          }}
        />
      ) : null}

      {plain ? null : (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 55%, rgb(0 0 0 / 0.55) 100%)",
          }}
        />
      )}

      {plain ? null : <div aria-hidden className="grain-layer" />}

      <div className="relative z-10 flex min-h-dvh w-full flex-col">
        {topBar ? (
          <header
            className={cn(
              "sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-black/20",
              topBarClassName,
            )}
          >
            {topBar}
          </header>
        ) : null}

        <main className={cn("flex-1 w-full mx-auto max-w-5xl px-4 py-6", className)}>
          {children}
        </main>

        {footer ? (
          <footer className="relative z-20 w-full px-4 py-4 text-xs text-white/70">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Resolves the venue image URL from the pieces the public session endpoint
 * returns. Returns null when the venue has no uploaded image.
 */
export function buildVenueImageUrl(opts: {
  venueSlug?: string | null;
  venueHasImage?: boolean | null;
  venueImageUpdatedAt?: string | null;
}): string | null {
  if (!opts.venueSlug || !opts.venueHasImage) return null;
  const v = opts.venueImageUpdatedAt
    ? `?v=${encodeURIComponent(opts.venueImageUpdatedAt)}`
    : "";
  return `/api/venues/${encodeURIComponent(opts.venueSlug)}/image${v}`;
}
