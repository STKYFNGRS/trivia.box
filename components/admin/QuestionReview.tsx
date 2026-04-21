"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Inbox, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { SkeletonList } from "@/components/ui/skeleton-list";
import { StatusPill } from "@/components/ui/status-pill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Tab = "pending" | "rejected" | "approved";

type Draft = {
  id: string;
  body: string;
  correctAnswer: string;
  wrongAnswers: string[] | null;
  category: string;
  subcategory: string;
  difficulty: number;
  status: string;
  reviewNote: string | null;
  duplicateScore: number | null;
  pipelineLog: string | null;
  createdAt: string | Date;
  reviewedAt: string | Date | null;
};

function statusFor(tab: Tab): string {
  if (tab === "pending") return "pending_review";
  if (tab === "rejected") return "rejected";
  return "approved";
}

function SimilarityPill(props: { score: number | null }) {
  if (props.score == null) return null;
  const score = props.score;
  const tone = score >= 3 ? "danger" : score >= 1 ? "warning" : "neutral";
  return (
    <StatusPill tone={tone}>
      {score} similarity match{score === 1 ? "" : "es"}
    </StatusPill>
  );
}

function safeParseLog(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function PipelineSummary(props: { pipelineLog: string | null }) {
  const log = safeParseLog(props.pipelineLog);
  if (!log) return null;
  const steps = log.steps as Record<string, unknown> | undefined;
  const provider = typeof log.provider === "string" ? log.provider : null;
  const selfReview = steps?.selfReview as { reviews?: unknown } | undefined;
  const reviews = Array.isArray(selfReview?.reviews) ? selfReview.reviews : [];
  return (
    <div className="space-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
      {provider ? <div>Provider: {provider}</div> : null}
      {reviews.length > 0 ? (
        <div>
          Self-review:{" "}
          {reviews
            .map((r) => {
              const o = r as { verdict?: string; reason?: string };
              return o.verdict ? `${o.verdict}${o.reason ? ` (${o.reason.slice(0, 80)})` : ""}` : "";
            })
            .filter(Boolean)
            .join(" · ")}
        </div>
      ) : null}
    </div>
  );
}

const TAB_META: Array<{
  id: Tab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "pending", label: "Awaiting you", icon: Inbox },
  { id: "rejected", label: "Rejected", icon: XCircle },
  { id: "approved", label: "Recently approved", icon: CheckCircle2 },
];

export function QuestionReview(props: {
  initialTab?: Tab;
  onTabChange?: (tab: Tab) => void;
  /** Fires after an approval/rejection so the Studio can refresh pool stats. */
  onDecision?: () => void;
}) {
  const [tab, setTab] = useState<Tab>(props.initialTab ?? "pending");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async (target: Tab) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ status: statusFor(target), limit: "100" });
      const res = await fetch(`/api/admin/question-drafts?${qs.toString()}`);
      const data = (await res.json()) as { drafts?: Draft[]; error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed");
      setDrafts(data.drafts ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load drafts");
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(tab);
  }, [tab, refresh]);

  async function act(draftId: string, action: "approve" | "reject") {
    setBusyId(draftId);
    try {
      const res = await fetch(`/api/admin/question-drafts/${draftId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      toast.success(action === "approve" ? "Approved" : "Rejected");
      await refresh(tab);
      props.onDecision?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  const grouped = useMemo(() => {
    if (tab !== "pending") return null;
    return drafts.reduce(
      (acc, d) => {
        const k = d.category;
        if (!acc[k]) acc[k] = [];
        acc[k]!.push(d);
        return acc;
      },
      {} as Record<string, Draft[]>
    );
  }, [tab, drafts]);

  function setTabAndNotify(next: Tab) {
    setTab(next);
    props.onTabChange?.(next);
  }

  const renderDraft = (d: Draft) => {
    const statusTone =
      d.status === "approved" ? "success" : d.status === "rejected" ? "danger" : "warning";
    return (
      <Card
        key={d.id}
        className="ring-1 ring-border shadow-[var(--shadow-card)]"
      >
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1 text-base font-semibold leading-snug tracking-tight">
              {d.body}
            </div>
            <div className="flex shrink-0 flex-wrap gap-1.5">
              <SimilarityPill score={d.duplicateScore} />
              <StatusPill tone={statusTone}>{d.status.replace(/_/g, " ")}</StatusPill>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Correct
              </div>
              <div className="mt-0.5 font-mono text-sm text-emerald-600 dark:text-emerald-400">
                ✓ {d.correctAnswer}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Wrong answers
              </div>
              <div className="mt-0.5 font-mono text-sm text-foreground">
                {(d.wrongAnswers ?? []).join(" · ")}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <StatusPill tone="neutral">
              {d.category} / {d.subcategory}
            </StatusPill>
            <span className="tabular-nums text-muted-foreground">Difficulty {d.difficulty}</span>
          </div>
          {d.reviewNote ? (
            <div>
              Note: <span className="text-foreground">{d.reviewNote}</span>
            </div>
          ) : null}
          <PipelineSummary pipelineLog={d.pipelineLog} />
          {tab === "pending" ? (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                type="button"
                size="sm"
                disabled={busyId === d.id}
                onClick={() => void act(d.id, "approve")}
              >
                <CheckCircle2 className="size-4" />
                Approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyId === d.id}
                onClick={() => void act(d.id, "reject")}
              >
                <XCircle className="size-4" />
                Reject
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  };

  const emptyByTab: Record<Tab, { title: string; description: string }> = {
    pending: {
      title: "Inbox zero",
      description: "No drafts waiting on review right now. Generate new ones any time.",
    },
    rejected: {
      title: "No rejections",
      description: "Rejected drafts will appear here with the reason attached.",
    },
    approved: {
      title: "Nothing approved yet",
      description: "Approved drafts get promoted into the vetted pool and show up here.",
    },
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        as="h2"
        title="Review drafts"
        description="AI drafts wait here until you approve them into the vetted pool. Near-duplicates may be auto-rejected."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void refresh(tab)}
          >
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTabAndNotify(v as Tab)} className="gap-6">
        <TabsList className="h-9">
          {TAB_META.map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id} className="px-3">
              <Icon className="size-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TAB_META.map(({ id }) => (
          <TabsContent key={id} value={id} className="mt-0">
            <div className="flex flex-col gap-6">
              {loading ? (
                <SkeletonList rows={4} rowHeight="h-16" />
              ) : drafts.length === 0 ? (
                <EmptyState
                  icon={<Inbox className="size-6" />}
                  title={emptyByTab[id].title}
                  description={emptyByTab[id].description}
                />
              ) : id === "pending" && grouped ? (
                Object.entries(grouped).map(([category, list]) => (
                  <div key={category} className="flex flex-col gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {category}
                    </h3>
                    <div className="flex flex-col gap-4">{list.map(renderDraft)}</div>
                  </div>
                ))
              ) : (
                drafts.map(renderDraft)
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
