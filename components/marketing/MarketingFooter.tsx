import Link from "next/link";

const COLS: Array<{ heading: string; links: Array<{ href: string; label: string }> }> = [
  {
    heading: "Play",
    links: [
      { href: "/play", label: "Play hub" },
      { href: "/play/solo", label: "Solo run" },
      { href: "/join", label: "Join with code" },
      { href: "/games/upcoming", label: "Upcoming nights" },
    ],
  },
  {
    heading: "Community",
    links: [
      { href: "/decks", label: "Deck marketplace" },
      { href: "/leaderboards", label: "Leaderboards" },
      { href: "/sign-up", label: "Create an account" },
    ],
  },
  {
    heading: "Hosts",
    links: [
      { href: "/dashboard", label: "Host dashboard" },
      { href: "/dashboard/decks", label: "My decks" },
      { href: "/dashboard/venue", label: "Venue settings" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/sign-in", label: "Sign in" },
      { href: "/sign-up", label: "Sign up" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="relative z-10 border-t border-white/10 bg-[color-mix(in_oklab,var(--stage-bg)_92%,transparent)]">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-14 md:grid-cols-[1.3fr_2fr]">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-flex size-8 items-center justify-center rounded-lg text-sm font-black"
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
            <span className="text-base font-semibold uppercase tracking-[0.24em] text-white">
              trivia.box
            </span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
            Built for the bars that take their quiz night seriously. Free house
            games every 15 minutes, live venue nights, and solo runs for the days
            nothing else is on.
          </p>
          <div
            className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70"
            aria-live="polite"
          >
            <span
              aria-hidden
              className="inline-block size-2 rounded-full"
              style={{
                background: "var(--neon-lime)",
                boxShadow:
                  "0 0 0 3px color-mix(in oklab, var(--neon-lime) 22%, transparent)",
              }}
            />
            House game running every 15 min
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {COLS.map((col) => (
            <div key={col.heading}>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/50">
                {col.heading}
              </div>
              <ul className="flex flex-col gap-2 text-sm">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-white/75 transition-colors hover:text-white"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-5 text-xs text-white/50">
          <div>© {new Date().getUTCFullYear()} Trivia.Box — all rights reserved.</div>
          <div className="flex items-center gap-4">
            <Link href="/sign-in" className="hover:text-white">
              Sign in
            </Link>
            <Link href="/sign-up" className="hover:text-white">
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
