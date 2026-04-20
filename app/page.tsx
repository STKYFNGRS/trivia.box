import Link from "next/link";
import { Gamepad2, Library, Mic2, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Mic2,
    title: "Hosted trivia nights",
    description:
      "Run your room live — pause, skip, swap questions, and drive the big screen from your phone.",
  },
  {
    icon: Sparkles,
    title: "Autopilot",
    description:
      "Schedule a game, walk away. We start the round, keep the timer, and reveal the answers.",
  },
  {
    icon: Library,
    title: "Deck marketplace",
    description:
      "Browse community-submitted decks or publish your own — monetize a format that fills seats.",
  },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--stage-bg)] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 20% -10%, rgb(34 211 238 / 0.18), transparent 55%), radial-gradient(ellipse at 80% 110%, rgb(16 185 129 / 0.12), transparent 55%), radial-gradient(ellipse at center, transparent 55%, rgb(0 0 0 / 0.55) 100%)",
        }}
      />
      <div aria-hidden className="grain pointer-events-none absolute inset-0">
        <div className="grain-layer" />
      </div>

      <main className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-10">
        <header className="flex items-center justify-between gap-4">
          <div className="text-sm font-semibold uppercase tracking-[0.3em] text-white/70">
            trivia.box
          </div>
          <nav className="flex items-center gap-2">
            <Link
              href="/sign-in"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "text-white hover:bg-white/10 hover:text-white"
              )}
            >
              Sign in
            </Link>
            <Link
              href="/games/upcoming"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "hidden text-white hover:bg-white/10 hover:text-white sm:inline-flex"
              )}
            >
              Upcoming games
            </Link>
          </nav>
        </header>

        <section className="mt-16 flex flex-1 flex-col items-start gap-8 md:mt-24">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/80 ring-1 ring-white/15 backdrop-blur">
            <Gamepad2 className="h-3.5 w-3.5" />
            Bar trivia, rebuilt
          </span>
          <h1 className="max-w-4xl text-5xl font-black leading-[1.05] tracking-tight md:text-7xl">
            The trivia night your regulars
            <span className="block bg-gradient-to-r from-cyan-300 via-sky-200 to-emerald-200 bg-clip-text text-transparent">
              keep showing up for.
            </span>
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-white/75 md:text-xl">
            One account plays and one account hosts. Sign up as a player tonight; upgrade to a host plan
            from your dashboard whenever you&rsquo;re ready to run the room.
          </p>

          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/join"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-12 bg-[var(--stage-accent)] px-6 text-base font-semibold text-slate-950 shadow-[var(--shadow-hero)] hover:bg-[var(--stage-accent)]/90"
              )}
            >
              Join a game
            </Link>
            <Link
              href="/sign-up"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-12 border-white/20 bg-white/5 px-6 text-base font-semibold text-white backdrop-blur hover:bg-white/10 hover:text-white"
              )}
            >
              Host a game
            </Link>
            <Link
              href="/games/upcoming"
              className="text-sm font-medium text-white/70 underline-offset-4 hover:text-white hover:underline sm:ml-3"
            >
              Browse upcoming games &rarr;
            </Link>
          </div>
        </section>

        <section className="mt-20 grid grid-cols-1 gap-4 md:mt-28 md:grid-cols-3">
          {features.map((f) => (
            <Card
              key={f.title}
              className="border-white/10 bg-white/[0.04] text-white shadow-[var(--shadow-card)] backdrop-blur"
            >
              <CardContent className="flex flex-col gap-3 p-6">
                <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--stage-accent)]/15 text-[var(--stage-accent)] ring-1 ring-[var(--stage-accent)]/30">
                  <f.icon className="h-5 w-5" />
                </div>
                <div className="text-lg font-semibold tracking-tight">{f.title}</div>
                <p className="text-sm leading-relaxed text-white/70">{f.description}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/50">
          <div>© {new Date().getUTCFullYear()} Trivia.Box</div>
          <div className="flex items-center gap-4">
            <Link href="/join" className="hover:text-white">
              Join
            </Link>
            <Link href="/sign-up" className="hover:text-white">
              Sign up
            </Link>
            <Link href="/sign-in" className="hover:text-white">
              Sign in
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
