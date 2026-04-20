import { Flame, Library, Sparkles, Star, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { NeonCard, type NeonTone } from "@/components/marketing/NeonCard";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusPill } from "@/components/ui/status-pill";
import { listMarketplaceDecks, type DeckSort } from "@/lib/deckMarketplace";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TABS: Array<{ id: DeckSort; label: string; icon: React.ReactNode }> = [
  { id: "popular", label: "Popular", icon: <TrendingUp className="size-3.5" /> },
  { id: "top_rated", label: "Top rated", icon: <Star className="size-3.5" /> },
  { id: "new", label: "New", icon: <Sparkles className="size-3.5" /> },
];

export default async function DecksMarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; search?: string; category?: string; tag?: string }>;
}) {
  const params = await searchParams;
  const rawSort = params.sort ?? "popular";
  const sort: DeckSort = (["popular", "top_rated", "new"] as const).includes(
    rawSort as DeckSort
  )
    ? (rawSort as DeckSort)
    : "popular";
  const search = params.search?.trim() ?? null;
  const category = params.category ?? null;
  const tag = params.tag ?? null;

  const { decks, total } = await listMarketplaceDecks({
    sort,
    search,
    category,
    tag,
    limit: 48,
  });

  return (
    <MarketingShell wide>
      <div className="mx-auto max-w-6xl px-6 py-12">
        <SectionHeader
          as="h1"
          eyebrow="Decks"
          title="Community-built decks"
          description="Curated collections from trivia hosts, writers, and superfans. Use them in your next game."
          className="text-white [&_*]:text-white [&_p]:text-white/70"
          actions={
            <Link
              href="/play"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
              )}
            >
              Play now
            </Link>
          }
        />

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {TABS.map((t) => {
            const active = sort === t.id;
            const href = (() => {
              const sp = new URLSearchParams();
              sp.set("sort", t.id);
              if (search) sp.set("search", search);
              if (category) sp.set("category", category);
              if (tag) sp.set("tag", tag);
              return `/decks?${sp.toString()}`;
            })();
            return (
              <Link
                key={t.id}
                href={href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide transition",
                  active
                    ? "border-transparent text-white"
                    : "border-white/10 bg-white/[0.02] text-white/80 hover:bg-white/[0.06]"
                )}
                style={
                  active
                    ? {
                        background:
                          "linear-gradient(135deg, color-mix(in oklab, var(--neon-magenta) 25%, transparent), color-mix(in oklab, var(--neon-cyan) 18%, transparent))",
                        boxShadow:
                          "inset 0 0 0 1px color-mix(in oklab, var(--neon-magenta) 45%, transparent)",
                      }
                    : undefined
                }
              >
                {t.icon}
                {t.label}
              </Link>
            );
          })}
          {search ? (
            <span className="ml-2 text-xs text-white/60">
              Search: <span className="text-white">{search}</span>
            </span>
          ) : null}
          <span className="ml-auto text-xs text-white/60 tabular-nums">
            {total} deck{total === 1 ? "" : "s"}
          </span>
        </div>

        <Suspense>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {decks.length === 0 ? (
              <Card className="col-span-full border-white/10 bg-white/[0.04] text-white backdrop-blur">
                <CardContent className="flex items-center gap-3 p-6 text-sm text-white/70">
                  <Library className="size-5" />
                  No decks match those filters yet. Be the first to publish one.
                </CardContent>
              </Card>
            ) : (
              decks.map((d, i) => <DeckCard key={d.id} deck={d} idx={i} />)
            )}
          </div>
        </Suspense>
      </div>
    </MarketingShell>
  );
}

const DECK_TONES: NeonTone[] = ["magenta", "cyan", "lime", "amber", "violet"];

function DeckCard({
  deck,
  idx,
}: {
  deck: Awaited<ReturnType<typeof listMarketplaceDecks>>["decks"][number];
  idx: number;
}) {
  const tone = DECK_TONES[idx % DECK_TONES.length];
  return (
    <NeonCard
      as={Link}
      href={`/decks/${deck.id}`}
      tone={tone}
      interactive
      className="flex h-full flex-col gap-3 p-5 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate font-[family-name:var(--font-display)] text-base font-bold tracking-tight">
              {deck.name}
            </div>
            {deck.featured ? (
              <StatusPill tone="accent">
                <Flame className="mr-0.5 size-3" />
                Featured
              </StatusPill>
            ) : null}
          </div>
          <div className="mt-0.5 truncate text-xs text-white/60">
            by {deck.ownerName}
          </div>
        </div>
        <div className="shrink-0 text-right text-xs tabular-nums text-white/70">
          {deck.avgRating > 0 ? (
            <div
              className="flex items-center gap-1"
              style={{ color: "var(--neon-amber)" }}
            >
              <Star className="size-3.5 fill-current" />
              {deck.avgRating.toFixed(1)}
              <span className="text-white/50">·{deck.ratingCount}</span>
            </div>
          ) : (
            <span className="text-white/50">No ratings</span>
          )}
        </div>
      </div>
      {deck.description ? (
        <p className="line-clamp-3 text-sm text-white/70">{deck.description}</p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em]">
        {deck.defaultCategory ? (
          <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-white/80">
            {deck.defaultCategory}
          </span>
        ) : null}
        <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-white/70">
          {deck.questionCount} Qs
        </span>
        {deck.timesUsed > 0 ? (
          <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-white/70">
            {deck.timesUsed} plays
          </span>
        ) : null}
        {deck.tags.slice(0, 3).map((t) => (
          <span
            key={t}
            className="rounded-full px-2 py-0.5"
            style={{
              background: "color-mix(in oklab, var(--neon-cyan) 14%, transparent)",
              color: "var(--neon-cyan)",
            }}
          >
            #{t}
          </span>
        ))}
      </div>
    </NeonCard>
  );
}
