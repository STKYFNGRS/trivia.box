import { Gift, Medal, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { getCreatorPerkSummary } from "@/lib/creatorPerks";

const BADGE_ICON: Record<string, React.ReactNode> = {
  creator: <Sparkles className="size-3" />,
  prolific_creator: <Medal className="size-3" />,
  top_rated_creator: <Trophy className="size-3" />,
  featured_creator: <Gift className="size-3" />,
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Server-rendered creator perks card for the dashboard home. Shows earned
 * badges, progress toward the next unearned badge, and any active free
 * organizer-month window. Designed to sit alongside the Subscription card.
 */
export async function CreatorPerksCard({ accountId }: { accountId: string }) {
  const summary = await getCreatorPerkSummary(accountId);
  const hasAnyActivity =
    summary.badges.length > 0 ||
    summary.publicDeckCount > 0 ||
    summary.freeUntil;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="tracking-tight">Creator perks</CardTitle>
          <CardDescription className="mt-1">
            {hasAnyActivity
              ? "Badges and free-tier time you've earned by publishing and rating well."
              : "Publish a public deck to start earning badges and free organizer time."}
          </CardDescription>
        </div>
        {summary.freeUntil ? (
          <StatusPill tone="success" dot pulse>
            Free until {formatDate(summary.freeUntil)}
          </StatusPill>
        ) : (
          <StatusPill tone="neutral">No active perk</StatusPill>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {summary.badges.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {summary.badges.map((b) => (
              <StatusPill key={b.kind} tone="accent">
                <span className="mr-1 inline-flex items-center">
                  {BADGE_ICON[b.kind] ?? <Sparkles className="size-3" />}
                </span>
                {b.label}
              </StatusPill>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            No badges yet. Your first approved public deck unlocks the{" "}
            <span className="text-foreground font-medium">Creator</span> badge.
          </p>
        )}

        {summary.nextBadge ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border/60 bg-muted/40 px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="font-medium">Next: {summary.nextBadge.label}</div>
              <div className="text-muted-foreground text-xs">
                {summary.nextBadge.progressLabel}
              </div>
            </div>
            <Link
              href="/dashboard/decks"
              className="text-primary shrink-0 text-xs font-semibold uppercase tracking-wide underline-offset-4 hover:underline"
            >
              Manage decks
            </Link>
          </div>
        ) : summary.badges.length > 0 ? (
          <div className="text-muted-foreground text-xs">
            You&apos;ve unlocked every badge available today. More rewards
            coming as the revenue-share program lights up.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
