"use client";

import { ChevronRight, Flame, Shuffle, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { SOLO_SPEEDS } from "@/lib/game/soloConstants";
import { cn } from "@/lib/utils";

type SoloCategory = {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  totalVetted: number;
};

type Speed = keyof typeof SOLO_SPEEDS;

const SPEED_META: Record<Speed, { label: string; copy: string; icon: React.ReactNode }> = {
  chill: {
    label: "Chill",
    copy: "25s per question. Breathe, think, nail it.",
    icon: <Sparkles className="size-4" aria-hidden />,
  },
  standard: {
    label: "Standard",
    copy: "15s per question. The classic bar pace.",
    icon: <Shuffle className="size-4" aria-hidden />,
  },
  blitz: {
    label: "Blitz",
    copy: "8s per question. Reflexes on.",
    icon: <Zap className="size-4" aria-hidden />,
  },
};

const QUESTION_COUNTS = [5, 10, 15, 20, 25] as const;

export function SoloSetupClient() {
  const router = useRouter();
  const search = useSearchParams();
  const presetSpeed = (search.get("speed") as Speed | null) ?? null;
  const [categories, setCategories] = useState<SoloCategory[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [speed, setSpeed] = useState<Speed>(
    presetSpeed && presetSpeed in SOLO_SPEEDS ? presetSpeed : "standard"
  );
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingCats(true);
    fetch("/api/solo/categories", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { categories?: SoloCategory[] }) => {
        if (cancelled) return;
        setCategories(data.categories ?? []);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't load categories. Try again in a moment.");
      })
      .finally(() => {
        if (!cancelled) setLoadingCats(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const availableCount = useMemo(() => {
    if (selected.size === 0) {
      return categories.reduce((sum, c) => sum + c.totalVetted, 0);
    }
    const labels = new Set(selected);
    return categories
      .filter((c) => labels.has(c.label))
      .reduce((sum, c) => sum + c.totalVetted, 0);
  }, [categories, selected]);

  const insufficient = availableCount < questionCount;

  function toggleCategory(label: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  async function start() {
    if (insufficient) {
      toast.error(
        `Not enough questions available (${availableCount}) for a ${questionCount}-question run.`
      );
      return;
    }
    setStarting(true);
    try {
      const res = await fetch("/api/solo/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speed,
          questionCount,
          categoryFilter: selected.size > 0 ? [...selected] : null,
        }),
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error as string | undefined;
        throw new Error(msg || "Couldn't start the run.");
      }
      const data = (await res.json()) as { sessionId: string };
      router.push(`/play/solo/${data.sessionId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start the run.");
      setStarting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--stage-bg)] text-white">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <SectionHeader
          as="h1"
          eyebrow="Solo"
          title="Build your run"
          description="Pick your pace, length, and categories. Server-timed, so your score reflects actual speed."
          className="text-white [&_*]:text-white [&_p]:text-white/70"
          actions={
            <Link
              href="/play"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "text-white/80 hover:bg-white/10 hover:text-white"
              )}
            >
              Back to play hub
            </Link>
          }
        />

        <div className="mt-8 flex flex-col gap-6">
          <Card className="border-white/10 bg-white/[0.04] text-white shadow-[var(--shadow-card)] backdrop-blur">
            <CardHeader>
              <CardTitle className="tracking-tight">Speed</CardTitle>
              <CardDescription className="text-white/60">
                Sets the timer per question. Faster = harder, bigger streak bonuses.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                {(Object.keys(SPEED_META) as Speed[]).map((key) => {
                  const active = speed === key;
                  const meta = SPEED_META[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSpeed(key)}
                      className={cn(
                        "flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition",
                        active
                          ? "border-[var(--stage-accent)] bg-[var(--stage-accent)]/15 ring-1 ring-[var(--stage-accent)]/30"
                          : "border-white/10 bg-white/[0.02] hover:bg-white/[0.06]"
                      )}
                    >
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        {meta.icon}
                        {meta.label}
                        <span className="ml-auto text-xs text-white/60 tabular-nums">
                          {SOLO_SPEEDS[key].seconds}s
                        </span>
                      </div>
                      <div className="text-xs text-white/70">{meta.copy}</div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.04] text-white shadow-[var(--shadow-card)] backdrop-blur">
            <CardHeader>
              <CardTitle className="tracking-tight">Length</CardTitle>
              <CardDescription className="text-white/60">
                How many questions do you want this run?
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {QUESTION_COUNTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setQuestionCount(n)}
                    className={cn(
                      "min-w-[3.5rem] rounded-lg border px-3 py-2 text-sm font-semibold transition",
                      n === questionCount
                        ? "border-[var(--stage-accent)] bg-[var(--stage-accent)]/15 text-white"
                        : "border-white/10 bg-white/[0.02] text-white/80 hover:bg-white/[0.06]"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.04] text-white shadow-[var(--shadow-card)] backdrop-blur">
            <CardHeader>
              <CardTitle className="tracking-tight">Categories</CardTitle>
              <CardDescription className="text-white/60">
                Leave empty for &ldquo;mix of everything.&rdquo; Multi-select to taste.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingCats ? (
                <div className="text-sm text-white/70">Loading categories...</div>
              ) : loadError ? (
                <div className="text-sm text-amber-200">{loadError}</div>
              ) : categories.length === 0 ? (
                <div className="text-sm text-white/70">
                  No vetted questions yet — the admins are still stocking the pool.
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {categories.map((c) => {
                    const isOn = selected.has(c.label);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCategory(c.label)}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition",
                          isOn
                            ? "border-[var(--stage-accent)] bg-[var(--stage-accent)]/15 text-white"
                            : "border-white/10 bg-white/[0.02] text-white/80 hover:bg-white/[0.06]"
                        )}
                      >
                        <span className="truncate font-medium">{c.label}</span>
                        <span className="text-xs tabular-nums text-white/60">
                          {c.totalVetted}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="mt-3 text-xs text-white/60">
                {selected.size === 0
                  ? `All categories · ${availableCount} questions available`
                  : `${selected.size} categor${selected.size === 1 ? "y" : "ies"} · ${availableCount} questions available`}
              </div>
              {insufficient ? (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-200">
                  <Flame className="size-3.5" />
                  Not enough questions for {questionCount}. Pick fewer, or add more categories.
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-3">
            <Link
              href="/play"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "text-white/80 hover:bg-white/10 hover:text-white"
              )}
            >
              Cancel
            </Link>
            <Button
              size="lg"
              disabled={starting || insufficient || categories.length === 0}
              onClick={start}
              className="bg-[var(--stage-accent)] text-slate-950 hover:bg-[var(--stage-accent)]/90"
            >
              {starting ? "Starting..." : "Start run"}
              <ChevronRight className="ml-1 size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
