import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { FilmGrain } from "@/components/marketing/FilmGrain";
import { cn } from "@/lib/utils";

export const metadata = { title: "Not found" };

/**
 * Branded 404 — hit for unknown usernames (`/u/:nope`), unknown venues
 * (`/v/:nope`), and any other unmatched route. Next's default fallback is a
 * bare white "404" page, which would look broken against our neon theme
 * especially once someone lands here from a shared profile link.
 */
export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[var(--stage-bg)] px-6 py-16 text-white">
      <FilmGrain />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 20% 10%, color-mix(in oklab, var(--neon-magenta) 24%, transparent), transparent 55%), radial-gradient(ellipse at 80% 90%, color-mix(in oklab, var(--neon-cyan) 20%, transparent), transparent 55%)",
        }}
      />
      <div className="relative z-10 flex w-full max-w-xl flex-col items-center text-center">
        <div
          className="text-[0.75rem] font-semibold uppercase tracking-[0.32em] text-white/60"
        >
          404 · Off the map
        </div>
        <h1
          className="mt-3 text-5xl font-semibold tracking-tight text-white sm:text-6xl"
          style={{
            backgroundImage:
              "linear-gradient(90deg, var(--neon-magenta) 0%, var(--neon-lime) 50%, var(--neon-cyan) 100%)",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            color: "transparent",
          }}
        >
          Page not found
        </h1>
        <p className="mt-4 max-w-md text-sm text-white/70">
          That link doesn&apos;t point anywhere on trivia.box. It might have
          moved, expired, or never existed.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/"
            className={cn(
              buttonVariants({ size: "sm" }),
              "h-9 px-4 text-[0.8rem] font-bold uppercase tracking-[0.14em] text-[color:var(--primary-foreground)]"
            )}
            style={{
              background:
                "linear-gradient(135deg, var(--neon-magenta), var(--neon-violet))",
              boxShadow:
                "0 0 0 1px color-mix(in oklab, var(--neon-magenta) 45%, transparent), 0 8px 24px -8px color-mix(in oklab, var(--neon-magenta) 70%, transparent)",
            }}
          >
            Back to home
          </Link>
          <Link
            href="/play"
            className={cn(
              buttonVariants({ variant: "secondary", size: "sm" }),
              "h-9 px-4 text-[0.8rem] font-semibold uppercase tracking-[0.14em]"
            )}
          >
            Play a game
          </Link>
        </div>
      </div>
    </div>
  );
}
