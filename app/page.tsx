import {
  ArrowRight,
  Crown,
  Gauge,
  Gamepad2,
  Library,
  Mic2,
  PlayCircle,
  Radio,
  Sparkles,
  Star,
  Timer,
  Trophy,
  Users,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { GradientMesh } from "@/components/marketing/GradientMesh";
import { HomeHeroReveal } from "@/components/marketing/HomeHeroReveal";
import { HomeSectionFade } from "@/components/marketing/HomeSectionFade";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Marquee } from "@/components/marketing/Marquee";
import { NeonCard, type NeonTone } from "@/components/marketing/NeonCard";
import { NumberTicker } from "@/components/marketing/NumberTicker";
import { listMarketplaceDecks } from "@/lib/deckMarketplace";
import { getNextHouseGame } from "@/lib/game/houseGames";
import { getGlobalStats } from "@/lib/stats/aggregate";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Arcade-neon landing page. Sections (top → bottom):
 *   1. Hero — oversized display type, triple CTA, next-house-game chip
 *   2. Live ticker — marquee of platform activity
 *   3. Play-modes trio — Solo · House · Venue nights
 *   4. Deck marketplace preview — top-rated community decks
 *   5. Creator pitch — build decks, earn badges
 *   6. Stats band — counters with neon underlines
 *   7. Host pitch — three-step explainer
 *   8. Leaderboard teaser — top 5 global players
 *   9. FAQ — native <details> accordion
 *  10. Closer — repeated triple CTA at scale
 *
 * All data fetches fan out with `Promise.all` on the server and fall back to
 * neutral defaults so a cold cache can never crash the home page.
 */
export default async function HomePage() {
  const now = new Date();

  const [nextHouse, globalStats, topDecks] = await Promise.all([
    getNextHouseGame(now).catch(() => null),
    getGlobalStats().catch(() => null),
    listMarketplaceDecks({ sort: "top_rated", limit: 8 }).catch(() => ({
      decks: [] as Awaited<ReturnType<typeof listMarketplaceDecks>>["decks"],
      total: 0,
    })),
  ]);

  const msToNextHouse = nextHouse
    ? Math.max(0, nextHouse.eventStartsAt.getTime() - now.getTime())
    : null;
  const houseCountdown = formatCountdown(msToNextHouse, nextHouse?.status);

  return (
    <MarketingShell wide>
      <Hero houseCountdown={houseCountdown} />
      <LiveTicker
        stats={globalStats?.totals ?? null}
        category={globalStats?.topCategories[0]?.category ?? null}
      />
      <PlayModes nextHouse={houseCountdown} />
      <DeckPreview decks={topDecks.decks.slice(0, 6)} />
      <CreatorPitch />
      <StatsBand stats={globalStats?.totals ?? null} />
      <HostPitch />
      <LeaderboardTeaser players={globalStats?.topPlayers.slice(0, 5) ?? []} />
      <FaqSection />
      <Closer />
    </MarketingShell>
  );
}

function Hero({ houseCountdown }: { houseCountdown: string }) {
  return (
    <section className="relative isolate overflow-hidden pt-6 pb-20 md:pt-12 md:pb-28">
      <GradientMesh className="-z-10" />
      <div className="mx-auto w-full max-w-7xl px-6">
        <HomeHeroReveal>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/85 backdrop-blur">
            <span
              aria-hidden
              className="inline-block size-1.5 rounded-full"
              style={{
                background: "var(--neon-lime)",
                boxShadow:
                  "0 0 0 3px color-mix(in oklab, var(--neon-lime) 22%, transparent)",
              }}
            />
            {houseCountdown}
          </div>

          <h1
            className="mt-6 font-[family-name:var(--font-display)] font-extrabold tracking-[-0.04em] text-white"
            style={{
              fontSize: "clamp(3rem, 10vw, 9rem)",
              lineHeight: 0.92,
            }}
          >
            <span className="block">Trivia that</span>
            <span
              className="block bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, var(--neon-magenta) 0%, var(--neon-amber) 40%, var(--neon-lime) 70%, var(--neon-cyan) 100%)",
              }}
            >
              earns the pint.
            </span>
          </h1>

          <p className="mt-7 max-w-2xl text-lg leading-relaxed text-white/75 md:text-xl">
            A free house game every 30 minutes, live venue nights, and
            server-scored solo runs. One app for players, one dashboard for
            hosts. No CSV wrangling.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/play/solo"
              className={cn(
                buttonVariants({ size: "lg" }),
                "group/btn h-12 px-6 text-base font-bold uppercase tracking-[0.12em]"
              )}
              style={{
                background:
                  "linear-gradient(135deg, var(--neon-magenta), var(--neon-violet))",
                color: "oklch(0.1 0.02 270)",
                boxShadow:
                  "0 0 0 1px color-mix(in oklab, var(--neon-magenta) 45%, transparent), 0 16px 50px -12px color-mix(in oklab, var(--neon-magenta) 70%, transparent)",
              }}
            >
              Play solo now
              <ArrowRight className="ml-1 size-4 transition-transform group-hover/btn:translate-x-0.5" />
            </Link>
            <Link
              href="/join"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-12 border-white/20 bg-white/5 px-6 text-base font-semibold text-white backdrop-blur hover:bg-white/10 hover:text-white"
              )}
            >
              Have a code? Join
            </Link>
            <Link
              href="/sign-up"
              className="ml-1 inline-flex items-center gap-1 text-sm font-medium text-white/65 underline-offset-4 hover:text-white hover:underline"
            >
              Host a game
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </HomeHeroReveal>

        {/* Mini "phone" visual — bottom-right hero ornament. Purely cosmetic,
            uses only CSS shapes so there's zero asset weight. */}
        <HeroOrnament />
      </div>
    </section>
  );
}

function HeroOrnament() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -right-24 top-24 hidden rotate-[8deg] lg:block"
    >
      <div
        className="relative h-[560px] w-[300px] rounded-[44px] border border-white/10 p-3"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--stage-surface) 96%, transparent), color-mix(in oklab, var(--stage-bg) 90%, transparent))",
          boxShadow:
            "0 40px 80px -30px rgb(0 0 0 / 0.6), 0 0 0 1px color-mix(in oklab, var(--neon-magenta) 20%, transparent)",
        }}
      >
        <div
          className="flex h-full w-full flex-col gap-2 rounded-[32px] p-4"
          style={{
            background:
              "radial-gradient(120% 80% at 20% 0%, color-mix(in oklab, var(--neon-magenta) 28%, transparent), transparent), radial-gradient(100% 60% at 80% 100%, color-mix(in oklab, var(--neon-cyan) 22%, transparent), transparent), var(--stage-bg)",
          }}
        >
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.22em] text-white/70">
            <span>Question 4 / 10</span>
            <span style={{ color: "var(--neon-lime)" }}>0:12</span>
          </div>
          <div className="font-[family-name:var(--font-display)] text-[20px] font-bold leading-tight text-white">
            Which UK city was the first to be designated a UNESCO City of
            Music?
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[
              ["A", "Bristol", "var(--neon-magenta)"],
              ["B", "Glasgow", "var(--neon-lime)"],
              ["C", "Liverpool", "var(--neon-cyan)"],
              ["D", "Manchester", "var(--neon-amber)"],
            ].map(([k, v, c]) => (
              <div
                key={k}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white"
                style={{
                  background:
                    "color-mix(in oklab, var(--stage-surface) 88%, transparent)",
                  borderLeft: `3px solid ${c}`,
                }}
              >
                <span
                  className="grid size-5 place-items-center rounded-md text-[10px] font-black"
                  style={{ background: c, color: "oklch(0.1 0.02 270)" }}
                >
                  {k}
                </span>
                {v}
              </div>
            ))}
          </div>
          <div className="mt-auto flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] p-3 text-[11px] text-white/70">
            <span>
              <span
                className="font-bold"
                style={{ color: "var(--neon-lime)" }}
              >
                +842
              </span>{" "}
              streak bonus
            </span>
            <span>6-room leaderboard</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveTicker({
  stats,
  category,
}: {
  stats: { totalAnswers: number; totalPlayers: number; activeGames: number } | null;
  category: string | null;
}) {
  const items: Array<{ icon: React.ReactNode; text: string }> = [
    {
      icon: <Radio className="size-3.5" />,
      text: `${(stats?.activeGames ?? 0).toLocaleString()} games live right now`,
    },
    {
      icon: <Users className="size-3.5" />,
      text: `${(stats?.totalPlayers ?? 0).toLocaleString()} players on the board`,
    },
    {
      icon: <Sparkles className="size-3.5" />,
      text: `${(stats?.totalAnswers ?? 0).toLocaleString()} questions answered all-time`,
    },
    {
      icon: <Timer className="size-3.5" />,
      text: "Next free house game drops every :00 and :30",
    },
    {
      icon: <Library className="size-3.5" />,
      text: "Community decks are free to play",
    },
    ...(category
      ? [
          {
            icon: <Gauge className="size-3.5" />,
            text: `Top category this week: ${category}`,
          },
        ]
      : []),
  ];

  return (
    <section
      aria-label="Live platform activity"
      className="relative border-y border-white/10 bg-black/40"
    >
      <Marquee>
        {items.map((it, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-2 py-4 text-[13px] font-semibold uppercase tracking-[0.2em] text-white/80"
          >
            <span
              className="inline-flex items-center justify-center"
              style={{ color: "var(--neon-lime)" }}
            >
              {it.icon}
            </span>
            {it.text}
            <span
              aria-hidden
              className="ml-10 inline-block size-1 rounded-full"
              style={{ background: "color-mix(in oklab, var(--neon-lime) 65%, transparent)" }}
            />
          </span>
        ))}
      </Marquee>
    </section>
  );
}

function PlayModes({ nextHouse }: { nextHouse: string }) {
  const modes: Array<{
    tone: NeonTone;
    title: string;
    subtitle: string;
    body: string;
    cta: { href: string; label: string };
    meta: string;
    icon: React.ReactNode;
  }> = [
    {
      tone: "magenta",
      title: "Solo run",
      subtitle: "Any time · 5-25 Qs",
      body: "Pick your pace and categories. Server-timed, server-scored. Sign in to keep your streaks and XP.",
      cta: { href: "/play/solo", label: "Start a solo run" },
      meta: "Chill · Standard · Blitz",
      icon: <PlayCircle className="size-5" />,
    },
    {
      tone: "lime",
      title: "House game",
      subtitle: "Free · Every 30 min",
      body: "Our always-on autopilot round. Jump in anonymously, climb the live board, brag in the group chat.",
      cta: { href: "/play", label: "See the next round" },
      meta: nextHouse,
      icon: <Radio className="size-5" />,
    },
    {
      tone: "cyan",
      title: "Venue nights",
      subtitle: "Live · Near you",
      body: "Real bars. Real hosts. Real pints. Find a public room tonight and bring the group chat.",
      cta: { href: "/games/upcoming", label: "Find a live game" },
      meta: "Hosted + autopilot rooms",
      icon: <Mic2 className="size-5" />,
    },
  ];

  return (
    <section className="relative py-20 md:py-28">
      <div className="mx-auto w-full max-w-7xl px-6">
        <HomeSectionFade>
          <SectionEyebrow accent="cyan">Three ways to play</SectionEyebrow>
          <SectionTitle>
            Pick your <span className="italic">mode</span>.
          </SectionTitle>
          <SectionLead>
            Trivia that works whether you&rsquo;re killing 10 minutes at a bus
            stop or filling a bar with 80 teams on a Tuesday.
          </SectionLead>
        </HomeSectionFade>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {modes.map((m) => (
            <NeonCard
              key={m.title}
              tone={m.tone}
              as={Link}
              href={m.cta.href}
              interactive
              className="group flex h-full flex-col gap-5 p-7"
            >
              <div className="flex items-center justify-between">
                <span
                  className="inline-flex size-10 items-center justify-center rounded-xl"
                  style={{
                    background: `color-mix(in oklab, var(--neon-${m.tone}) 20%, transparent)`,
                    color: `var(--neon-${m.tone})`,
                    boxShadow: `inset 0 0 0 1px color-mix(in oklab, var(--neon-${m.tone}) 45%, transparent)`,
                  }}
                >
                  {m.icon}
                </span>
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.22em]"
                  style={{ color: `var(--neon-${m.tone})` }}
                >
                  {m.subtitle}
                </span>
              </div>
              <div>
                <div className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-white">
                  {m.title}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-white/70">
                  {m.body}
                </p>
              </div>
              <div className="mt-auto flex items-center justify-between pt-2 text-xs text-white/55">
                <span>{m.meta}</span>
                <span className="inline-flex items-center gap-1 font-semibold text-white transition-transform group-hover:translate-x-0.5">
                  {m.cta.label}
                  <ArrowRight className="size-3.5" />
                </span>
              </div>
            </NeonCard>
          ))}
        </div>
      </div>
    </section>
  );
}

function DeckPreview({
  decks,
}: {
  decks: Awaited<ReturnType<typeof listMarketplaceDecks>>["decks"];
}) {
  const tones: NeonTone[] = ["magenta", "cyan", "lime", "amber", "violet"];

  return (
    <section className="relative py-20 md:py-28">
      <div className="mx-auto w-full max-w-7xl px-6">
        <HomeSectionFade>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <SectionEyebrow accent="lime">Community decks</SectionEyebrow>
              <SectionTitle>
                Built by your favorite <span className="italic">freaks</span>.
              </SectionTitle>
              <SectionLead className="mt-3">
                Weird categories, sharp writing, venue-ready formats. Play any
                deck free — and if you write one, we&rsquo;ll put it on bar TVs
                nationwide.
              </SectionLead>
            </div>
            <Link
              href="/decks"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
              )}
            >
              Browse marketplace
              <ArrowRight className="ml-1 size-3.5" />
            </Link>
          </div>
        </HomeSectionFade>

        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {decks.length === 0
            ? // Placeholder skeletons (very rare — only on an empty DB).
              Array.from({ length: 3 }).map((_, i) => (
                <NeonCard key={i} tone={tones[i % tones.length]} className="h-40 p-6">
                  <div className="text-sm text-white/60">
                    New community decks are publishing daily. Check back soon.
                  </div>
                </NeonCard>
              ))
            : decks.map((d, i) => (
                <NeonCard
                  key={d.id}
                  tone={tones[i % tones.length]}
                  as={Link}
                  href={`/decks/${d.id}`}
                  interactive
                  className="flex h-full flex-col gap-4 p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-white">
                        {d.name}
                      </div>
                      <div className="mt-1 truncate text-xs text-white/60">
                        by {d.ownerName}
                      </div>
                    </div>
                    {d.avgRating > 0 ? (
                      <div
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[11px] font-semibold"
                        style={{ color: "var(--neon-amber)" }}
                      >
                        <Star className="size-3 fill-current" />
                        {d.avgRating.toFixed(1)}
                      </div>
                    ) : null}
                  </div>
                  {d.description ? (
                    <p className="line-clamp-2 text-sm text-white/70">
                      {d.description}
                    </p>
                  ) : (
                    <p className="text-sm text-white/55">
                      No description — the vibes speak for themselves.
                    </p>
                  )}
                  <div className="mt-auto flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em]">
                    {d.defaultCategory ? (
                      <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-white/85">
                        {d.defaultCategory}
                      </span>
                    ) : null}
                    <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-white/70">
                      {d.questionCount} Qs
                    </span>
                    {d.timesUsed > 0 ? (
                      <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-white/70">
                        {d.timesUsed} plays
                      </span>
                    ) : null}
                  </div>
                </NeonCard>
              ))}
        </div>
      </div>
    </section>
  );
}

function CreatorPitch() {
  return (
    <section className="relative py-20 md:py-28">
      <div className="mx-auto w-full max-w-7xl px-6">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <HomeSectionFade>
            <SectionEyebrow accent="magenta">For creators</SectionEyebrow>
            <SectionTitle>
              Your weird deck,
              <span
                className="block bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, var(--neon-magenta), var(--neon-amber))",
                }}
              >
                on bar TVs.
              </span>
            </SectionTitle>
            <SectionLead className="mt-3">
              Write once, get played by thousands. Earn badges as your decks
              climb the ratings. We&rsquo;re cooking real creator payouts next.
            </SectionLead>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/sign-up"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-11 px-5 text-sm font-bold uppercase tracking-[0.12em]"
                )}
                style={{
                  background:
                    "linear-gradient(135deg, var(--neon-magenta), var(--neon-amber))",
                  color: "oklch(0.1 0.02 270)",
                  boxShadow:
                    "0 0 0 1px color-mix(in oklab, var(--neon-magenta) 35%, transparent), 0 14px 40px -14px color-mix(in oklab, var(--neon-magenta) 60%, transparent)",
                }}
              >
                Start publishing
              </Link>
              <Link
                href="/decks"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "h-11 border-white/20 bg-transparent px-5 text-sm font-semibold text-white hover:bg-white/10 hover:text-white"
                )}
              >
                See what others made
              </Link>
            </div>
          </HomeSectionFade>

          <HomeSectionFade delay={0.1}>
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  icon: <Crown className="size-4" />,
                  tone: "amber" as NeonTone,
                  title: "Hall of Flame",
                  body: "Top-rated decks get featured on the marketplace.",
                },
                {
                  icon: <Trophy className="size-4" />,
                  tone: "magenta" as NeonTone,
                  title: "Creator badges",
                  body: "Earn perks as your decks rack up plays and ratings.",
                },
                {
                  icon: <Wand2 className="size-4" />,
                  tone: "cyan" as NeonTone,
                  title: "AI-assist",
                  body: "Draft questions in bulk with smart category balance.",
                },
                {
                  icon: <Gamepad2 className="size-4" />,
                  tone: "lime" as NeonTone,
                  title: "Play-ready",
                  body: "Decks drop straight into solo, house, and venue modes.",
                },
              ].map((p) => (
                <NeonCard key={p.title} tone={p.tone} className="flex flex-col gap-2 p-5">
                  <span
                    className="inline-flex size-9 items-center justify-center rounded-xl"
                    style={{
                      background: `color-mix(in oklab, var(--neon-${p.tone}) 22%, transparent)`,
                      color: `var(--neon-${p.tone})`,
                      boxShadow: `inset 0 0 0 1px color-mix(in oklab, var(--neon-${p.tone}) 45%, transparent)`,
                    }}
                  >
                    {p.icon}
                  </span>
                  <div className="mt-1 font-[family-name:var(--font-display)] text-base font-bold tracking-tight text-white">
                    {p.title}
                  </div>
                  <p className="text-xs leading-relaxed text-white/65">
                    {p.body}
                  </p>
                </NeonCard>
              ))}
            </div>
          </HomeSectionFade>
        </div>
      </div>
    </section>
  );
}

function StatsBand({
  stats,
}: {
  stats: {
    completedGames: number;
    activeGames: number;
    totalPlayers: number;
    totalAnswers: number;
  } | null;
}) {
  const items: Array<{ label: string; value: number; tone: NeonTone }> = [
    {
      label: "Questions answered",
      value: stats?.totalAnswers ?? 0,
      tone: "magenta",
    },
    { label: "Players on the board", value: stats?.totalPlayers ?? 0, tone: "cyan" },
    {
      label: "Games completed",
      value: stats?.completedGames ?? 0,
      tone: "lime",
    },
    { label: "Live right now", value: stats?.activeGames ?? 0, tone: "amber" },
  ];

  return (
    <section className="relative border-y border-white/10 bg-black/40 py-14 md:py-20">
      <div className="mx-auto w-full max-w-7xl px-6">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {items.map((it) => (
            <div key={it.label} className="flex flex-col gap-2">
              <div className="font-[family-name:var(--font-display)] text-4xl font-bold tabular-nums tracking-tight text-white md:text-6xl">
                <NumberTicker value={it.value} />
              </div>
              <span
                aria-hidden
                className="block h-0.5 w-12"
                style={{
                  background: `linear-gradient(90deg, var(--neon-${it.tone}), transparent)`,
                }}
              />
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/60">
                {it.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HostPitch() {
  const steps = [
    {
      n: "01",
      title: "Make an account",
      body: "Sign up, add your venue, pick a timezone. Two minutes flat.",
    },
    {
      n: "02",
      title: "Pick a deck",
      body: "Use a community deck, auto-generate one, or write your own.",
    },
    {
      n: "03",
      title: "Press go",
      body: "Big-screen TV, phone remote, leaderboard live. We handle timing and scoring.",
    },
  ];
  return (
    <section className="relative py-20 md:py-28">
      <div className="mx-auto w-full max-w-7xl px-6">
        <HomeSectionFade>
          <SectionEyebrow accent="amber">For hosts</SectionEyebrow>
          <SectionTitle>
            Run trivia without the <span className="italic">spreadsheet</span>.
          </SectionTitle>
          <SectionLead>
            We do the timers, the scoring, the big-screen display, and the
            anti-cheat. You do the heckling.
          </SectionLead>
        </HomeSectionFade>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <NeonCard
              key={s.n}
              tone={(["magenta", "cyan", "lime"] as NeonTone[])[i]}
              className="flex flex-col gap-3 p-7"
            >
              <div
                className="font-[family-name:var(--font-display)] text-5xl font-black tracking-tight"
                style={{ color: "var(--neon-amber)" }}
              >
                {s.n}
              </div>
              <div className="text-xl font-bold tracking-tight text-white">
                {s.title}
              </div>
              <p className="text-sm leading-relaxed text-white/70">{s.body}</p>
            </NeonCard>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            href="/sign-up"
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-12 px-6 text-base font-bold uppercase tracking-[0.12em]"
            )}
            style={{
              background:
                "linear-gradient(135deg, var(--neon-amber), var(--neon-magenta))",
              color: "oklch(0.1 0.02 270)",
              boxShadow:
                "0 0 0 1px color-mix(in oklab, var(--neon-amber) 35%, transparent), 0 16px 50px -14px color-mix(in oklab, var(--neon-amber) 60%, transparent)",
            }}
          >
            Host a game
          </Link>
          <Link
            href="/dashboard"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "h-12 border-white/20 bg-transparent px-6 text-base font-semibold text-white hover:bg-white/10 hover:text-white"
            )}
          >
            Open dashboard
          </Link>
        </div>
      </div>
    </section>
  );
}

function LeaderboardTeaser({
  players,
}: {
  players: Array<{ username: string; totalPoints: number; totalGames: number }>;
}) {
  const tones: NeonTone[] = ["magenta", "cyan", "lime", "amber", "violet"];
  return (
    <section className="relative py-20 md:py-28">
      <div className="mx-auto w-full max-w-7xl px-6">
        <HomeSectionFade>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <SectionEyebrow accent="violet">The Hall of Fame</SectionEyebrow>
              <SectionTitle>
                Top players <span className="italic">right now</span>.
              </SectionTitle>
            </div>
            <Link
              href="/leaderboards"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
              )}
            >
              See full board
              <ArrowRight className="ml-1 size-3.5" />
            </Link>
          </div>
        </HomeSectionFade>
        <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          {players.length === 0 ? (
            <div className="p-8 text-sm text-white/60">
              The leaderboard boots up as soon as the first games wrap. Play a
              solo run to get on it.
            </div>
          ) : (
            <ul>
              {players.map((p, i) => (
                <li
                  key={p.username + i}
                  className="grid grid-cols-[64px_1fr_auto_auto] items-center gap-4 border-b border-white/5 px-5 py-4 last:border-0 md:gap-6 md:px-7"
                >
                  <div
                    className="font-[family-name:var(--font-display)] text-2xl font-black tabular-nums md:text-3xl"
                    style={{ color: `var(--neon-${tones[i]})` }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="truncate text-base font-semibold tracking-tight text-white">
                    {p.username}
                  </div>
                  <div className="text-xs text-white/55">
                    {p.totalGames} games
                  </div>
                  <div className="font-mono text-sm font-bold tabular-nums text-white">
                    {p.totalPoints.toLocaleString()} pts
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  const faqs: Array<{ q: string; a: string }> = [
    {
      q: "Do I need an account to play?",
      a: "Solo runs work fully anonymously — jump in with one tap. Multiplayer games (house rounds + venue nights) ask for a free account so your name appears on the leaderboard and your streaks, XP, and rank persist across devices.",
    },
    {
      q: "How often do free house games run?",
      a: "Every 30 minutes, around the clock. The autopilot scheduler queues the next round automatically, so there's always one within reach.",
    },
    {
      q: "What does a host pay for?",
      a: "Free to try. Paid tiers unlock scheduled venue nights, custom branding, printed prize claim flows, and premium deck slots.",
    },
    {
      q: "Can I build my own deck?",
      a: "Yes. Sign up, open the host dashboard, and head to Decks. You can write questions, AI-assist drafts, and publish to the marketplace for free.",
    },
    {
      q: "Is this just Kahoot in a new coat?",
      a: "We share the 4-choice format, but trivia.box is venue-first: real scheduling, venue pages, prize claim flows, anti-cheat, and a public marketplace for decks.",
    },
    {
      q: "Does it work on TV?",
      a: "Yes — every game has a big-screen display URL that auto-advances in sync with the host's phone.",
    },
  ];
  return (
    <section className="relative py-20 md:py-28">
      <div className="mx-auto w-full max-w-3xl px-6">
        <HomeSectionFade>
          <SectionEyebrow accent="cyan">Questions</SectionEyebrow>
          <SectionTitle>Frequently asked.</SectionTitle>
        </HomeSectionFade>
        <div className="mt-8 divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group/faq px-5 py-4 transition-colors hover:bg-white/[0.02] md:px-6"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-white">
                <span className="text-base md:text-lg">{f.q}</span>
                <span
                  aria-hidden
                  className="inline-grid size-6 place-items-center rounded-full text-xs font-black transition-transform group-open/faq:rotate-45"
                  style={{
                    background: "color-mix(in oklab, var(--neon-cyan) 18%, transparent)",
                    color: "var(--neon-cyan)",
                    boxShadow:
                      "inset 0 0 0 1px color-mix(in oklab, var(--neon-cyan) 40%, transparent)",
                  }}
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-white/70">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Closer() {
  return (
    <section className="relative overflow-hidden py-28 md:py-40">
      <GradientMesh className="-z-10 opacity-80" />
      <div className="mx-auto w-full max-w-7xl px-6 text-center">
        <h2
          className="mx-auto max-w-5xl font-[family-name:var(--font-display)] font-extrabold tracking-[-0.04em] text-white"
          style={{
            fontSize: "clamp(2.5rem, 9vw, 8rem)",
            lineHeight: 0.95,
          }}
        >
          Ready?
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg text-white/70">
          A round takes about 5 minutes. The house game is free, always on, and
          one tap away.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/play/solo"
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-12 px-6 text-base font-bold uppercase tracking-[0.12em]"
            )}
            style={{
              background:
                "linear-gradient(135deg, var(--neon-magenta), var(--neon-violet))",
              color: "oklch(0.1 0.02 270)",
              boxShadow:
                "0 0 0 1px color-mix(in oklab, var(--neon-magenta) 45%, transparent), 0 18px 60px -14px color-mix(in oklab, var(--neon-magenta) 70%, transparent)",
            }}
          >
            Play solo now
          </Link>
          <Link
            href="/join"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "h-12 border-white/20 bg-white/5 px-6 text-base font-semibold text-white backdrop-blur hover:bg-white/10 hover:text-white"
            )}
          >
            Have a code?
          </Link>
          <Link
            href="/sign-up"
            className="ml-1 inline-flex items-center gap-1 text-sm font-medium text-white/65 underline-offset-4 hover:text-white hover:underline"
          >
            Host a game
            <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function SectionEyebrow({
  accent = "magenta",
  children,
}: {
  accent?: NeonTone;
  children: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em]">
      <span
        aria-hidden
        className="inline-block h-px w-6"
        style={{ background: `var(--neon-${accent})` }}
      />
      <span style={{ color: `var(--neon-${accent})` }}>{children}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mt-4 max-w-3xl font-[family-name:var(--font-display)] font-extrabold tracking-[-0.04em] text-white"
      style={{
        fontSize: "clamp(2rem, 5.5vw, 4.5rem)",
        lineHeight: 1,
      }}
    >
      {children}
    </h2>
  );
}

function SectionLead({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("mt-5 max-w-2xl text-base leading-relaxed text-white/70 md:text-lg", className)}>
      {children}
    </p>
  );
}

function formatCountdown(ms: number | null, status: string | undefined): string {
  if (status === "active") return "House game live now";
  if (ms === null) return "House games run every 30 minutes";
  if (ms <= 0) return "Next house game any second now";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m < 1) return `Next house game in ${s}s`;
  if (m < 60) return `Next house game in ~${m}m`;
  const h = Math.floor(m / 60);
  return `Next house game in ~${h}h`;
}
