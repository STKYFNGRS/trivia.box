"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderTree, Library, ListChecks, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/ui/section-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuestionLibrary } from "./QuestionLibrary";
import { QuestionReview } from "./QuestionReview";
import { QuestionGenerate } from "./QuestionGenerate";
import { QuestionTaxonomy } from "./QuestionTaxonomy";
import { TaxonomyMissingBanner } from "./TaxonomyMissingBanner";

type View = "library" | "review" | "generate" | "taxonomy";
type ReviewTab = "pending" | "rejected" | "approved";

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

type TaxonomyState =
  | { status: "loading" }
  | { status: "ready"; categories: TaxonomyCat[] }
  | { status: "missing"; message: string; migration: string | null }
  | { status: "error"; message: string };

function parseView(raw: string | null): View {
  if (raw === "review" || raw === "generate" || raw === "taxonomy") return raw;
  return "library";
}

function parseReviewTab(raw: string | null): ReviewTab {
  if (raw === "rejected" || raw === "approved") return raw;
  return "pending";
}

type TabDef = {
  id: View;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  operatorOnly: boolean;
};

const TAB_ORDER: TabDef[] = [
  { id: "library", label: "Library", icon: Library, operatorOnly: false },
  { id: "review", label: "Review", icon: ListChecks, operatorOnly: true },
  { id: "generate", label: "Generate", icon: Sparkles, operatorOnly: true },
  { id: "taxonomy", label: "Taxonomy", icon: FolderTree, operatorOnly: true },
];

export function QuestionStudio(props: { isSiteOperator: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialView = parseView(searchParams.get("view"));
  const initialReviewTab = parseReviewTab(searchParams.get("status"));
  const [view, setView] = useState<View>(
    !props.isSiteOperator && initialView !== "library" ? "library" : initialView
  );
  const [taxonomy, setTaxonomy] = useState<TaxonomyState>({ status: "loading" });

  useEffect(() => {
    const next = parseView(searchParams.get("view"));
    const resolved = !props.isSiteOperator && next !== "library" ? "library" : next;
    setView((prev) => (prev === resolved ? prev : resolved));
  }, [searchParams, props.isSiteOperator]);

  const loadTaxonomy = useCallback(async () => {
    setTaxonomy({ status: "loading" });
    try {
      const res = await fetch("/api/admin/question-taxonomy?all=1");
      if (res.status === 503) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
          migration?: string;
        } | null;
        if (data?.error === "taxonomy_missing") {
          setTaxonomy({
            status: "missing",
            message: data.message ?? "Taxonomy tables are missing.",
            migration: data.migration ?? null,
          });
          return;
        }
      }
      const data = (await res.json()) as { categories?: TaxonomyCat[]; error?: unknown };
      if (!res.ok) {
        setTaxonomy({ status: "error", message: "Could not load taxonomy." });
        return;
      }
      setTaxonomy({ status: "ready", categories: data.categories ?? [] });
    } catch {
      setTaxonomy({ status: "error", message: "Could not load taxonomy." });
    }
  }, []);

  useEffect(() => {
    void loadTaxonomy();
  }, [loadTaxonomy]);

  const activeCategories = useMemo(() => {
    if (taxonomy.status !== "ready") return [];
    return taxonomy.categories
      .filter((c) => c.active)
      .map((c) => ({
        id: c.id,
        label: c.label,
        active: c.active,
        subcategories: c.subcategories
          .filter((s) => s.active)
          .map((s) => ({ id: s.id, label: s.label, active: s.active })),
      }));
  }, [taxonomy]);

  const switchTab = useCallback(
    (next: View, extra?: Record<string, string>) => {
      if (!props.isSiteOperator && next !== "library") return;
      const params = new URLSearchParams(searchParams.toString());
      if (next === "library") {
        params.delete("view");
      } else {
        params.set("view", next);
      }
      if (next !== "review") {
        params.delete("status");
      }
      if (extra) {
        for (const [k, v] of Object.entries(extra)) {
          params.set(k, v);
        }
      }
      const query = params.toString();
      router.replace(query ? `/admin/questions?${query}` : `/admin/questions`);
      setView(next);
    },
    [props.isSiteOperator, router, searchParams]
  );

  const availableTabs = TAB_ORDER.filter((t) => !t.operatorOnly || props.isSiteOperator);
  const taxonomyMissing = taxonomy.status === "missing";
  const taxonomyLoading = taxonomy.status === "loading";

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader
        as="h1"
        eyebrow="Admin"
        title="Question studio"
        description="Generate, review, edit, retire, and organize the vetted question pool from one place."
        actions={
          taxonomy.status === "ready" ? (
            <Button type="button" size="sm" variant="outline" onClick={() => void loadTaxonomy()}>
              <RefreshCw className="size-4" />
              Reload taxonomy
            </Button>
          ) : null
        }
      />

      {taxonomy.status === "missing" ? (
        <TaxonomyMissingBanner
          message={taxonomy.message}
          migration={taxonomy.migration}
        />
      ) : null}
      {taxonomy.status === "error" ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {taxonomy.message}
        </div>
      ) : null}

      <Tabs
        value={view}
        onValueChange={(v) => switchTab(v as View)}
        className="gap-6"
      >
        <div className="sticky top-[57px] z-20 -mx-4 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-xl">
          <TabsList variant="line" className="h-10 gap-2">
            {availableTabs.map((tab) => {
              const disabled =
                (tab.id === "generate" || tab.id === "taxonomy") && (taxonomyMissing || taxonomyLoading);
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  disabled={disabled}
                  className="h-9 px-3 text-sm"
                >
                  <Icon className="size-4" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent value="library" className="mt-0">
          <QuestionLibrary taxonomy={activeCategories} />
        </TabsContent>

        {props.isSiteOperator ? (
          <TabsContent value="review" className="mt-0">
            <QuestionReview
              initialTab={initialReviewTab}
              onTabChange={(t) => switchTab("review", { status: t })}
            />
          </TabsContent>
        ) : null}

        {props.isSiteOperator ? (
          <TabsContent value="generate" className="mt-0">
            {taxonomy.status === "ready" ? (
              <QuestionGenerate
                taxonomy={activeCategories}
                onDraftsChanged={() => void loadTaxonomy()}
              />
            ) : taxonomyLoading ? (
              <p className="text-sm text-muted-foreground">Loading taxonomy…</p>
            ) : null}
          </TabsContent>
        ) : null}

        {props.isSiteOperator ? (
          <TabsContent value="taxonomy" className="mt-0">
            {taxonomy.status === "ready" ? (
              <QuestionTaxonomy
                categories={taxonomy.categories}
                onChanged={() => void loadTaxonomy()}
              />
            ) : taxonomyLoading ? (
              <p className="text-sm text-muted-foreground">Loading taxonomy…</p>
            ) : null}
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
