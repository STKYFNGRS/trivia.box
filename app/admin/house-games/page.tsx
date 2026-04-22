"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { SkeletonList } from "@/components/ui/skeleton-list";
import { StatusPill } from "@/components/ui/status-pill";

type HouseRow = {
  id: string;
  joinCode: string;
  status: string;
  eventStartsAt: string;
  estimatedEndAt?: string | null;
  theme: string | null;
};

type HouseGamesResponse = {
  now?: string;
  houseAccountConfigured?: boolean;
  upcoming?: HouseRow[];
  recent?: HouseRow[];
  error?: string;
};

/**
 * Returns a local-datetime string (YYYY-MM-DDTHH:mm) for the next :30
 * boundary from `now`, suitable for a `<input type="datetime-local">`
 * default value. Keeps the admin one click away from "schedule the next
 * one" without having to type a timestamp.
 */
function defaultStartsAtInput(now: Date): string {
  const d = new Date(now);
  d.setSeconds(0, 0);
  // Round up to the next :30 boundary in local time so the preset matches
  // what a user would intuitively expect ("next half hour from now").
  const m = d.getMinutes();
  const add = 30 - (m % 30);
  d.setMinutes(m + (add === 0 ? 30 : add));
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
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
  if (status === "cancelled") {
    return <StatusPill tone="neutral">Cancelled</StatusPill>;
  }
  if (status === "completed") {
    return <StatusPill tone="neutral">Completed</StatusPill>;
  }
  return <StatusPill tone="neutral">{status}</StatusPill>;
}

export default function AdminHouseGamesPage() {
  const [data, setData] = useState<HouseGamesResponse>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [customStart, setCustomStart] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/house-games", { cache: "no-store" });
      const json = (await res.json()) as HouseGamesResponse;
      if (!res.ok) {
        toast.error(json.error ?? "Failed to load house games");
        return;
      }
      setData(json);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load house games");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    // Seed the datetime-local input once on mount so the custom-schedule
    // path defaults to "next :30 from right now" without having to type.
    setCustomStart(defaultStartsAtInput(new Date()));
  }, []);

  const createNext = useCallback(async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/house-games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = (await res.json()) as {
        created?: boolean;
        reason?: string;
        eventStartsAt?: string;
        theme?: string | null;
        mode?: string;
        error?: string;
      };
      if (!res.ok) {
        toast.error(json.error ?? "Failed to schedule house game");
        return;
      }
      if (json.created && json.eventStartsAt) {
        const startLabel = new Date(json.eventStartsAt).toLocaleString();
        const themeLabel = json.theme ? ` · ${json.theme}` : "";
        toast.success(`House game scheduled for ${startLabel}${themeLabel}`);
      } else {
        const reason = json.reason ?? "unknown";
        toast.info(
          reason === "already_scheduled"
            ? "A house game is already queued for the next window."
            : `No game scheduled (${reason}).`
        );
      }
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to schedule");
    } finally {
      setCreating(false);
    }
  }, [refresh]);

  const createAtCustom = useCallback(async () => {
    if (!customStart) {
      toast.error("Pick a date + time first");
      return;
    }
    // `datetime-local` gives us a naive local-time string; interpreting it
    // through `new Date(...)` treats it as local, then `.toISOString()`
    // converts to UTC for the API — matches the operator's intent ("land
    // this at 8pm MY time").
    const iso = new Date(customStart).toISOString();
    setCreating(true);
    try {
      const res = await fetch("/api/admin/house-games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startsAt: iso }),
      });
      const json = (await res.json()) as {
        created?: boolean;
        eventStartsAt?: string;
        theme?: string | null;
        error?: string;
      };
      if (!res.ok) {
        toast.error(json.error ?? "Failed to schedule");
        return;
      }
      const startLabel = json.eventStartsAt
        ? new Date(json.eventStartsAt).toLocaleString()
        : customStart;
      const themeLabel = json.theme ? ` · ${json.theme}` : "";
      toast.success(`House game scheduled for ${startLabel}${themeLabel}`);
      setShowCustom(false);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to schedule");
    } finally {
      setCreating(false);
    }
  }, [customStart, refresh]);

  const cancelRow = useCallback(
    async (row: HouseRow) => {
      const ok = window.confirm(
        `Cancel house game ${row.joinCode} (${new Date(row.eventStartsAt).toLocaleString()})?`
      );
      if (!ok) return;
      setBusyId(row.id);
      try {
        const res = await fetch(`/api/admin/house-games/${row.id}`, {
          method: "DELETE",
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) {
          toast.error(json.error ?? "Failed to cancel");
          return;
        }
        toast.success("House game cancelled");
        await refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to cancel");
      } finally {
        setBusyId(null);
      }
    },
    [refresh]
  );

  // Wrap these in `useMemo` so their array identity stays stable across
  // renders when `data` is unchanged — otherwise the `??` fallback returns
  // a fresh `[]` every render and the downstream `useMemo` (nextPreview)
  // would recompute on every parent re-render.
  const upcoming = useMemo(() => data.upcoming ?? [], [data.upcoming]);
  const recent = useMemo(() => data.recent ?? [], [data.recent]);
  const configured = data.houseAccountConfigured !== false;

  const nextPreview = useMemo(() => {
    if (upcoming.length === 0) return null;
    const first = upcoming[0]!;
    const when = new Date(first.eventStartsAt);
    return { code: first.joinCode, when, theme: first.theme };
  }, [upcoming]);

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader
        as="h1"
        eyebrow="Admin"
        title="House games"
        description="Free platform-hosted games the cron schedules every 30 minutes. Force a new one, pre-book a feature night, or cancel one before it launches."
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void refresh()}
            >
              <RefreshCw className="size-4" />
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={creating || !configured}
              onClick={() => void createNext()}
            >
              <Sparkles className="size-4" />
              Schedule next
            </Button>
          </div>
        }
      />

      {!configured ? (
        <Card className="ring-1 ring-[var(--neon-amber)]/30 shadow-[var(--shadow-card)]">
          <CardContent className="flex flex-col gap-2 p-5 text-sm">
            <div className="font-semibold text-foreground">
              House account not configured
            </div>
            <p className="text-muted-foreground">
              Set <code className="rounded bg-muted px-1.5 py-0.5 text-xs">TRIVIA_BOX_HOUSE_ACCOUNT_ID</code>{" "}
              in the environment (accepts either an{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">accounts.id</code>{" "}
              UUID or a Clerk user id) or make sure at least one{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">site_admin</code>{" "}
              account exists — the cron uses that account as both host and venue.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="ring-1 ring-border shadow-[var(--shadow-card)]">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base font-semibold tracking-tight">
              Pre-book a specific time
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Forces a themed house game at the moment you pick (bypasses the
              &ldquo;already scheduled&rdquo; idempotency guard). Useful for
              Friday-night feature events or marketing pushes.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowCustom((s) => !s)}
          >
            <Plus className="size-4" />
            {showCustom ? "Hide" : "Show"}
          </Button>
        </CardHeader>
        {showCustom ? (
          <CardContent className="flex flex-wrap items-end gap-3 pt-0">
            <label className="flex min-w-0 flex-col gap-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Starts at (your local time)
              <input
                type="datetime-local"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </label>
            <Button
              type="button"
              size="sm"
              disabled={creating || !configured || !customStart}
              onClick={() => void createAtCustom()}
            >
              <Sparkles className="size-4" />
              Schedule
            </Button>
          </CardContent>
        ) : null}
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Upcoming &amp; live
          </h2>
          {nextPreview ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              Next: {nextPreview.when.toLocaleString()}
              {nextPreview.theme ? ` · ${nextPreview.theme}` : ""}
            </span>
          ) : null}
        </div>
        {loading ? (
          <SkeletonList rows={3} rowHeight="h-16" />
        ) : upcoming.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="size-6" aria-hidden />}
            title="No house games queued"
            description="Schedule one manually or wait for the cron's next tick (runs every 5 minutes; games land on :00 / :30)."
          />
        ) : (
          <div className="grid gap-3">
            {upcoming.map((row) => {
              const startsAt = new Date(row.eventStartsAt);
              const isPending = row.status === "pending";
              return (
                <Card key={row.id} className="ring-1 ring-border shadow-[var(--shadow-card)]">
                  <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-mono tracking-tight">
                          {row.joinCode.startsWith("pending_") ? "—" : row.joinCode}
                        </CardTitle>
                        {statusPillFor(row.status)}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground tabular-nums">
                        <span>{startsAt.toLocaleString()}</span>
                        {row.theme ? (
                          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]">
                            {row.theme}
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]">
                            Mixed
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {row.status === "active" ? (
                        <Link
                          href={`/game/${row.joinCode}/display`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                          Watch
                        </Link>
                      ) : null}
                      {isPending ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={busyId === row.id}
                          onClick={() => void cancelRow(row)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <XCircle className="mr-1.5 size-3.5" aria-hidden />
                          {busyId === row.id ? "Cancelling…" : "Cancel"}
                        </Button>
                      ) : null}
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {recent.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Recent (last 7 days)
          </h2>
          <div className="grid gap-3">
            {recent.map((row) => {
              const startsAt = new Date(row.eventStartsAt);
              const endedAt = row.estimatedEndAt
                ? new Date(row.estimatedEndAt)
                : null;
              return (
                <Card
                  key={row.id}
                  className="ring-1 ring-border shadow-[var(--shadow-card)] opacity-90"
                >
                  <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-mono tracking-tight">
                          {row.joinCode.startsWith("pending_") ? "—" : row.joinCode}
                        </CardTitle>
                        {statusPillFor(row.status)}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground tabular-nums">
                        <span>Started {startsAt.toLocaleString()}</span>
                        {endedAt ? <span>· ended {endedAt.toLocaleString()}</span> : null}
                        {row.theme ? (
                          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]">
                            {row.theme}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <Link
                      href={`/dashboard/games/${row.id}/recap`}
                      className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      Recap →
                    </Link>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
