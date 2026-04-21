import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { Medal, Star } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusPill } from "@/components/ui/status-pill";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { deckRatings } from "@/lib/db/schema";
import { getMarketplaceDeck } from "@/lib/deckMarketplace";
import { getPlayerByAccountId } from "@/lib/players";
import { cn } from "@/lib/utils";
import { DeckRatingClient } from "./DeckRatingClient";
import { DuplicateDeckButton } from "./DuplicateDeckButton";
import { PlayDeckButton } from "./PlayDeckButton";

export const dynamic = "force-dynamic";

export default async function DeckDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const deck = await getMarketplaceDeck(id);
  if (!deck) notFound();

  // Figure out current user's rating (if any) so the rating widget can hydrate.
  const { userId } = await auth();
  let myRating: number | null = null;
  let viewerIsOwner = false;
  let viewerCanRate = false;
  if (userId) {
    const acct = await getAccountByClerkUserId(userId);
    if (acct) {
      viewerIsOwner = acct.id === deck.ownerAccountId;
      const player = await getPlayerByAccountId(acct.id);
      if (player) {
        viewerCanRate = !viewerIsOwner;
        const rows = await db
          .select({ score: deckRatings.score })
          .from(deckRatings)
          .where(and(eq(deckRatings.deckId, deck.id), eq(deckRatings.playerId, player.id)))
          .limit(1);
        myRating = rows[0]?.score ?? null;
      }
    }
  }

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
          title={deck.name}
          description={
            <>
              by{" "}
              <Link
                href={`/creators/${deck.ownerAccountId}`}
                className="underline underline-offset-4 hover:text-white"
              >
                {deck.ownerName}
              </Link>
              {deck.defaultCategory ? ` · ${deck.defaultCategory}` : ""}
            </>
          }
          className="text-white [&_*]:text-white [&_p]:text-white/70"
          actions={
            <div className="flex items-center gap-2">
              {deck.featured ? (
                <StatusPill tone="accent">
                  <Medal className="mr-1 size-3" />
                  Featured
                </StatusPill>
              ) : null}
              <PlayDeckButton
                deckId={deck.id}
                deckQuestionCount={deck.questionCount}
                size="sm"
              />
              {userId && !viewerIsOwner ? (
                <DuplicateDeckButton deckId={deck.id} size="sm" />
              ) : null}
            </div>
          }
        />

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <Stat label="Questions" value={deck.questionCount.toString()} />
          <Stat label="Times played" value={deck.timesUsed.toString()} />
          <Stat
            label="Avg rating"
            value={deck.avgRating > 0 ? deck.avgRating.toFixed(1) : "—"}
          />
          <Stat label="Ratings" value={deck.ratingCount.toString()} />
        </div>

        {deck.description ? (
          <Card className="mt-6 border-white/10 bg-white/[0.04] text-white backdrop-blur">
            <CardContent className="p-5 text-sm leading-relaxed text-white/85">
              {deck.description}
            </CardContent>
          </Card>
        ) : null}

        {deck.tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {deck.tags.map((t) => (
              <Link
                key={t}
                href={`/decks?tag=${encodeURIComponent(t)}`}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--stage-accent)]/10 px-3 py-1 text-xs font-semibold text-[var(--stage-accent)] hover:bg-[var(--stage-accent)]/20"
              >
                #{t}
              </Link>
            ))}
          </div>
        ) : null}

        <Card className="mt-6 border-white/10 bg-white/[0.04] text-white backdrop-blur">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Star className="size-4 text-amber-300" />
              <CardTitle className="tracking-tight">Rate this deck</CardTitle>
            </div>
            <CardDescription className="text-white/60">
              {viewerIsOwner
                ? "You can't rate your own deck, but we'll show others' ratings here."
                : userId
                  ? "Ratings shape the Top Rated tab."
                  : "Sign in to leave a rating."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {viewerCanRate ? (
              <DeckRatingClient deckId={deck.id} initialScore={myRating} />
            ) : userId ? (
              <div className="text-sm text-white/70">
                {viewerIsOwner
                  ? "Share your deck and invite other players to rate it!"
                  : "You need a player profile to rate."}
              </div>
            ) : (
              <Link
                href="/sign-in"
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "bg-[var(--stage-accent)] text-slate-950 hover:bg-[var(--stage-accent)]/90"
                )}
              >
                Sign in to rate
              </Link>
            )}
          </CardContent>
        </Card>

        {deck.badges.length > 0 ? (
          <Card className="mt-6 border-white/10 bg-white/[0.04] text-white backdrop-blur">
            <CardHeader>
              <CardTitle className="tracking-tight">Creator recognition</CardTitle>
              <CardDescription className="text-white/60">
                Badges earned by {deck.ownerName}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-wrap gap-2 text-xs">
                {deck.badges.map((b) => (
                  <li
                    key={b.kind}
                    className="rounded-full bg-white/[0.06] px-3 py-1 text-white/80"
                  >
                    {b.kind.replace(/_/g, " ")}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </MarketingShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-white/10 bg-white/[0.04] text-white backdrop-blur">
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">
          {label}
        </div>
        <div className="text-2xl font-black tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
