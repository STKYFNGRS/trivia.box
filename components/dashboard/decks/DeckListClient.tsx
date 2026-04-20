"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton-list";
import { StatusPill, pillVariants } from "@/components/ui/status-pill";
import type { VariantProps } from "class-variance-authority";

export type DeckSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  defaultCategory: string | null;
  defaultSubcategory: string | null;
  visibility: "private" | "submitted" | "public" | "rejected" | "game_scoped";
  reviewNote: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
  updatedAt: string;
  createdAt: string;
  questionCount: number;
};

type PillTone = NonNullable<VariantProps<typeof pillVariants>["tone"]>;

const VISIBILITY_LABEL: Record<DeckSummary["visibility"], string> = {
  private: "Private",
  submitted: "Pending review",
  public: "Public",
  rejected: "Rejected",
  game_scoped: "Single game",
};

const VISIBILITY_TONE: Record<DeckSummary["visibility"], PillTone> = {
  private: "neutral",
  submitted: "info",
  public: "success",
  rejected: "danger",
  game_scoped: "neutral",
};

export function DeckListClient() {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCategory, setNewCategory] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/decks");
      const data = (await res.json()) as { decks?: DeckSummary[]; error?: unknown };
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Failed to load decks");
        setDecks([]);
        return;
      }
      setDecks(data.decks ?? []);
    } catch {
      toast.error("Failed to load decks");
      setDecks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createDeck() {
    if (!newName.trim()) {
      toast.error("Give the deck a name first");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/dashboard/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim() || undefined,
          defaultCategory: newCategory.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { deck?: DeckSummary; error?: unknown };
      if (!res.ok) {
        const msg = typeof data.error === "string" ? data.error : "Create failed";
        throw new Error(msg);
      }
      toast.success("Deck created");
      setNewName("");
      setNewDesc("");
      setNewCategory("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="tracking-tight">New deck</CardTitle>
          <CardDescription>
            Start with a name and a default category. You can add questions from the editor.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="grid gap-2 md:col-span-1">
            <Label htmlFor="deck-name">Name</Label>
            <Input
              id="deck-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Summer movie trivia"
              maxLength={80}
            />
          </div>
          <div className="grid gap-2 md:col-span-1">
            <Label htmlFor="deck-category">Default category (optional)</Label>
            <Input
              id="deck-category"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Film"
              maxLength={120}
            />
          </div>
          <div className="grid gap-2 md:col-span-1">
            <Label htmlFor="deck-desc">Short description</Label>
            <Textarea
              id="deck-desc"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="What themes does this deck cover?"
              maxLength={400}
              className="min-h-[40px]"
            />
          </div>
          <div className="md:col-span-3">
            <Button type="button" disabled={busy} onClick={() => void createDeck()}>
              Create deck
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="tracking-tight">Your decks</CardTitle>
          <CardDescription>
            {decks.length
              ? `${decks.length} deck${decks.length === 1 ? "" : "s"}`
              : "Create your first deck to reuse questions across games."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {loading ? (
            <SkeletonList rows={3} avatar rowHeight="h-5" />
          ) : decks.length === 0 ? (
            <EmptyState
              borderless
              icon={<Layers className="size-6" aria-hidden />}
              title="No decks yet"
              description="Start one above and add questions to it. Decks are private until you submit them for public review."
            />
          ) : (
            decks.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/70 bg-card p-4 transition-colors hover:bg-muted/30"
              >
                <div className="flex flex-col">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/dashboard/decks/${d.id}`}
                      className="text-foreground text-base font-medium underline-offset-4 hover:underline"
                    >
                      {d.name}
                    </Link>
                    <StatusPill tone={VISIBILITY_TONE[d.visibility]}>
                      {VISIBILITY_LABEL[d.visibility]}
                    </StatusPill>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {d.questionCount} {d.questionCount === 1 ? "question" : "questions"}
                    </span>
                  </div>
                  {d.description ? (
                    <p className="text-muted-foreground mt-1 max-w-prose text-xs">
                      {d.description}
                    </p>
                  ) : null}
                  {d.visibility === "rejected" && d.reviewNote ? (
                    <p className="mt-2 max-w-prose text-xs text-red-600 dark:text-red-400">
                      Reviewer note: {d.reviewNote}
                    </p>
                  ) : null}
                </div>
                <Link
                  href={`/dashboard/decks/${d.id}`}
                  className="text-xs underline underline-offset-4"
                  aria-label={`Open deck ${d.name}`}
                >
                  Open →
                </Link>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
