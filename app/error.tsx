"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import { buttonVariants } from "@/components/ui/button";
import { FilmGrain } from "@/components/marketing/FilmGrain";
import { cn } from "@/lib/utils";

/**
 * Branded root error boundary for client-rendered failures. `global-error.tsx`
 * still exists as the *catastrophic* RSC fallback; this one catches the
 * more common "a route component threw" case and keeps the user inside our
 * chrome with a clear retry.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // No-op when Sentry DSN isn't configured — the SDK init is gated in
    // `sentry.server.config.ts` / `instrumentation-client.ts`.
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[var(--stage-bg)] px-6 py-16 text-white">
      <FilmGrain />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 20% 10%, color-mix(in oklab, var(--neon-magenta) 22%, transparent), transparent 55%), radial-gradient(ellipse at 80% 100%, color-mix(in oklab, var(--neon-cyan) 20%, transparent), transparent 55%)",
        }}
      />
      <div className="relative z-10 flex w-full max-w-xl flex-col items-center text-center">
        <div className="text-[0.75rem] font-semibold uppercase tracking-[0.32em] text-white/60">
          Something broke
        </div>
        <h1
          className="mt-3 text-5xl font-semibold tracking-tight sm:text-6xl"
          style={{
            backgroundImage:
              "linear-gradient(90deg, var(--neon-magenta) 0%, var(--neon-lime) 50%, var(--neon-cyan) 100%)",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            color: "transparent",
          }}
        >
          Unexpected error
        </h1>
        <p className="mt-4 max-w-md text-sm text-white/70">
          We logged it and will take a look. Try again — most of the time a
          retry gets you back into the game.
        </p>
        {error?.digest ? (
          <p className="mt-2 font-mono text-[0.7rem] tracking-[0.18em] text-white/40">
            ref · {error.digest}
          </p>
        ) : null}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
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
            Try again
          </button>
          <Link
            href="/"
            className={cn(
              buttonVariants({ variant: "secondary", size: "sm" }),
              "h-9 px-4 text-[0.8rem] font-semibold uppercase tracking-[0.14em]"
            )}
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
