"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton-list";

type Row = { id: string; body: string; category: string };

export function QuestionSearchPick(props: { category: string; onAppendId: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (q.trim()) sp.set("q", q.trim());
      sp.set("category", props.category);
      sp.set("limit", "15");
      const res = await fetch(`/api/dashboard/questions?${sp.toString()}`);
      const data = (await res.json()) as { questions?: Row[]; error?: unknown };
      if (!res.ok) {
        setRows([]);
        return;
      }
      setRows(data.questions ?? []);
    } finally {
      setLoading(false);
    }
  }, [props.category, q]);

  useEffect(() => {
    const t = setTimeout(() => {
      void search();
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <div className="grid gap-2 rounded-md border border-border/70 bg-muted/20 p-3">
      <Label className="text-xs">Search vetted in {props.category}</Label>
      <div className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Keyword…"
          className="text-sm"
          aria-label={`Search vetted questions in ${props.category}`}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={loading}
          onClick={() => void search()}
        >
          Refresh
        </Button>
      </div>
      {loading && rows.length === 0 ? (
        <SkeletonList rows={3} rowHeight="h-3" />
      ) : rows.length === 0 ? (
        <EmptyState
          borderless
          icon={<Inbox className="size-5" aria-hidden />}
          title="No matches"
          description="Try different keywords or broaden the category."
          className="py-6"
        />
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 border-b border-border/60 py-1 last:border-0"
            >
              <span className="text-muted-foreground shrink-0 font-mono tabular-nums">
                {r.id.slice(0, 8)}…
              </span>
              <span className="min-w-0 flex-1 truncate">{r.body}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => props.onAppendId(r.id)}
                aria-label={`Add question ${r.id.slice(0, 8)} to pinned list`}
              >
                Add
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
