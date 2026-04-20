import { Gift } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusPill } from "@/components/ui/status-pill";

/**
 * Read-only prize history. The `claimCode` field is **intentionally absent**
 * from this prop shape so a public-profile caller literally cannot render a
 * redemption code. The owner dashboard has its own dedicated renderer with
 * the code (see `/dashboard/player/page.tsx`) — if you find yourself
 * tempted to pass `claimCode` through here, add a separate component
 * instead.
 */
export type PrizeWallItem = {
  prizeLabel: string;
  venueName: string;
  finalRank: number;
  status: string;
  expiresAt: Date | null;
  createdAt: Date;
};

function formatRank(rank: number): string {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `${rank}th`;
}

function toneForStatus(status: string) {
  if (status === "redeemed") return "success" as const;
  if (status === "expired" || status === "void") return "neutral" as const;
  return "accent" as const;
}

export function PrizeWall({
  items,
  title = "Prizes won",
  description = "Real-world prizes earned at venues. Redemption codes are private.",
}: {
  items: PrizeWallItem[];
  title?: string;
  description?: string;
}) {
  return (
    <section className="flex flex-col gap-4">
      <SectionHeader title={`${title} · ${items.length}`} description={description} />
      {items.length === 0 ? (
        <EmptyState
          icon={<Gift className="size-6" aria-hidden />}
          title="No prizes yet"
          description="Finish top-3 at a venue with a prize and it'll show up here."
        />
      ) : (
        <Card className="shadow-[var(--shadow-card)]">
          <CardContent className="pt-6">
            <ul className="divide-y divide-border/70">
              {items.map((p, i) => (
                <li
                  key={`${p.createdAt.toISOString()}-${i}`}
                  className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-foreground font-semibold">
                        {p.prizeLabel}
                      </span>
                      <StatusPill tone={toneForStatus(p.status)}>
                        {p.status}
                      </StatusPill>
                    </div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      {formatRank(p.finalRank)} at {p.venueName}
                      {p.expiresAt
                        ? ` · expires ${new Date(p.expiresAt).toLocaleDateString()}`
                        : ""}
                    </div>
                  </div>
                  <div className="text-muted-foreground/80 text-[0.7rem] uppercase tracking-[0.14em] tabular-nums">
                    {p.createdAt.toISOString().slice(0, 10)}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
