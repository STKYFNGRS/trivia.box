import { Gift, Library, Medal, Sparkles, Star, Trophy } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusPill } from "@/components/ui/status-pill";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { getCreatorSummary, listCreatorDecks } from "@/lib/deckMarketplace";
import { cn } from "@/lib/utils";

const BADGE_META: Record<
  string,
  { label: string; icon: React.ReactNode; tooltip: string }
> = {
  creator: {
    label: "Creator",
    icon: <Sparkles className="size-3" />,
    tooltip: "Published at least one public deck.",
  },
  prolific_creator: {
    label: "Prolific creator",
    icon: <Medal className="size-3" />,
    tooltip: "Three or more public decks — earned a free month of organizer.",
  },
  top_rated_creator: {
    label: "Top-rated creator",
    icon: <Trophy className="size-3" />,
    tooltip: "Deck crossed 4.5+ with at least five ratings.",
  },
  featured_creator: {
    label: "Featured creator",
    icon: <Gift className="size-3" />,
    tooltip: "Hand-picked by the Trivia.Box team.",
  },
};

export const dynamic = "force-dynamic";

export default async function CreatorProfilePage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) notFound();

  const [summary, decks] = await Promise.all([
    getCreatorSummary(accountId),
    listCreatorDecks(accountId, 48),
  ]);

  if (!summary) notFound();

  return (
    <MarketingShell wide>
      <div className="mx-auto max-w-4xl px-6 py-10">
        <SectionHeader
          as="h1"
          eyebrow={
            <Link
              href="/decks"
              className="text-xs font-semibold uppercase tracking-[0.22em] text-white/70 hover:text-white"
            >
              ← Decks
            </Link>
          }
          title={summary.name}
          description={
            summary.publicDeckCount === 0
              ? "No public decks yet."
              : `${summary.publicDeckCount} public deck${summary.publicDeckCount === 1 ? "" : "s"}.`
          }
          className="text-white [&_*]:text-white [&_p]:text-white/70"
          actions={
            summary.badges.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {summary.badges.map((b) => {
                  const meta = BADGE_META[b.kind] ?? {
                    label: b.kind.replace(/_/g, " "),
                    icon: <Sparkles className="size-3" />,
                    tooltip: "Creator achievement.",
                  };
                  return (
                    <StatusPill key={b.kind} tone="accent" title={meta.tooltip}>
                      <span className="mr-1 inline-flex items-center">{meta.icon}</span>
                      {meta.label}
                    </StatusPill>
                  );
                })}
              </div>
            ) : null
          }
        />

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {decks.length === 0 ? (
            <Card className="col-span-full border-white/10 bg-white/[0.04] text-white backdrop-blur">
              <CardContent className="flex items-center gap-3 p-6 text-sm text-white/70">
                <Library className="size-5" />
                This creator hasn&apos;t published any public decks yet.
              </CardContent>
            </Card>
          ) : (
            decks.map((d) => (
              <Link key={d.id} href={`/decks/${d.id}`} className="block">
                <Card className="h-full border-white/10 bg-white/[0.04] text-white shadow-[var(--shadow-card)] backdrop-blur transition hover:border-white/20 hover:bg-white/[0.07]">
                  <CardContent className="flex h-full flex-col gap-3 p-5">
                    <div>
                      <div className="truncate text-base font-semibold tracking-tight">
                        {d.name}
                      </div>
                      {d.description ? (
                        <p className="mt-1 line-clamp-3 text-sm text-white/70">
                          {d.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-auto flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em]">
                      {d.defaultCategory ? (
                        <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-white/80">
                          {d.defaultCategory}
                        </span>
                      ) : null}
                      <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-white/70">
                        {d.questionCount} Qs
                      </span>
                      {d.avgRating > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-2 py-0.5 text-white/70">
                          <Star className="size-3 text-amber-300" />
                          {d.avgRating.toFixed(1)}
                        </span>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>

        <div className="mt-10 flex items-center justify-center">
          <Link
            href="/decks"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
            )}
          >
            Browse all decks
          </Link>
        </div>
      </div>
    </MarketingShell>
  );
}
