import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { cinematicClerkAppearance } from "@/components/auth/clerkAppearance";
import { FilmGrain } from "@/components/marketing/FilmGrain";

export default function Page() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--stage-bg)] p-6 text-white">
      <FilmGrain />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 0%, color-mix(in oklab, var(--neon-magenta) 22%, transparent), transparent 55%), radial-gradient(ellipse at 80% 100%, color-mix(in oklab, var(--neon-cyan) 18%, transparent), transparent 55%)",
        }}
      />
      <div className="relative z-10 flex w-full max-w-md flex-col items-center">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-white"
          aria-label="Back to trivia.box"
        >
          <span
            aria-hidden
            className="inline-flex size-7 items-center justify-center rounded-lg text-sm font-black"
            style={{
              background:
                "linear-gradient(135deg, var(--neon-magenta), var(--neon-violet))",
              color: "var(--neon-lime)",
              boxShadow:
                "0 0 0 1px color-mix(in oklab, var(--neon-magenta) 40%, transparent), 0 6px 20px -8px color-mix(in oklab, var(--neon-magenta) 65%, transparent)",
            }}
          >
            T
          </span>
          <span className="text-sm font-semibold uppercase tracking-[0.28em] text-white/80 transition-colors hover:text-white">
            trivia.box
          </span>
        </Link>
        <SignIn
          routing="path"
          path="/sign-in"
          signUpUrl="/sign-up"
          forceRedirectUrl="/dashboard"
          appearance={cinematicClerkAppearance}
        />
      </div>
    </div>
  );
}
