"use client";

import { useCallback, useEffect, useImperativeHandle, useState } from "react";
import type { Ref } from "react";
import { Library, CheckCircle2, FileText, Archive } from "lucide-react";
import { cn } from "@/lib/utils";

type Stats = {
  total: number;
  active: number;
  vetted: number;
  unvetted: number;
  retired: number;
  byDifficulty: { 1: number; 2: number; 3: number };
  /**
   * AI-generated drafts queued in `question_drafts`. The pill binds to
   * `drafts.pending` because that's the number a curator actually needs
   * to act on in the Review tab. Approved drafts become `vetted = true`
   * rows in `questions` (counted under `vetted` above), and rejected
   * drafts stay here with `status = 'rejected'`.
   */
  drafts: { pending: number; rejected: number; approved: number };
};

export type QuestionPoolStatsHandle = {
  /**
   * Re-fetch the pool stats. The Studio shell wires this up so actions
   * that change counts (create, edit, retire, vet, generate, approve,
   * reject) can keep the header honest without forcing a full page
   * reload.
   */
  refresh: () => void;
};

type Props = {
  /**
   * Imperative handle for parent-triggered refreshes. Optional — if the
   * caller doesn't need to refresh on demand they can skip it.
   */
  handleRef?: Ref<QuestionPoolStatsHandle>;
};

function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n);
}

/**
 * Compact metric strip for Admin → Question Studio. Renders four pills
 * (Total / Vetted / Drafts / Retired) with a skeleton state while the
 * aggregate endpoint is in flight. Failures fail quiet — the strip
 * disappears rather than blocking the rest of the Studio.
 *
 * Backed by [`GET /api/admin/questions/stats`](app/api/admin/questions/stats/route.ts).
 */
export function QuestionPoolStats({ handleRef }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setStatus((s) => (s === "ready" ? "ready" : "loading"));
    try {
      const res = await fetch("/api/admin/questions/stats", {
        cache: "no-store",
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const data = (await res.json()) as Stats;
      setStats(data);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useImperativeHandle(handleRef, () => ({ refresh: () => void load() }), [load]);

  if (status === "error") return null;

  const pills: Array<{
    key: string;
    label: string;
    value: number;
    hint?: string;
    icon: React.ComponentType<{ className?: string }>;
    tone: "total" | "vetted" | "drafts" | "retired";
  }> = stats
    ? [
        {
          key: "total",
          label: "Total",
          value: stats.total,
          hint:
            stats.byDifficulty
              ? `Easy ${formatNumber(stats.byDifficulty[1])} · Med ${formatNumber(stats.byDifficulty[2])} · Hard ${formatNumber(stats.byDifficulty[3])}`
              : undefined,
          icon: Library,
          tone: "total",
        },
        {
          key: "vetted",
          label: "Vetted",
          value: stats.vetted,
          hint: "Live in the pool",
          icon: CheckCircle2,
          tone: "vetted",
        },
        {
          key: "drafts",
          label: "Drafts",
          value: stats.drafts.pending,
          hint: "Awaiting review",
          icon: FileText,
          tone: "drafts",
        },
        {
          key: "retired",
          label: "Retired",
          value: stats.retired,
          hint: "Hidden from games",
          icon: Archive,
          tone: "retired",
        },
      ]
    : [];

  const toneClass: Record<typeof pills[number]["tone"], string> = {
    total: "text-foreground",
    vetted: "text-emerald-600 dark:text-emerald-400",
    drafts: "text-amber-600 dark:text-amber-400",
    retired: "text-muted-foreground",
  };

  return (
    <div
      role="group"
      aria-label="Question pool stats"
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {status === "loading" && !stats
        ? Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-[70px] animate-pulse rounded-xl border border-border/60 bg-muted/30"
            />
          ))
        : pills.map(({ key, label, value, hint, icon: Icon, tone }) => (
            <div
              key={key}
              className="flex flex-col justify-between rounded-xl border border-border/60 bg-card/60 px-3 py-2.5 shadow-[var(--shadow-card)] backdrop-blur-sm"
            >
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Icon className={cn("size-3.5", toneClass[tone])} aria-hidden />
                {label}
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <div
                  className={cn(
                    "text-2xl font-semibold tabular-nums tracking-tight",
                    toneClass[tone]
                  )}
                >
                  {formatNumber(value)}
                </div>
                {hint ? (
                  <div className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    {hint}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
    </div>
  );
}
