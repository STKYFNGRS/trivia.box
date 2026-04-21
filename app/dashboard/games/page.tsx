import Link from "next/link";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { Gamepad2 } from "lucide-react";
import { getCurrentAccount } from "@/lib/accounts";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { HostClaimsCard } from "@/components/dashboard/HostClaimsCard";
import { LaunchNowButton } from "@/components/dashboard/LaunchNowButton";
import { RemoveSessionButton } from "@/components/dashboard/RemoveSessionButton";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";

type SessionStatus = "pending" | "active" | "paused" | "completed" | "cancelled" | "draft";

function statusPillFor(status: string, runMode: string | null | undefined) {
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
    return runMode === "autopilot" ? (
      <StatusPill tone="accent" dot>
        Autopilot
      </StatusPill>
    ) : (
      <StatusPill tone="info" dot>
        Scheduled
      </StatusPill>
    );
  }
  if (status === "completed") {
    return <StatusPill tone="neutral">Completed</StatusPill>;
  }
  if (status === "cancelled") {
    return <StatusPill tone="neutral">Cancelled</StatusPill>;
  }
  return <StatusPill tone="neutral">{status}</StatusPill>;
}

/**
 * Host dashboard for trivia sessions. Two sections:
 *
 *   - **Active / Upcoming** — pending, active, paused, or draft sessions
 *     whose `estimated_end_at` is either NULL or still in the near future
 *     (the 10-minute fudge absorbs the autopilot tick's lag before it
 *     marks a stuck session `completed`).
 *   - **Recent games** — the last 25 completed/cancelled sessions that the
 *     host hasn't removed yet. Each row has a **Remove** button that hits
 *     the soft-hide endpoint so the dashboard stays focused on what's new
 *     without losing player-facing leaderboard history.
 *
 * Both queries are scoped to `sessions.host_account_id = <current host>`
 * and exclude rows with `host_hidden_at IS NOT NULL`.
 */
export default async function GamesPage() {
  const account = await getCurrentAccount();
  if (!account) return null;

  const hostOwned = eq(sessions.hostAccountId, account.id);
  const notHidden = isNull(sessions.hostHiddenAt);

  // Active / Upcoming — same filter as before, now also exclude hidden rows.
  // Hosts rarely "hide" upcoming games (the API rejects that anyway), but
  // the filter keeps both sections honest.
  const upcomingRows = await db
    .select({
      id: sessions.id,
      joinCode: sessions.joinCode,
      status: sessions.status,
      createdAt: sessions.createdAt,
      eventStartsAt: sessions.eventStartsAt,
      estimatedEndAt: sessions.estimatedEndAt,
      runMode: sessions.runMode,
    })
    .from(sessions)
    .where(
      and(
        hostOwned,
        notHidden,
        inArray(sessions.status, ["pending", "active", "paused", "draft"]),
        or(
          isNull(sessions.estimatedEndAt),
          // Tightened from 10 → 3 min. sweepStaleSessions flips anything
          // 5 min past its estimated end to `completed`, and completeSession
          // stamps `estimated_end_at = now()` when a game ends early — so a
          // 3-minute window keeps real live overruns visible without letting
          // finished games linger in "Active & upcoming".
          gt(sessions.estimatedEndAt, sql`now() - interval '3 minutes'`),
        ),
      ),
    )
    .orderBy(asc(sessions.eventStartsAt))
    .limit(25);

  // Recent games — completed or cancelled, most-recent first. The
  // `COALESCE(estimated_end_at, event_starts_at, created_at)` sort keeps
  // legacy rows (missing `estimated_end_at`) in a sane order.
  const pastRows = await db
    .select({
      id: sessions.id,
      joinCode: sessions.joinCode,
      status: sessions.status,
      eventStartsAt: sessions.eventStartsAt,
      estimatedEndAt: sessions.estimatedEndAt,
      createdAt: sessions.createdAt,
      runMode: sessions.runMode,
    })
    .from(sessions)
    .where(
      and(
        hostOwned,
        notHidden,
        inArray(sessions.status, ["completed", "cancelled"]),
      ),
    )
    .orderBy(
      desc(
        sql`COALESCE(${sessions.estimatedEndAt}, ${sessions.eventStartsAt}, ${sessions.createdAt})`,
      ),
    )
    .limit(25);

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader
        as="h1"
        eyebrow="Games"
        title="Your sessions"
        description="Upcoming, active, and recent sessions you hosted."
        actions={
          <Link href="/dashboard/games/new" className={cn(buttonVariants())}>
            New game
          </Link>
        }
      />

      <HostClaimsCard />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Active &amp; upcoming
        </h2>
        {upcomingRows.length === 0 ? (
          <EmptyState
            icon={<Gamepad2 className="size-6" aria-hidden />}
            title="No games yet"
            description="Draft a session from the game-setup flow to get your first join code."
            actions={
              <Link
                href="/dashboard/games/new"
                className={cn(buttonVariants({ size: "sm" }))}
              >
                New game
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3">
            {upcomingRows.map((s) => {
              const isPending = s.status === "pending";
              const isActive =
                s.status === "active" && !s.joinCode.startsWith("pending_");
              const startsAt = s.eventStartsAt ? new Date(s.eventStartsAt) : null;
              const isAutopilot = s.runMode === "autopilot";
              return (
                <Card key={s.id} className="shadow-[var(--shadow-card)]">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base font-mono tracking-tight">
                      {s.joinCode}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {isPending && isAutopilot && startsAt ? (
                        <span className="text-muted-foreground text-xs tabular-nums">
                          Auto-launch {startsAt.toLocaleString()}
                        </span>
                      ) : null}
                      {statusPillFor(s.status as SessionStatus, s.runMode)}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2 text-sm">
                    {isActive ? (
                      <>
                        <Link
                          href={`/game/${s.joinCode}/host?sessionId=${encodeURIComponent(s.id)}`}
                          className={cn(
                            buttonVariants({ size: "sm", variant: "secondary" }),
                          )}
                        >
                          Host
                        </Link>
                        <Link
                          href={`/game/${s.joinCode}/display`}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(
                            buttonVariants({ size: "sm", variant: "secondary" }),
                          )}
                        >
                          Display
                        </Link>
                      </>
                    ) : null}
                    {isPending ? <LaunchNowButton sessionId={s.id} size="sm" /> : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {pastRows.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Recent games
            </h2>
            <Link
              href="/dashboard/stats"
              className="text-muted-foreground hover:text-foreground text-xs font-medium"
            >
              Full history →
            </Link>
          </div>
          <div className="grid gap-3">
            {pastRows.map((s) => {
              const endedAt = s.estimatedEndAt
                ? new Date(s.estimatedEndAt)
                : s.eventStartsAt
                  ? new Date(s.eventStartsAt)
                  : null;
              return (
                <Card
                  key={s.id}
                  className="shadow-[var(--shadow-card)] opacity-90"
                >
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base font-mono tracking-tight">
                      {s.joinCode}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {endedAt ? (
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {endedAt.toLocaleString()}
                        </span>
                      ) : null}
                      {statusPillFor(s.status as SessionStatus, s.runMode)}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center justify-end gap-2 text-sm">
                    <RemoveSessionButton sessionId={s.id} joinCode={s.joinCode} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
