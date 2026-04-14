"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type BulkQuestion = {
  body: string;
  correctAnswer: string;
  wrongAnswers: string[];
  category: string;
  subcategory: string;
  difficulty: 1 | 2 | 3;
  timeHint?: 10 | 20 | 30;
  vetted?: boolean;
};

export function BulkImporter() {
  const [text, setText] = useState("[]");
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed)) return { ok: false as const, error: "JSON must be an array" };
      return { ok: true as const, count: parsed.length };
    } catch {
      return { ok: false as const, error: "Invalid JSON" };
    }
  }, [text]);

  async function approve() {
    if (!preview.ok) {
      toast.error(preview.error);
      return;
    }
    setBusy(true);
    try {
      const parsed = JSON.parse(text) as BulkQuestion[];
      const res = await fetch("/api/admin/questions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: parsed }),
      });
      const data = (await res.json()) as { inserted?: number; error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Import failed");
      toast.success(`Inserted ${data.inserted ?? 0} questions`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk import</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={14} className="font-mono text-xs" />
        <div className="text-muted-foreground text-sm">
          {preview.ok ? `Ready to import ${preview.count} questions.` : preview.error}
        </div>
        <Button type="button" disabled={busy || !preview.ok} onClick={() => void approve()}>
          {busy ? "Importing…" : "Approve import"}
        </Button>
      </CardContent>
    </Card>
  );
}
