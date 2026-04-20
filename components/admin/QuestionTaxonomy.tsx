"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeader } from "@/components/ui/section-header";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";

type TaxonomyCat = {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  subcategories: Array<{
    id: string;
    slug: string;
    label: string;
    notesForGeneration: string | null;
    sortOrder: number;
    active: boolean;
    targetCount: number | null;
    categoryId: string;
  }>;
};

type CoverageRow = {
  subcategoryId: string;
  categoryLabel: string;
  subcategoryLabel: string;
  targetCount: number | null;
  vettedCount: number;
  pendingDraftCount: number;
  approvedDraftCount: number;
  fillRatio: number;
};

type UnmappedBucket = {
  categoryLabel: string;
  subcategoryLabel: string;
  vettedCount: number;
  categoryExists: boolean;
};

type UnmappedQuestion = {
  id: string;
  body: string;
  correctAnswer: string;
  wrongAnswers: string[] | null;
  difficulty: number;
};

type UnmappedQuestionState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; questions: UnmappedQuestion[] };

type CustomRemapInput = {
  toCategory: string;
  toSubcategoryLabel: string;
};

function CoverageRail(props: {
  vetted: number;
  approvedDrafts: number;
  pendingDrafts: number;
  target: number | null;
}) {
  const target = props.target ?? 0;
  const total = Math.max(
    target,
    props.vetted + props.approvedDrafts + props.pendingDrafts
  );
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="absolute left-0 top-0 h-full bg-emerald-500 transition-all"
          style={{ width: `${pct(props.vetted)}%` }}
        />
        <div
          className="absolute top-0 h-full bg-sky-500 transition-all"
          style={{
            left: `${pct(props.vetted)}%`,
            width: `${pct(props.approvedDrafts)}%`,
          }}
        />
        <div
          className="absolute top-0 h-full bg-amber-500 transition-all"
          style={{
            left: `${pct(props.vetted + props.approvedDrafts)}%`,
            width: `${pct(props.pendingDrafts)}%`,
          }}
        />
      </div>
      <div className="text-[11px] text-muted-foreground tabular-nums">
        <span className="font-medium text-foreground">{props.vetted}</span>
        {props.approvedDrafts > 0 ? <span> + {props.approvedDrafts} approved</span> : null}
        {props.pendingDrafts > 0 ? <span> + {props.pendingDrafts} pending</span> : null}
        <span> / {target || "–"}</span>
      </div>
    </div>
  );
}

export function QuestionTaxonomy(props: {
  categories: TaxonomyCat[];
  onChanged?: () => void;
}) {
  const [categories, setCategories] = useState<TaxonomyCat[]>(props.categories);
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [unmapped, setUnmapped] = useState<UnmappedBucket[]>([]);
  const [busy, setBusy] = useState(false);
  const [remapTargets, setRemapTargets] = useState<Record<string, string>>({});
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [questionFetches, setQuestionFetches] = useState<
    Record<string, UnmappedQuestionState>
  >({});
  const [customRemap, setCustomRemap] = useState<Record<string, CustomRemapInput>>({});

  const coverageByKey = useMemo(() => {
    const map = new Map<string, CoverageRow>();
    for (const row of coverage) {
      map.set(row.subcategoryId, row);
    }
    return map;
  }, [coverage]);

  const refresh = useCallback(async () => {
    try {
      const [catRes, covRes] = await Promise.all([
        fetch("/api/admin/question-taxonomy?all=1"),
        fetch("/api/admin/question-taxonomy/coverage"),
      ]);
      const catData = (await catRes.json()) as { categories?: TaxonomyCat[] };
      const covData = (await covRes.json()) as {
        coverage?: CoverageRow[];
        unmapped?: UnmappedBucket[];
      };
      if (catRes.ok && catData.categories) setCategories(catData.categories);
      if (covRes.ok && covData.coverage) setCoverage(covData.coverage);
      if (covRes.ok && covData.unmapped) setUnmapped(covData.unmapped);
    } catch {
      toast.error("Could not refresh taxonomy");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setCategories(props.categories);
  }, [props.categories]);

  async function addCategory(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const slug = String(fd.get("slug") ?? "").trim();
    const label = String(fd.get("label") ?? "").trim();
    if (!slug || !label) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/question-taxonomy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, label }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: unknown };
        throw new Error(typeof d.error === "object" ? "Validation error" : "Save failed");
      }
      toast.success("Category added");
      form.reset();
      await refresh();
      props.onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function addSubcategory(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const categoryId = String(fd.get("categoryId") ?? "");
    const slug = String(fd.get("slug") ?? "").trim();
    const label = String(fd.get("label") ?? "").trim();
    const targetRaw = String(fd.get("targetCount") ?? "").trim();
    const targetCount = targetRaw === "" ? null : Number(targetRaw);
    if (!categoryId || !slug || !label) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/question-taxonomy/subcategories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          slug,
          label,
          targetCount: targetCount !== null && Number.isFinite(targetCount) ? targetCount : null,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Subcategory added");
      form.reset();
      await refresh();
      props.onChanged?.();
    } catch {
      toast.error("Could not add subcategory (check slug uniqueness per category)");
    } finally {
      setBusy(false);
    }
  }

  async function patchSub(
    id: string,
    patch: { targetCount?: number | null; active?: boolean; label?: string; notesForGeneration?: string | null }
  ) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/question-taxonomy/subcategories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Update failed");
      toast.success("Saved");
      await refresh();
      props.onChanged?.();
    } catch {
      toast.error("Update failed");
    } finally {
      setBusy(false);
    }
  }

  const loadQuestionsForBucket = useCallback(
    async (categoryLabel: string, subcategoryLabel: string) => {
      const rowKey = `${categoryLabel}|${subcategoryLabel}`;
      setQuestionFetches((prev) => ({ ...prev, [rowKey]: { status: "loading" } }));
      try {
        const qs = new URLSearchParams({
          category: categoryLabel,
          subcategory: subcategoryLabel,
          retired: "false",
          vetted: "true",
        });
        const res = await fetch(`/api/admin/questions?${qs.toString()}`);
        if (!res.ok) throw new Error("Fetch failed");
        const data = (await res.json()) as { questions?: UnmappedQuestion[] };
        setQuestionFetches((prev) => ({
          ...prev,
          [rowKey]: { status: "ready", questions: data.questions ?? [] },
        }));
      } catch (err) {
        setQuestionFetches((prev) => ({
          ...prev,
          [rowKey]: {
            status: "error",
            message: err instanceof Error ? err.message : "Could not load questions",
          },
        }));
      }
    },
    []
  );

  const toggleExpanded = useCallback(
    (categoryLabel: string, subcategoryLabel: string) => {
      const rowKey = `${categoryLabel}|${subcategoryLabel}`;
      setExpandedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(rowKey)) {
          next.delete(rowKey);
        } else {
          next.add(rowKey);
          setQuestionFetches((fetches) => {
            if (fetches[rowKey]) return fetches;
            void loadQuestionsForBucket(categoryLabel, subcategoryLabel);
            return fetches;
          });
          setCustomRemap((prev) => {
            if (prev[rowKey]) return prev;
            return {
              ...prev,
              [rowKey]: { toCategory: categoryLabel, toSubcategoryLabel: "" },
            };
          });
        }
        return next;
      });
    },
    [loadQuestionsForBucket]
  );

  async function remapCustom(
    fromCategory: string,
    fromSubcategory: string,
    toCategory: string,
    toSubcategoryLabel: string
  ) {
    const trimmed = toSubcategoryLabel.trim();
    if (!trimmed) {
      toast.error("Type a subcategory label first");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/question-taxonomy/remap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remap_custom",
          fromCategory,
          fromSubcategory,
          toCategory,
          toSubcategoryLabel: trimmed,
        }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: unknown };
        throw new Error(typeof d.error === "string" ? d.error : "Remap failed");
      }
      const data = (await res.json()) as {
        movedCount?: number;
        createdSubcategory?: boolean;
      };
      toast.success(
        data.createdSubcategory
          ? `Created "${trimmed}" under ${toCategory} and moved ${data.movedCount ?? 0} question${data.movedCount === 1 ? "" : "s"}`
          : `Moved ${data.movedCount ?? 0} question${data.movedCount === 1 ? "" : "s"} to ${toCategory} / ${trimmed}`
      );
      const rowKey = `${fromCategory}|${fromSubcategory}`;
      setCustomRemap((prev) => {
        const copy = { ...prev };
        delete copy[rowKey];
        return copy;
      });
      setExpandedKeys((prev) => {
        const next = new Set(prev);
        next.delete(rowKey);
        return next;
      });
      await refresh();
      props.onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remap failed");
    } finally {
      setBusy(false);
    }
  }

  async function adoptUnmapped(categoryLabel: string, subcategoryLabel: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/question-taxonomy/remap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "adopt",
          categoryLabel,
          subcategoryLabel,
        }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: unknown };
        throw new Error(typeof d.error === "string" ? d.error : "Adopt failed");
      }
      const data = (await res.json()) as { adoptedCount?: number; created?: boolean };
      toast.success(
        data.created
          ? `Added "${subcategoryLabel}" (${data.adoptedCount ?? 0} questions now counted)`
          : `Reactivated "${subcategoryLabel}" (${data.adoptedCount ?? 0} questions now counted)`
      );
      await refresh();
      props.onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Adopt failed");
    } finally {
      setBusy(false);
    }
  }

  async function remapUnmapped(
    fromCategory: string,
    fromSubcategory: string,
    toCategory: string,
    toSubcategory: string
  ) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/question-taxonomy/remap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remap",
          fromCategory,
          fromSubcategory,
          toCategory,
          toSubcategory,
        }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: unknown };
        throw new Error(typeof d.error === "string" ? d.error : "Remap failed");
      }
      const data = (await res.json()) as { movedCount?: number };
      toast.success(
        `Moved ${data.movedCount ?? 0} questions to ${toCategory} / ${toSubcategory}`
      );
      setRemapTargets((prev) => {
        const copy = { ...prev };
        delete copy[`${fromCategory}|${fromSubcategory}`];
        return copy;
      });
      await refresh();
      props.onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remap failed");
    } finally {
      setBusy(false);
    }
  }

  async function patchCategory(id: string, patch: { active?: boolean; label?: string }) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/question-taxonomy/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Update failed");
      toast.success("Saved");
      await refresh();
      props.onChanged?.();
    } catch {
      toast.error("Update failed");
    } finally {
      setBusy(false);
    }
  }

  const activeCategories = useMemo(
    () => categories.filter((c) => c.active),
    [categories]
  );

  const unmappedTotal = useMemo(
    () => unmapped.reduce((s, r) => s + r.vettedCount, 0),
    [unmapped]
  );

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader
        as="h2"
        title="Taxonomy"
        description="Categories and subcategories drive AI generation targets and coverage-gap picking. Coverage rails show how close each bucket is to its vetted target."
      />

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Legend
        </span>
        <StatusPill tone="success" dot>
          Vetted
        </StatusPill>
        <StatusPill tone="info" dot>
          Approved drafts
        </StatusPill>
        <StatusPill tone="warning" dot>
          Pending drafts
        </StatusPill>
        <StatusPill tone="neutral">Remaining to target</StatusPill>
      </div>

      {unmapped.length > 0 ? (
        <Card className="ring-1 ring-amber-500/40 shadow-[var(--shadow-card)]">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-500" />
                <CardTitle className="text-base">Unmapped questions</CardTitle>
              </div>
              <StatusPill tone="warning">
                {unmappedTotal} question{unmappedTotal === 1 ? "" : "s"} · {unmapped.length} bucket
                {unmapped.length === 1 ? "" : "s"}
              </StatusPill>
            </div>
            <p className="mt-2 max-w-3xl text-xs text-muted-foreground">
              These vetted questions carry category / subcategory labels that don&apos;t match any active
              subcategory, so they aren&apos;t counted in coverage below. Either adopt the label as a new
              subcategory (keeps every question where it is) or remap them into an existing subcategory.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    <th className="py-2 pr-3 font-semibold">Category / Subcategory</th>
                    <th className="py-2 pr-3 font-semibold">Count</th>
                    <th className="py-2 pr-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {unmapped.map((row) => {
                    const rowKey = `${row.categoryLabel}|${row.subcategoryLabel}`;
                    const targetValue = remapTargets[rowKey] ?? "";
                    const isExpanded = expandedKeys.has(rowKey);
                    const fetchState = questionFetches[rowKey];
                    const custom = customRemap[rowKey] ?? {
                      toCategory: row.categoryLabel,
                      toSubcategoryLabel: "",
                    };
                    return (
                      <Fragment key={rowKey}>
                        <tr className="border-b border-border/60 align-middle">
                          <td className="py-2 pr-3">
                            <button
                              type="button"
                              className="mr-2 inline-flex size-6 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                              aria-label={isExpanded ? "Collapse" : "Expand"}
                              aria-expanded={isExpanded}
                              onClick={() =>
                                toggleExpanded(row.categoryLabel, row.subcategoryLabel)
                              }
                            >
                              {isExpanded ? (
                                <ChevronDown className="size-3.5" />
                              ) : (
                                <ChevronRight className="size-3.5" />
                              )}
                            </button>
                            <span className="font-medium">{row.categoryLabel}</span>
                            <span className="text-muted-foreground"> / </span>
                            <span>{row.subcategoryLabel}</span>
                            {!row.categoryExists ? (
                              <StatusPill tone="warning" className="ml-2">
                                Category inactive
                              </StatusPill>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                            {row.vettedCount}
                          </td>
                          <td className="py-2 pr-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={busy || !row.categoryExists}
                                title={
                                  row.categoryExists
                                    ? `Create "${row.subcategoryLabel}" under ${row.categoryLabel}`
                                    : `Category "${row.categoryLabel}" is inactive; activate it or remap instead`
                                }
                                onClick={() =>
                                  void adoptUnmapped(row.categoryLabel, row.subcategoryLabel)
                                }
                              >
                                Add as subcategory
                              </Button>
                              <Select
                                value={targetValue || "__pick__"}
                                onValueChange={(v) =>
                                  setRemapTargets((prev) => ({
                                    ...prev,
                                    [rowKey]: v === "__pick__" || v == null ? "" : v,
                                  }))
                                }
                              >
                                <SelectTrigger size="sm" className="w-[12rem]">
                                  <SelectValue placeholder="Remap to…" />
                                </SelectTrigger>
                                <SelectContent className="max-h-72">
                                  <SelectItem value="__pick__">Remap to…</SelectItem>
                                  {activeCategories.map((c) => {
                                    const subs = c.subcategories.filter((s) => s.active);
                                    if (subs.length === 0) return null;
                                    return (
                                      <SelectGroup key={c.id}>
                                        <SelectLabel>{c.label}</SelectLabel>
                                        {subs.map((s) => (
                                          <SelectItem
                                            key={s.id}
                                            value={`${c.label}||${s.label}`}
                                          >
                                            {s.label}
                                          </SelectItem>
                                        ))}
                                      </SelectGroup>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                              <Button
                                type="button"
                                size="sm"
                                disabled={busy || !targetValue}
                                onClick={() => {
                                  const [toCat, toSub] = targetValue.split("||");
                                  if (!toCat || !toSub) return;
                                  void remapUnmapped(
                                    row.categoryLabel,
                                    row.subcategoryLabel,
                                    toCat,
                                    toSub
                                  );
                                }}
                              >
                                Remap
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr className="border-b border-border/60">
                            <td colSpan={3} className="bg-muted/30 px-3 pt-1 pb-4">
                              <div className="flex flex-col gap-4">
                                <div>
                                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                    Questions in this bucket
                                  </p>
                                  {fetchState?.status === "loading" ? (
                                    <p className="text-sm text-muted-foreground">Loading…</p>
                                  ) : fetchState?.status === "error" ? (
                                    <p className="text-sm text-destructive">{fetchState.message}</p>
                                  ) : fetchState?.status === "ready" ? (
                                    fetchState.questions.length === 0 ? (
                                      <p className="text-sm text-muted-foreground">
                                        No vetted, non-retired questions found for this bucket.
                                      </p>
                                    ) : (
                                      <ol className="flex flex-col gap-2">
                                        {fetchState.questions.map((q) => (
                                          <li
                                            key={q.id}
                                            className="rounded-lg border border-border/60 bg-background p-3 text-sm shadow-[var(--shadow-card)]"
                                          >
                                            <div className="flex items-start gap-2">
                                              <span className="tabular-nums text-xs text-muted-foreground">
                                                d{q.difficulty}
                                              </span>
                                              <div className="flex-1">
                                                <p className="whitespace-pre-wrap">{q.body}</p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                  <span className="text-emerald-600 dark:text-emerald-400">
                                                    ✓ {q.correctAnswer}
                                                  </span>
                                                  {q.wrongAnswers && q.wrongAnswers.length > 0 ? (
                                                    <span>
                                                      {" "}
                                                      · {q.wrongAnswers.join(" · ")}
                                                    </span>
                                                  ) : null}
                                                </p>
                                              </div>
                                            </div>
                                          </li>
                                        ))}
                                      </ol>
                                    )
                                  ) : null}
                                </div>
                                <div className="rounded-lg border border-border/60 bg-background p-3">
                                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                    Create a new subcategory and move them there
                                  </p>
                                  <div className="flex flex-wrap items-end gap-2">
                                    <div className="grid gap-1">
                                      <Label className="text-xs">Category</Label>
                                      <Select
                                        value={custom.toCategory}
                                        onValueChange={(v) =>
                                          setCustomRemap((prev) => ({
                                            ...prev,
                                            [rowKey]: {
                                              toCategory: v ?? "",
                                              toSubcategoryLabel: custom.toSubcategoryLabel,
                                            },
                                          }))
                                        }
                                      >
                                        <SelectTrigger className="h-9 w-[12rem]">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-72">
                                          {activeCategories.map((c) => (
                                            <SelectItem key={c.id} value={c.label}>
                                              {c.label}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="grid flex-1 min-w-[14rem] gap-1">
                                      <Label className="text-xs">New subcategory label</Label>
                                      <Input
                                        className="h-9"
                                        placeholder={`e.g. ${row.subcategoryLabel} era`}
                                        value={custom.toSubcategoryLabel}
                                        onChange={(e) =>
                                          setCustomRemap((prev) => ({
                                            ...prev,
                                            [rowKey]: {
                                              toCategory: custom.toCategory,
                                              toSubcategoryLabel: e.target.value,
                                            },
                                          }))
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            void remapCustom(
                                              row.categoryLabel,
                                              row.subcategoryLabel,
                                              custom.toCategory,
                                              custom.toSubcategoryLabel
                                            );
                                          }
                                        }}
                                      />
                                    </div>
                                    <Button
                                      type="button"
                                      size="sm"
                                      disabled={busy || custom.toSubcategoryLabel.trim().length === 0}
                                      onClick={() =>
                                        void remapCustom(
                                          row.categoryLabel,
                                          row.subcategoryLabel,
                                          custom.toCategory,
                                          custom.toSubcategoryLabel
                                        )
                                      }
                                    >
                                      Create &amp; remap
                                    </Button>
                                  </div>
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    If a subcategory with that label already exists under the chosen
                                    category it&apos;ll be reused; otherwise a new one is created and
                                    these questions are moved into it.
                                  </p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="ring-1 ring-border shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base">Add category</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" onSubmit={addCategory}>
            <div className="grid gap-2">
              <Label htmlFor="cat-slug">Slug</Label>
              <Input id="cat-slug" name="slug" placeholder="e.g. sports" required className="w-48" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cat-label">Label</Label>
              <Input id="cat-label" name="label" placeholder="Display name" required className="w-56" />
            </div>
            <Button type="submit" disabled={busy}>
              Add category
            </Button>
          </form>
        </CardContent>
      </Card>

      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">No categories yet. Add one above to get started.</p>
      ) : null}

      {categories.map((cat) => (
        <Card key={cat.id} className={cn("ring-1 ring-border shadow-[var(--shadow-card)]", !cat.active && "opacity-75")}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="font-semibold tracking-tight">{cat.label}</span>
                <span className="text-sm font-normal text-muted-foreground">{cat.slug}</span>
                {!cat.active ? <StatusPill tone="neutral">Inactive</StatusPill> : null}
              </CardTitle>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  defaultChecked={cat.active}
                  onCheckedChange={(checked) =>
                    void patchCategory(cat.id, { active: checked === true })
                  }
                />
                Active
              </label>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <form className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-4" onSubmit={addSubcategory}>
              <input type="hidden" name="categoryId" value={cat.id} />
              <span className="text-sm font-semibold text-muted-foreground">New subcategory</span>
              <Input name="slug" placeholder="slug" className="w-40" required />
              <Input name="label" placeholder="Label" className="w-48" required />
              <Input name="targetCount" type="number" placeholder="Target #" className="w-28" min={1} />
              <Button type="submit" size="sm" disabled={busy}>
                Add
              </Button>
            </form>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    <th className="py-2 pr-3 font-semibold">Label</th>
                    <th className="py-2 pr-3 font-semibold">Slug</th>
                    <th className="py-2 pr-3 font-semibold">Coverage</th>
                    <th className="py-2 pr-3 font-semibold">Target</th>
                    <th className="py-2 pr-3 font-semibold">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {cat.subcategories.map((s) => {
                    const cov = coverageByKey.get(s.id);
                    return (
                      <tr key={s.id} className="border-b border-border/60 align-middle">
                        <td className="py-2 pr-3 font-medium">{s.label}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{s.slug}</td>
                        <td className="py-2 pr-3 w-[16rem]">
                          <CoverageRail
                            vetted={cov?.vettedCount ?? 0}
                            approvedDrafts={cov?.approvedDraftCount ?? 0}
                            pendingDrafts={cov?.pendingDraftCount ?? 0}
                            target={s.targetCount}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <Input
                            defaultValue={s.targetCount ?? ""}
                            className="h-8 w-24 tabular-nums"
                            type="number"
                            min={1}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              const n = v === "" ? null : Number(v);
                              if (n !== null && !Number.isFinite(n)) return;
                              if (n === s.targetCount || (n === null && s.targetCount === null)) return;
                              void patchSub(s.id, { targetCount: n });
                            }}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <Checkbox
                            defaultChecked={s.active}
                            onCheckedChange={(checked) =>
                              void patchSub(s.id, { active: checked === true })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {cat.subcategories.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-3 text-sm text-muted-foreground">
                        No subcategories yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
