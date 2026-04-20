"use client";

import { useEffect, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { SkeletonList } from "@/components/ui/skeleton-list";

type Row = { category: string; count: number };

export default function AdminStatsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stats/categories");
      const data = (await res.json()) as { categories?: Row[] };
      if (!res.ok) {
        toast.error("Failed to load stats");
        return;
      }
      setRows(data.categories ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const maxCount = rows.reduce((m, r) => Math.max(m, r.count), 0);

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader
        as="h1"
        eyebrow="Admin"
        title="Category stats"
        description="Vetted, non-retired question counts per category."
        actions={
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        }
      />

      {loading ? (
        <SkeletonList rows={6} rowHeight="h-12" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="size-6" />}
          title="No categories yet"
          description="Counts will show up here once the taxonomy has at least one vetted question."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => {
            const pct = maxCount > 0 ? Math.round((r.count / maxCount) * 100) : 0;
            return (
              <Card key={r.category} className="ring-1 ring-border shadow-[var(--shadow-card)]">
                <CardContent className="flex flex-col gap-3 p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-base font-semibold tracking-tight">{r.category}</div>
                    <div className="tabular-nums text-2xl font-semibold tracking-tight">
                      {r.count}
                    </div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
