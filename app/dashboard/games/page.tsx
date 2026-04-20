import Link from "next/link";
import { desc, eq } from "drizzle-orm";
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
  return <StatusPill tone="neutral">{status}</StatusPill>;
}

export default async function GamesPage() {
  const account = await getCurrentAccount();
  if (!account) return null;

  const rows = await db
    .select({
      id: sessions.id,
      joinCode: sessions.joinCode,
      status: sessions.status,
      createdAt: sessions.createdAt,
      eventStartsAt: sessions.eventStartsAt,
      runMode: sessions.runMode,
    })
    .from(sessions)
    .where(eq(sessions.hostAccountId, account.id))
    .orderBy(desc(sessions.createdAt))
    .limit(25);

  return (
    <div className="flex flex-col gap-6">
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

      {rows.length === 0 ? (
        <EmptyState
          icon={<Gamepad2 className="size-6" aria-hidden />}
          title="No games yet"
          description="Draft a session from the game-setup flow to get your first join code."
          actions={
            <Link href="/dashboard/games/new" className={cn(buttonVariants({ size: "sm" }))}>
              New game
            </Link>
          }
        />
      ) : null}

      <HostClaimsCard />

      {rows.length > 0 && (
        <div className="grid gap-3">
          {rows.map((s) => {
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
                        className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}
                      >
                        Host
                      </Link>
                      <Link
                        href={`/game/${s.joinCode}/display`}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}
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
    </div>
  );
}
