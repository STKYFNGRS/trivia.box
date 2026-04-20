import Link from "next/link";
import { Inbox } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type RecentGameRow = {
  sessionId: string;
  status: string;
  eventStartsAt: Date | null;
  score: number | null;
  rank: number | null;
  venueSlug: string | null;
  venueName: string | null;
};

function formatRank(rank: number | null | undefined): string {
  if (rank == null) return "—";
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `${rank}th`;
}

function statusPillFor(status: string) {
  if (status === "active") {
    return (
      <StatusPill tone="success" dot pulse>
        Live
      </StatusPill>
    );
  }
  if (status === "paused") {
    return (
      <StatusPill tone="warning" dot pulse>
        Paused
      </StatusPill>
    );
  }
  if (status === "pending") {
    return (
      <StatusPill tone="info" dot>
        Scheduled
      </StatusPill>
    );
  }
  if (status === "completed") {
    return <StatusPill tone="neutral">Completed</StatusPill>;
  }
  return <StatusPill tone="neutral">{status}</StatusPill>;
}

/**
 * Shared last-N game list. Host-side (owner dashboard) and public-profile
 * use the same component — the "join another" CTA on the empty state is
 * opt-in so the public view can render a neutral "no games yet" message.
 */
export function RecentGamesTable({
  rows,
  title = "Recent games",
  description = "Last sessions played across any venue.",
  emptyCtaHref,
  emptyCtaLabel,
}: {
  rows: RecentGameRow[];
  title?: string;
  description?: string;
  emptyCtaHref?: string;
  emptyCtaLabel?: string;
}) {
  return (
    <section className="flex flex-col gap-4">
      <SectionHeader title={title} description={description} />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-6" aria-hidden />}
          title="No games yet"
          description="Join one with a six-letter code."
          actions={
            emptyCtaHref && emptyCtaLabel ? (
              <Link
                href={emptyCtaHref}
                className={cn(buttonVariants({ size: "sm" }))}
              >
                {emptyCtaLabel}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-[var(--shadow-card)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Venue</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Rank</TableHead>
                <TableHead className="text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((g) => {
                const when = g.eventStartsAt ? new Date(g.eventStartsAt) : null;
                return (
                  <TableRow key={g.sessionId}>
                    <TableCell className="font-medium text-foreground">
                      {g.venueSlug ? (
                        <Link
                          href={`/v/${g.venueSlug}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {g.venueName ?? g.venueSlug}
                        </Link>
                      ) : (
                        (g.venueName ?? "—")
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs tabular-nums">
                      {when ? when.toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>{statusPillFor(g.status)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatRank(g.rank)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {g.score != null ? g.score.toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
