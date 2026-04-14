"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Row = { category: string; count: number };

export default function AdminStatsPage() {
  const [rows, setRows] = useState<Row[]>([]);

  async function refresh() {
    const res = await fetch("/api/admin/stats/categories");
    const data = (await res.json()) as { categories?: Row[] };
    if (!res.ok) {
      toast.error("Failed to load stats");
      return;
    }
    setRows(data.categories ?? []);
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Category stats</h1>
        <Button type="button" variant="secondary" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <Card key={r.category}>
            <CardHeader>
              <CardTitle className="text-base">{r.category}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">Vetted (non-retired): {r.count}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
