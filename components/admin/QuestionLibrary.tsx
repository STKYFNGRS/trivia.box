"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SkeletonList } from "@/components/ui/skeleton-list";
import { StatusPill } from "@/components/ui/status-pill";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Question = {
  id: string;
  body: string;
  correctAnswer: string;
  wrongAnswers: string[] | null;
  category: string;
  subcategory: string;
  difficulty: number;
  vetted: boolean;
  retired: boolean;
};

type TaxonomyCat = {
  id: string;
  label: string;
  active: boolean;
  subcategories: Array<{ id: string; label: string; active: boolean }>;
};

type VettedFilter = "all" | "vetted" | "unvetted";
type RetiredFilter = "active" | "retired" | "all";
type DifficultyFilter = "all" | "1" | "2" | "3";

type CreateForm = {
  body: string;
  correctAnswer: string;
  wrongAnswers: string;
  category: string;
  subcategory: string;
  difficulty: number;
  vetted: boolean;
};

const emptyCreateForm = (): CreateForm => ({
  body: "",
  correctAnswer: "",
  wrongAnswers: "",
  category: "",
  subcategory: "",
  difficulty: 2,
  vetted: false,
});

export function QuestionLibrary(props: {
  taxonomy: TaxonomyCat[];
  /** Fires after a create / save / delete so the Studio header can refresh pool stats. */
  onChanged?: () => void;
}) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Question | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [category, setCategory] = useState<string>("");
  const [subcategory, setSubcategory] = useState<string>("");
  const [vetted, setVetted] = useState<VettedFilter>("all");
  const [retired, setRetired] = useState<RetiredFilter>("active");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [search, setSearch] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm());
  const [creating, setCreating] = useState(false);

  const subsForCategory = useMemo(() => {
    if (!category) return [] as TaxonomyCat["subcategories"];
    const cat = props.taxonomy.find((c) => c.label === category);
    return cat?.subcategories ?? [];
  }, [category, props.taxonomy]);

  useEffect(() => {
    setSubcategory((prev) => (subsForCategory.some((s) => s.label === prev) ? prev : ""));
  }, [subsForCategory]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (category.trim()) qs.set("category", category.trim());
      if (subcategory.trim()) qs.set("subcategory", subcategory.trim());
      if (vetted === "vetted") qs.set("vetted", "true");
      if (vetted === "unvetted") qs.set("vetted", "false");
      if (retired === "active") qs.set("retired", "false");
      if (retired === "retired") qs.set("retired", "true");
      if (difficulty !== "all") qs.set("difficulty", difficulty);
      if (search.trim()) qs.set("q", search.trim());
      const res = await fetch(`/api/admin/questions?${qs.toString()}`);
      const data = (await res.json()) as { questions?: Question[]; error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed");
      setQuestions(data.questions ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [category, subcategory, vetted, retired, difficulty, search]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function save() {
    if (!selected) return;
    const wrong = (selected.wrongAnswers ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 3);
    if (wrong.length !== 3) {
      toast.error("Need exactly 3 wrong answers");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/questions/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: selected.body,
          correctAnswer: selected.correctAnswer,
          wrongAnswers: wrong,
          category: selected.category,
          subcategory: selected.subcategory,
          difficulty: selected.difficulty,
          vetted: selected.vetted,
          retired: selected.retired,
        }),
      });
      const data = (await res.json()) as { error?: unknown };
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Save failed");
        return;
      }
      toast.success("Saved");
      setSelected(null);
      await refresh();
      props.onChanged?.();
    } finally {
      setSaving(false);
    }
  }

  async function deleteQuestion() {
    if (!selected) return;
    const ok =
      typeof window !== "undefined"
        ? window.confirm(
            `Permanently delete this question?\n\n"${selected.body.slice(0, 120)}${selected.body.length > 120 ? "…" : ""}"\n\nThis cannot be undone. If you just want to stop using it in games, toggle "Retired" instead.`
          )
        : true;
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/questions/${selected.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: unknown;
        mode?: "deleted" | "retired";
        referencedBy?: number;
      };
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Delete failed");
        return;
      }
      if (data.mode === "retired") {
        toast.success(
          `Question was used in ${data.referencedBy ?? "past"} game${data.referencedBy === 1 ? "" : "s"}; retired instead of deleted to preserve history.`
        );
      } else {
        toast.success("Question deleted");
      }
      setSelected(null);
      await refresh();
      props.onChanged?.();
    } finally {
      setDeleting(false);
    }
  }

  async function createQuestion() {
    const wrong = createForm.wrongAnswers
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!createForm.body.trim() || !createForm.correctAnswer.trim()) {
      toast.error("Body and correct answer are required");
      return;
    }
    if (wrong.length !== 3) {
      toast.error("Need exactly 3 wrong answers");
      return;
    }
    if (!createForm.category.trim() || !createForm.subcategory.trim()) {
      toast.error("Category and subcategory are required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: createForm.body.trim(),
          correctAnswer: createForm.correctAnswer.trim(),
          wrongAnswers: wrong,
          category: createForm.category.trim(),
          subcategory: createForm.subcategory.trim(),
          difficulty: createForm.difficulty,
          vetted: createForm.vetted,
        }),
      });
      const data = (await res.json()) as { error?: unknown };
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Create failed");
        return;
      }
      toast.success("Question created");
      setShowCreate(false);
      setCreateForm(emptyCreateForm());
      await refresh();
      props.onChanged?.();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="ring-1 ring-border shadow-[var(--shadow-card)]">
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base font-semibold tracking-tight">Question library</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Filter, edit, vet, and retire questions in the pool.
            </p>
            {/*
             * Result count hint. The GET endpoint caps rows at 200; when
             * we hit that cap we tell the curator explicitly so they know
             * to tighten the filters rather than assume the pool is
             * smaller than it really is. Header stats above still show
             * the unfiltered totals.
             */}
            <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {loading
                ? "Loading…"
                : questions.length === 0
                  ? "No matches"
                  : questions.length >= 200
                    ? "Showing first 200 matches — narrow filters to see more"
                    : `Showing ${questions.length} ${questions.length === 1 ? "match" : "matches"}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>
              <RefreshCw className="size-4" />
              Refresh
            </Button>
            <Button type="button" size="sm" onClick={() => setShowCreate((v) => !v)}>
              <Plus className="size-4" />
              {showCreate ? "Hide new question" : "New question"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="grid gap-2">
              <Label>Category</Label>
              <Select
                value={category || "__all__"}
                onValueChange={(v) => setCategory(!v || v === "__all__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__all__">All categories</SelectItem>
                  {props.taxonomy.map((c) => (
                    <SelectItem key={c.id} value={c.label}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Subcategory</Label>
              <Select
                value={subcategory || "__all__"}
                onValueChange={(v) => setSubcategory(!v || v === "__all__" ? "" : v)}
                disabled={!category}
              >
                <SelectTrigger>
                  <SelectValue placeholder={category ? "All subcategories" : "Pick category first"} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__all__">All subcategories</SelectItem>
                  {subsForCategory.map((s) => (
                    <SelectItem key={s.id} value={s.label}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Vetted</Label>
              <Select value={vetted} onValueChange={(v) => setVetted(v as VettedFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="vetted">Vetted only</SelectItem>
                  <SelectItem value="unvetted">Unvetted only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Retired</Label>
              <Select value={retired} onValueChange={(v) => setRetired(v as RetiredFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="retired">Retired only</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Difficulty</Label>
              <Select value={difficulty} onValueChange={(v) => setDifficulty(v as DifficultyFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="1">1 · easy</SelectItem>
                  <SelectItem value="2">2 · medium</SelectItem>
                  <SelectItem value="3">3 · hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 md:col-span-2 xl:col-span-3">
              <Label>Search body</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="e.g. 'capital of'"
                  className="pl-9"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void refresh();
                  }}
                />
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {loading ? "Loading…" : `${questions.length} result${questions.length === 1 ? "" : "s"}`}
          </div>
        </CardContent>
      </Card>

      {showCreate ? (
        <Card className="ring-1 ring-border shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base font-semibold tracking-tight">New question</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2">
              <Label>Body</Label>
              <Textarea
                value={createForm.body}
                onChange={(e) => setCreateForm((f) => ({ ...f, body: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label>Correct answer</Label>
              <Input
                value={createForm.correctAnswer}
                onChange={(e) => setCreateForm((f) => ({ ...f, correctAnswer: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Wrong answers (one per line, exactly 3)</Label>
              <Textarea
                value={createForm.wrongAnswers}
                onChange={(e) => setCreateForm((f) => ({ ...f, wrongAnswers: e.target.value }))}
                rows={4}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select
                  value={createForm.category || "__none__"}
                  onValueChange={(v) =>
                    setCreateForm((f) => ({
                      ...f,
                      category: !v || v === "__none__" ? "" : v,
                      subcategory: "",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__none__">Select…</SelectItem>
                    {props.taxonomy.map((c) => (
                      <SelectItem key={c.id} value={c.label}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Subcategory</Label>
                <Select
                  value={createForm.subcategory || "__none__"}
                  onValueChange={(v) =>
                    setCreateForm((f) => ({ ...f, subcategory: !v || v === "__none__" ? "" : v }))
                  }
                  disabled={!createForm.category}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={createForm.category ? "Select" : "Pick category first"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__none__">Select…</SelectItem>
                    {(props.taxonomy.find((c) => c.label === createForm.category)?.subcategories ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.label}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Difficulty (1-3)</Label>
                <Input
                  type="number"
                  min={1}
                  max={3}
                  value={createForm.difficulty}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, difficulty: Math.min(3, Math.max(1, Number(e.target.value) || 1)) }))
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={createForm.vetted}
                onCheckedChange={(v) => setCreateForm((f) => ({ ...f, vetted: v }))}
              />
              <span className="text-sm">Vet immediately (available to games)</span>
            </div>
            <div className="flex gap-2">
              <Button type="button" disabled={creating} onClick={() => void createQuestion()}>
                Create
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={creating}
                onClick={() => {
                  setShowCreate(false);
                  setCreateForm(emptyCreateForm());
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="ring-1 ring-border shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base font-semibold tracking-tight">Matches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
              {loading ? (
                <SkeletonList rows={5} rowHeight="h-10" />
              ) : questions.length === 0 ? (
                <EmptyState
                  title="No questions match"
                  description="Try loosening a filter or clearing the search."
                />
              ) : (
                questions.map((q) => {
                  const isSelected = selected?.id === q.id;
                  return (
                    <button
                      key={q.id}
                      type="button"
                      className={cn(
                        "group w-full rounded-xl border border-border/60 bg-card p-3 text-left ring-1 ring-transparent shadow-[var(--shadow-card)] transition-colors hover:ring-border",
                        isSelected && "ring-[var(--stage-accent)]"
                      )}
                      onClick={() => setSelected(q)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-medium leading-snug">{q.body}</div>
                        <div className="flex shrink-0 flex-wrap gap-1.5">
                          <StatusPill tone="neutral">d{q.difficulty}</StatusPill>
                          {q.retired ? <StatusPill tone="danger">Retired</StatusPill> : null}
                          {q.vetted ? (
                            <StatusPill tone="success">Vetted</StatusPill>
                          ) : (
                            <StatusPill tone="warning">Unvetted</StatusPill>
                          )}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {q.category} · {q.subcategory}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="ring-1 ring-border shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base font-semibold tracking-tight">Editor</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {!selected ? (
              <EmptyState
                borderless
                title="Select a question to edit"
                description="Click any match on the left to open the editor."
              />
            ) : (
              <>
                <div className="grid gap-2">
                  <Label>Body</Label>
                  <Textarea
                    value={selected.body}
                    onChange={(e) => setSelected({ ...selected, body: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Correct answer</Label>
                  <Input
                    value={selected.correctAnswer}
                    onChange={(e) => setSelected({ ...selected, correctAnswer: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Wrong answers (one per line, exactly 3)</Label>
                  <Textarea
                    value={(selected.wrongAnswers ?? []).join("\n")}
                    onChange={(e) =>
                      setSelected({
                        ...selected,
                        wrongAnswers: e.target.value.split("\n").map((s) => s.trim()),
                      })
                    }
                    rows={4}
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Category</Label>
                    <Input
                      value={selected.category}
                      onChange={(e) => setSelected({ ...selected, category: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Subcategory</Label>
                    <Input
                      value={selected.subcategory}
                      onChange={(e) => setSelected({ ...selected, subcategory: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Difficulty (1-3)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={3}
                    value={selected.difficulty}
                    onChange={(e) => setSelected({ ...selected, difficulty: Number(e.target.value) })}
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={selected.vetted}
                      onCheckedChange={(v) => setSelected({ ...selected, vetted: v })}
                    />
                    <span className="text-sm">Vetted</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={selected.retired}
                      onCheckedChange={(v) => setSelected({ ...selected, retired: v })}
                    />
                    <span className="text-sm">Retired</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" disabled={saving || deleting} onClick={() => void save()}>
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={saving || deleting}
                    onClick={() => setSelected(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    className="ml-auto"
                    disabled={saving || deleting}
                    onClick={() => void deleteQuestion()}
                  >
                    {deleting ? "Deleting…" : "Delete permanently"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
