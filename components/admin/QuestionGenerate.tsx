"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeader } from "@/components/ui/section-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";

type TaxonomyCat = {
  id: string;
  label: string;
  active: boolean;
  subcategories: Array<{ id: string; label: string; active: boolean }>;
};

type JobFailure = { id: string; errorMessage: string | null; updatedAt: string | Date };

type Mode = "random" | "specific";

const RUN_BATCH_SIZE = 20;
const MAX_PER_CLICK = 500;
// Generous ceiling so a 500-question click can fully drain inline; the loop
// also exits as soon as a batch returns 0 processed, so this is just a guard.
const MAX_RUN_ITERATIONS = 100;

export function QuestionGenerate(props: {
  taxonomy: TaxonomyCat[];
  onDraftsChanged?: () => void;
}) {
  const { taxonomy } = props;

  const [count, setCount] = useState(10);
  const [mode, setMode] = useState<Mode>("random");
  const [categoryLabel, setCategoryLabel] = useState<string>("");
  const [subcategoryId, setSubcategoryId] = useState<string>("");
  const [topicHint, setTopicHint] = useState("");

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [recentFailures, setRecentFailures] = useState<JobFailure[]>([]);

  useEffect(() => {
    setCategoryLabel((prev) => prev || taxonomy[0]?.label || "");
  }, [taxonomy]);

  const subsForCategory = useMemo(() => {
    const c = taxonomy.find((x) => x.label === categoryLabel);
    return (c?.subcategories ?? []).filter((s) => s.active);
  }, [taxonomy, categoryLabel]);

  useEffect(() => {
    setSubcategoryId((id) => (id && subsForCategory.some((s) => s.id === id) ? id : ""));
  }, [subsForCategory]);

  async function enqueueRandom(total: number): Promise<number> {
    // Uses `/balance`'s balanced mode: it guarantees every category with
    // under-target buckets gets at least one job per click, then distributes
    // the remainder proportional to each bucket's absolute gap. The old
    // "top-50 worst + same perBucket each" scheme silently starved whole
    // categories whose buckets happened to fall outside the top-50 slice.
    const res = await fetch("/api/admin/question-generation/balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ total }),
    });
    const data = (await res.json()) as {
      enqueued?: number;
      error?: unknown;
      message?: unknown;
    };
    if (!res.ok) {
      const msg =
        typeof data.message === "string"
          ? data.message
          : typeof data.error === "string"
            ? data.error
            : "Could not start generation";
      throw new Error(msg);
    }
    return data.enqueued ?? 0;
  }

  async function enqueueSpecific(total: number): Promise<number> {
    if (!categoryLabel) throw new Error("Pick a category.");
    const res = await fetch("/api/admin/question-generation/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batches: [
          {
            category: categoryLabel,
            count: total,
            topicHint: topicHint.trim() || undefined,
            ...(subcategoryId ? { subcategoryId } : {}),
          },
        ],
      }),
    });
    const data = (await res.json()) as { enqueued?: number; error?: unknown };
    if (!res.ok) {
      const msg =
        typeof data.error === "string"
          ? data.error
          : typeof data.error === "object" && data.error !== null && "fieldErrors" in data.error
            ? "Validation error"
            : "Could not start generation";
      throw new Error(msg);
    }
    return data.enqueued ?? 0;
  }

  async function runOneBatch(maxJobs: number): Promise<{ processed: number; errors: number }> {
    const res = await fetch("/api/admin/question-generation/jobs/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxJobs }),
    });
    const data = (await res.json()) as {
      processed?: number;
      results?: { error?: string }[];
      error?: unknown;
    };
    if (!res.ok) {
      const msg = typeof data.error === "string" ? data.error : "Generation failed";
      throw new Error(msg);
    }
    const processed = data.processed ?? 0;
    const errors = (data.results ?? []).filter((r) => r.error).length;
    return { processed, errors };
  }

  async function loadRecentFailures() {
    try {
      const res = await fetch("/api/admin/question-generation/jobs");
      const data = (await res.json()) as { recentFailures?: JobFailure[] };
      setRecentFailures(Array.isArray(data.recentFailures) ? data.recentFailures : []);
    } catch {
      // leave previous state
    }
  }

  async function generate() {
    const total = Math.max(1, Math.min(MAX_PER_CLICK, Math.floor(count)));
    setBusy(true);
    setStatusMessage("Planning generation…");
    setProgress({ done: 0, total });

    try {
      const enqueued =
        mode === "random" ? await enqueueRandom(total) : await enqueueSpecific(total);
      if (enqueued === 0) {
        toast.info("Nothing to generate — taxonomy is empty.");
        return;
      }
      setProgress({ done: 0, total: enqueued });
      setStatusMessage(`Generating 0 of ${enqueued}…`);

      let done = 0;
      let errorCount = 0;
      for (let i = 0; i < MAX_RUN_ITERATIONS && done < enqueued; i += 1) {
        const remaining = enqueued - done;
        const { processed, errors } = await runOneBatch(Math.min(remaining, RUN_BATCH_SIZE));
        if (processed === 0) break; // queue drained (or all claimed elsewhere)
        done += processed;
        errorCount += errors;
        setProgress({ done, total: enqueued });
        setStatusMessage(`Generating ${done} of ${enqueued}…`);
      }

      const successCount = done - errorCount;
      const leftover = Math.max(0, enqueued - done);
      if (successCount > 0) {
        toast.success(
          `${successCount} draft${successCount === 1 ? "" : "s"} ready in Review drafts.` +
            (leftover > 0
              ? ` ${leftover} more still generating in the background — refresh Review drafts in a few minutes.`
              : ""),
          { duration: 9000 }
        );
      }
      if (errorCount > 0) {
        toast.warning(`${errorCount} job${errorCount === 1 ? "" : "s"} failed — see details below.`);
      }
      if (done === 0 && leftover === 0) {
        toast.warning("No drafts were produced. Check provider settings or recent failures.");
      }

      setStatusMessage(
        leftover > 0
          ? `Done. ${successCount} created${errorCount > 0 ? `, ${errorCount} failed` : ""}; ${leftover} still running in background.`
          : errorCount > 0
            ? `Done. ${successCount} drafts created, ${errorCount} failed.`
            : `Done. ${successCount} draft${successCount === 1 ? "" : "s"} created.`
      );
      await loadRecentFailures();
      props.onDraftsChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
      setStatusMessage(null);
      await loadRecentFailures();
    } finally {
      setBusy(false);
    }
  }

  const percent =
    progress && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        as="h2"
        title="Generate questions"
        description="Pick how many questions you want. Use Random to fill the worst-covered buckets automatically, or target a specific topic. Finished drafts show up in Review."
      />
      <Card className="ring-1 ring-border shadow-[var(--shadow-card)]">
        <CardContent className="space-y-4 p-5 text-sm">

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>How many to generate</Label>
            <Input
              type="number"
              min={1}
              max={MAX_PER_CLICK}
              value={count}
              onChange={(e) =>
                setCount(Math.min(MAX_PER_CLICK, Math.max(1, Math.floor(Number(e.target.value) || 0))))
              }
              disabled={busy}
            />
            <p className="text-muted-foreground text-xs">
              Up to {MAX_PER_CLICK} per click. Larger runs take longer — the progress bar shows live
              updates, and any overflow keeps generating in the background. Click Generate again any
              time to keep pushing toward your target.
            </p>
          </div>
          <div className="grid gap-2">
            <Label>Topic</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)} disabled={busy}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="random">Random — balance across categories</SelectItem>
                <SelectItem value="specific">Specific topic…</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {mode === "specific" ? (
          <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/30 p-4 md:grid-cols-3">
            <div className="grid gap-2">
              <Label>Category</Label>
              <Select
                value={categoryLabel}
                onValueChange={(v) => v && setCategoryLabel(v)}
                disabled={busy}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {taxonomy.map((c) => (
                    <SelectItem key={c.id} value={c.label}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Subcategory (optional)</Label>
              <Select
                value={subcategoryId || "__any__"}
                onValueChange={(v) => setSubcategoryId(!v || v === "__any__" ? "" : v)}
                disabled={busy || subsForCategory.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any subcategory" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__any__">Any subcategory</SelectItem>
                  {subsForCategory.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Topic hint (optional)</Label>
              <Input
                value={topicHint}
                onChange={(e) => setTopicHint(e.target.value)}
                placeholder="e.g. 1990s NBA"
                disabled={busy}
              />
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="lg"
            disabled={busy || taxonomy.length === 0 || (mode === "specific" && !categoryLabel)}
            onClick={() => void generate()}
          >
            <Sparkles className="size-4" />
            {busy ? "Generating…" : `Generate ${count} question${count === 1 ? "" : "s"}`}
          </Button>
          {statusMessage ? (
            <span className="text-sm text-muted-foreground">{statusMessage}</span>
          ) : null}
        </div>

        {progress && progress.total > 0 ? (
          <div className="space-y-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="text-xs tabular-nums text-muted-foreground">
              {progress.done} of {progress.total} complete ({percent}%)
            </div>
          </div>
        ) : null}

        {recentFailures.length > 0 ? (
          <details className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
            <summary className="flex cursor-pointer select-none items-center gap-2 font-semibold text-destructive">
              <AlertCircle className="size-4" />
              Recent failures ({recentFailures.length})
            </summary>
            <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
              {recentFailures.map((f) => (
                <li key={f.id}>
                  <span className="font-mono">{f.id.slice(0, 8)}…</span>{" "}
                  {(f.errorMessage ?? "Unknown error").slice(0, 160)}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusPill tone="neutral">Provider</StatusPill>
          <span>
            set <code className="text-foreground">CLAUDE_API_KEY</code> to enable generation.
          </span>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}
