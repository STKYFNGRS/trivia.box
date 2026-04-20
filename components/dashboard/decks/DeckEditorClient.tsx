"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton-list";
import { StatusPill, pillVariants } from "@/components/ui/status-pill";
import type { VariantProps } from "class-variance-authority";

type Deck = {
  id: string;
  name: string;
  description: string | null;
  defaultCategory: string | null;
  defaultSubcategory: string | null;
  visibility: "private" | "submitted" | "public" | "rejected" | "game_scoped";
  reviewNote: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
  ownerAccountId: string;
};

type DeckQuestion = {
  id: string;
  body: string;
  correctAnswer: string;
  wrongAnswers: string[];
  category: string;
  subcategory: string;
  difficulty: number;
  deckId: string | null;
};

type PillTone = NonNullable<VariantProps<typeof pillVariants>["tone"]>;

const VISIBILITY_COPY: Record<
  Deck["visibility"],
  { label: string; description: string; tone: PillTone }
> = {
  private: {
    label: "Private",
    description: "Only you can see and use this deck in your own games.",
    tone: "neutral",
  },
  submitted: {
    label: "Pending review",
    description:
      "A site admin is reviewing this deck. Questions are locked until the review finishes.",
    tone: "info",
  },
  public: {
    label: "Public",
    description:
      "Approved. Any host can pull from this deck. It is now frozen — create a new deck for edits.",
    tone: "success",
  },
  rejected: {
    label: "Rejected",
    description:
      "The submission was declined. Make changes, then re-submit if you want to try again.",
    tone: "danger",
  },
  game_scoped: {
    label: "Single game",
    description: "Hidden deck auto-created while building a specific game.",
    tone: "neutral",
  },
};

function canEditQuestions(vis: Deck["visibility"]) {
  return vis === "private" || vis === "rejected";
}

export function DeckEditorClient({ deckId }: { deckId: string }) {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [questions, setQuestions] = useState<DeckQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [qBody, setQBody] = useState("");
  const [qCorrect, setQCorrect] = useState("");
  const [qWrong, setQWrong] = useState(["", "", ""]);
  const [qDifficulty, setQDifficulty] = useState(2);

  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editSubcategory, setEditSubcategory] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/decks/${deckId}`);
      const data = (await res.json()) as {
        deck?: Deck;
        questions?: DeckQuestion[];
        error?: unknown;
      };
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Failed to load deck");
        return;
      }
      setDeck(data.deck ?? null);
      setQuestions(data.questions ?? []);
      if (data.deck) {
        setEditName(data.deck.name);
        setEditCategory(data.deck.defaultCategory ?? "");
        setEditSubcategory(data.deck.defaultSubcategory ?? "");
        setEditDesc(data.deck.description ?? "");
      }
    } catch {
      toast.error("Failed to load deck");
    } finally {
      setLoading(false);
    }
  }, [deckId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveSettings() {
    if (!deck) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/dashboard/decks/${deck.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim() || deck.name,
          description: editDesc.trim() || null,
          defaultCategory: editCategory.trim() || null,
          defaultSubcategory: editSubcategory.trim() || null,
        }),
      });
      const data = (await res.json()) as { error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Save failed");
      toast.success("Deck updated");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function addQuestion() {
    if (!deck) return;
    const wrongs = qWrong.map((s) => s.trim()).filter((s) => s.length > 0);
    if (!qBody.trim() || !qCorrect.trim() || wrongs.length !== 3) {
      toast.error("Fill the question, the correct answer, and exactly 3 wrong answers");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/dashboard/decks/${deck.id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: qBody.trim(),
          correctAnswer: qCorrect.trim(),
          wrongAnswers: wrongs,
          difficulty: qDifficulty,
        }),
      });
      const data = (await res.json()) as { error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Add failed");
      toast.success("Question added");
      setQBody("");
      setQCorrect("");
      setQWrong(["", "", ""]);
      setQDifficulty(2);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }

  async function retireQuestion(qid: string) {
    if (!deck) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/dashboard/decks/${deck.id}/questions/${qid}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: unknown };
        throw new Error(typeof data.error === "string" ? data.error : "Remove failed");
      }
      toast.success("Question removed");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitForReview() {
    if (!deck) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/dashboard/decks/${deck.id}/submit`, { method: "POST" });
      const data = (await res.json()) as { error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Submit failed");
      toast.success("Submitted for site-admin review");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDeck() {
    if (!deck) return;
    if (!confirm(`Delete deck "${deck.name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/dashboard/decks/${deck.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: unknown };
        throw new Error(typeof data.error === "string" ? data.error : "Delete failed");
      }
      toast.success("Deck deleted");
      window.location.href = "/dashboard/decks";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <SkeletonList rows={4} rowHeight="h-4" />
      </div>
    );
  }
  if (!deck) return <p className="text-sm">Deck not found.</p>;

  const editable = canEditQuestions(deck.visibility);
  const canSubmit = deck.visibility === "private" || deck.visibility === "rejected";
  const vis = VISIBILITY_COPY[deck.visibility];

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        as="h1"
        eyebrow="Deck"
        title={deck.name}
        description={vis.description}
        actions={
          <>
            <StatusPill tone={vis.tone}>{vis.label}</StatusPill>
            <span className="text-muted-foreground text-xs tabular-nums">
              {questions.length} {questions.length === 1 ? "question" : "questions"}
            </span>
          </>
        }
      />

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="tracking-tight">Settings</CardTitle>
          <CardDescription>
            Rename the deck or change its default category. Locked while in review or after
            approval.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              disabled={!editable || busy}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-category">Default category</Label>
            <Input
              id="edit-category"
              disabled={!editable || busy}
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              placeholder="Sports"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-subcategory">Default subcategory</Label>
            <Input
              id="edit-subcategory"
              disabled={!editable || busy}
              value={editSubcategory}
              onChange={(e) => setEditSubcategory(e.target.value)}
              placeholder="NBA"
            />
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="edit-desc">Description</Label>
            <Textarea
              id="edit-desc"
              disabled={!editable || busy}
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              maxLength={400}
              className="min-h-[60px]"
            />
          </div>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="button" disabled={!editable || busy} onClick={() => void saveSettings()}>
              Save settings
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!canSubmit || busy || questions.length < 3}
              onClick={() => void submitForReview()}
              title={
                questions.length < 3
                  ? "Add at least 3 questions before submitting for public review"
                  : undefined
              }
            >
              Submit for public review
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || deck.visibility === "public"}
              onClick={() => void deleteDeck()}
            >
              Delete deck
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="tracking-tight">Questions</CardTitle>
          <CardDescription>
            {editable
              ? "Add, remove, or tweak questions. Minimum three to submit for public review."
              : deck.visibility === "submitted"
                ? "Questions are locked during review."
                : "Public decks are frozen. Create a new deck to make changes."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {editable ? (
            <div className="bg-muted/30 grid gap-3 rounded-lg border border-border/70 p-4">
              <div className="text-sm font-medium">Add a question</div>
              <div className="grid gap-2">
                <Label htmlFor="q-body">Question</Label>
                <Textarea
                  id="q-body"
                  value={qBody}
                  onChange={(e) => setQBody(e.target.value)}
                  maxLength={500}
                  className="min-h-[60px]"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="q-correct">Correct answer</Label>
                <Input
                  id="q-correct"
                  value={qCorrect}
                  onChange={(e) => setQCorrect(e.target.value)}
                  maxLength={160}
                />
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {qWrong.map((w, i) => (
                  <div key={i} className="grid gap-2">
                    <Label htmlFor={`q-wrong-${i}`}>Wrong answer {i + 1}</Label>
                    <Input
                      id={`q-wrong-${i}`}
                      value={w}
                      onChange={(e) => {
                        const copy = [...qWrong];
                        copy[i] = e.target.value;
                        setQWrong(copy);
                      }}
                      maxLength={160}
                    />
                  </div>
                ))}
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <div className="grid gap-2">
                  <Label>Difficulty</Label>
                  <select
                    className="bg-background h-9 rounded-md border px-3 text-sm"
                    value={qDifficulty}
                    onChange={(e) => setQDifficulty(Number(e.target.value))}
                  >
                    <option value={1}>Easy</option>
                    <option value={2}>Medium</option>
                    <option value={3}>Hard</option>
                  </select>
                </div>
              </div>
              <div>
                <Button type="button" disabled={busy} onClick={() => void addQuestion()}>
                  Add question
                </Button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            {questions.length === 0 ? (
              <EmptyState
                borderless
                icon={<Inbox className="size-6" aria-hidden />}
                title="No questions yet"
                description={
                  editable
                    ? "Add one with the form above — you need at least three to submit for public review."
                    : "This deck hasn't been populated with questions."
                }
                className="py-6"
              />
            ) : (
              questions.map((q, idx) => (
                <div
                  key={q.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border/70 p-3"
                >
                  <div className="flex flex-col">
                    <div className="text-sm font-medium">
                      {idx + 1}. {q.body}
                    </div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      ✓ {q.correctAnswer} · ✗ {q.wrongAnswers.join(" / ")}
                    </div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      {q.category} / {q.subcategory} · difficulty {q.difficulty}
                    </div>
                  </div>
                  {editable ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void retireQuestion(q.id)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
