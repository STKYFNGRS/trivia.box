"use client";

import { useEffect, useState } from "react";
import { Flag, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { SkeletonList } from "@/components/ui/skeleton-list";
import { StatusPill } from "@/components/ui/status-pill";

type FlagRow = {
  id: string;
  questionId: string;
  sessionId: string;
  note: string | null;
  createdAt: string;
};

export default function AdminFlagsPage() {
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/flags");
      const data = (await res.json()) as { flags?: FlagRow[] };
      if (!res.ok) {
        toast.error("Failed to load flags");
        return;
      }
      setFlags((data.flags ?? []) as FlagRow[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function resolve(id: string) {
    const res = await fetch(`/api/admin/flags/${id}`, { method: "PATCH" });
    if (!res.ok) {
      toast.error("Failed to resolve");
      return;
    }
    toast.success("Resolved");
    await refresh();
  }

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader
        as="h1"
        eyebrow="Admin"
        title="Flag queue"
        description="Host-flagged questions land here. Resolve once the underlying question is fixed, retired, or dismissed."
        actions={
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        }
      />

      {loading ? (
        <SkeletonList rows={4} rowHeight="h-14" />
      ) : flags.length === 0 ? (
        <EmptyState
          icon={<Flag className="size-6" />}
          title="No open flags"
          description="When hosts report a bad question, it shows up here for you to resolve."
        />
      ) : (
        <div className="grid gap-3">
          {flags.map((f) => (
            <Card key={f.id} className="ring-1 ring-border shadow-[var(--shadow-card)]">
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-semibold tracking-tight">Flag</CardTitle>
                    <StatusPill tone="warning" dot>
                      Open
                    </StatusPill>
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    question {f.questionId} · session {f.sessionId}
                  </div>
                </div>
                <Button type="button" size="sm" onClick={() => void resolve(f.id)}>
                  Resolve
                </Button>
              </CardHeader>
              {f.note ? (
                <CardContent className="text-sm text-muted-foreground">{f.note}</CardContent>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
