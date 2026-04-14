"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Flag = { id: string; questionId: string; sessionId: string; note: string | null; createdAt: string };

export default function AdminFlagsPage() {
  const [flags, setFlags] = useState<Flag[]>([]);

  async function refresh() {
    const res = await fetch("/api/admin/flags");
    const data = (await res.json()) as { flags?: Flag[] };
    if (!res.ok) {
      toast.error("Failed to load flags");
      return;
    }
    setFlags((data.flags ?? []) as Flag[]);
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Flag queue</h1>
        <Button type="button" variant="secondary" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>

      <div className="grid gap-3">
        {flags.length === 0 ? (
          <div className="text-muted-foreground text-sm">No open flags.</div>
        ) : (
          flags.map((f) => (
            <Card key={f.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                <div>
                  <CardTitle className="text-base">Flag</CardTitle>
                  <div className="text-muted-foreground mt-1 text-xs">
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
          ))
        )}
      </div>
    </div>
  );
}
