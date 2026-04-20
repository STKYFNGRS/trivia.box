"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Inbox, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton-list";
import { StatusPill } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type SubmittedDeck = {
  id: string;
  name: string;
  description: string | null;
  defaultCategory: string | null;
  defaultSubcategory: string | null;
  submittedAt: string | null;
  owner: { id: string; name: string; email: string } | null;
  questionCount: number;
};

type DeckDetail = {
  deck: {
    id: string;
    name: string;
    description: string | null;
    defaultCategory: string | null;
    defaultSubcategory: string | null;
    visibility: string;
    submittedAt: string | null;
  };
  owner: { id: string; name: string; email: string } | null;
  questions: Array<{
    id: string;
    body: string;
    correctAnswer: string;
    wrongAnswers: string[];
    category: string;
    subcategory: string;
    difficulty: number;
  }>;
};

export function DeckSubmissionsClient() {
  const [decks, setDecks] = useState<SubmittedDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<DeckDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/deck-submissions");
      const data = (await res.json()) as { decks?: SubmittedDeck[]; error?: unknown };
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Failed to load submissions");
        return;
      }
      setDecks(data.decks ?? []);
    } catch {
      toast.error("Failed to load submissions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function openDetail(id: string) {
    setDetailLoading(true);
    setDetail(null);
    setRejectNote("");
    try {
      const res = await fetch(`/api/admin/deck-submissions/${id}`);
      const data = (await res.json()) as DeckDetail & { error?: unknown };
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Failed to load deck");
        return;
      }
      setDetail(data);
    } catch {
      toast.error("Failed to load deck");
    } finally {
      setDetailLoading(false);
    }
  }

  async function approve() {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/deck-submissions/${detail.deck.id}/approve`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Approve failed");
      toast.success("Deck approved and now public");
      setDetail(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/deck-submissions/${detail.deck.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: rejectNote.trim() || undefined }),
      });
      const data = (await res.json()) as { error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Reject failed");
      toast.success("Deck rejected with note");
      setDetail(null);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="ring-1 ring-border shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
            Queue
            <StatusPill tone="neutral">
              <span className="tabular-nums">{decks.length}</span>
            </StatusPill>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {loading ? (
            <SkeletonList rows={3} rowHeight="h-12" />
          ) : decks.length === 0 ? (
            <EmptyState
              icon={<Inbox className="size-6" />}
              title="No submissions"
              description="Pending host-submitted decks will land here for review."
            />
          ) : (
            decks.map((d) => (
              <button
                key={d.id}
                type="button"
                className={cn(
                  "flex flex-col items-start gap-1 rounded-xl border border-border/60 bg-card p-3 text-left text-sm ring-1 ring-transparent shadow-[var(--shadow-card)] transition-colors hover:ring-border",
                  detail?.deck.id === d.id && "ring-[var(--stage-accent)]"
                )}
                onClick={() => void openDetail(d.id)}
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <div className="font-medium tracking-tight">{d.name}</div>
                  <StatusPill tone="info" className="shrink-0">
                    <span className="tabular-nums">{d.questionCount}</span> Q
                  </StatusPill>
                </div>
                <div className="text-xs text-muted-foreground">
                  {d.owner?.name ?? "Unknown author"}
                </div>
                {d.description ? (
                  <div className="text-xs text-muted-foreground">{d.description}</div>
                ) : null}
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="ring-1 ring-border shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-base font-semibold tracking-tight">Review</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {detailLoading ? (
            <SkeletonList rows={4} rowHeight="h-10" />
          ) : !detail ? (
            <EmptyState
              borderless
              title="Select a submission"
              description="Pick any deck from the queue to see its questions and approve or reject."
            />
          ) : (
            <>
              <div>
                <div className="text-base font-semibold tracking-tight">{detail.deck.name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Author: {detail.owner?.name ?? "Unknown"}{" "}
                  {detail.owner ? <span>&lt;{detail.owner.email}&gt;</span> : null}
                </div>
                {detail.deck.description ? (
                  <p className="mt-2 text-sm text-muted-foreground">{detail.deck.description}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                {detail.questions.map((q, i) => (
                  <div
                    key={q.id}
                    className="rounded-xl border border-border/60 bg-card p-3 text-sm shadow-[var(--shadow-card)]"
                  >
                    <div className="font-medium leading-snug">
                      <span className="mr-1.5 tabular-nums text-muted-foreground">{i + 1}.</span>
                      {q.body}
                    </div>
                    <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                      ✓ {q.correctAnswer}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ✗ {q.wrongAnswers.join(" / ")}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <StatusPill tone="neutral">
                        {q.category} / {q.subcategory}
                      </StatusPill>
                      <span className="tabular-nums text-muted-foreground">
                        Difficulty {q.difficulty}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <Textarea
                  placeholder="Optional note shown to the author if you reject."
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  maxLength={500}
                  className="min-h-[60px]"
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={busy} onClick={() => void approve()}>
                    <CheckCircle2 className="size-4" />
                    Approve deck
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void reject()}
                  >
                    <XCircle className="size-4" />
                    Reject
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
