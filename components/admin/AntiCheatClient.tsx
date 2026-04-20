"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton-list";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";

type Cluster = {
  sessionId: string;
  sessionCode: string;
  startedAt: string | null;
  venueName: string | null;
  fingerprintKind: "ip" | "ua" | "device";
  fingerprint: string;
  playerCount: number;
  answerCount: number;
  correctCount: number;
  totalPoints: number;
  lastAnswerAt: string | null;
};

type ClusterAnswer = {
  answerId: string;
  playerId: string;
  username: string;
  sessionCode: string;
  sessionQuestionId: string;
  answerGiven: string;
  isCorrect: boolean;
  timeToAnswerMs: number;
  serverElapsedMs: number | null;
  pointsAwarded: number;
  ipHash: string | null;
  uaHash: string | null;
  deviceId: string | null;
  disqualifiedAt: string | null;
  createdAt: string;
};

const KIND_LABEL: Record<Cluster["fingerprintKind"], string> = {
  ip: "Shared IP hash",
  device: "Shared device id",
  ua: "Shared user-agent",
};

function shortFingerprint(fp: string): string {
  const parts = fp.split(":");
  const tail = parts[parts.length - 1] ?? fp;
  return tail.slice(0, 8);
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return "—";
  return d.toLocaleString();
}

export function AntiCheatClient() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Cluster | null>(null);
  const [answers, setAnswers] = useState<ClusterAnswer[]>([]);
  const [answersLoading, setAnswersLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/anti-cheat");
      const data = (await res.json()) as { clusters?: Cluster[]; error?: unknown };
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Failed to load");
        return;
      }
      setClusters(data.clusters ?? []);
    } catch {
      toast.error("Failed to load clusters");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAnswers = useCallback(async (cluster: Cluster) => {
    setAnswersLoading(true);
    setAnswers([]);
    try {
      const qs = new URLSearchParams({
        sessionId: cluster.sessionId,
        kind: cluster.fingerprintKind,
        fingerprint: cluster.fingerprint,
      });
      const res = await fetch(`/api/admin/anti-cheat/answers?${qs.toString()}`);
      const data = (await res.json()) as { answers?: ClusterAnswer[]; error?: unknown };
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Failed to load answers");
        return;
      }
      setAnswers(data.answers ?? []);
    } catch {
      toast.error("Failed to load answers");
    } finally {
      setAnswersLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function selectCluster(c: Cluster) {
    setActive(c);
    void loadAnswers(c);
  }

  async function toggleDisqualified(row: ClusterAnswer) {
    const nextState = !row.disqualifiedAt;
    try {
      const res = await fetch(`/api/admin/anti-cheat/answers/${row.answerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disqualified: nextState }),
      });
      const data = (await res.json()) as { error?: unknown };
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Update failed");
      toast.success(nextState ? "Answer disqualified" : "Answer restored");
      if (active) {
        await loadAnswers(active);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end">
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="ring-1 ring-border shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
              Suspicious clusters
              <StatusPill tone="warning">
                <span className="tabular-nums">{clusters.length}</span>
              </StatusPill>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {loading ? (
              <SkeletonList rows={4} rowHeight="h-14" />
            ) : clusters.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck className="size-6" />}
                title="Nothing suspicious"
                description="No sessions have multiple players sharing the same fingerprint right now."
              />
            ) : (
              clusters.map((c) => {
                const key = `${c.sessionId}:${c.fingerprintKind}:${c.fingerprint}`;
                const activeKey = active
                  ? `${active.sessionId}:${active.fingerprintKind}:${active.fingerprint}`
                  : "";
                return (
                  <button
                    key={key}
                    type="button"
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-xl border border-border/60 bg-card p-3 text-left text-sm ring-1 ring-transparent shadow-[var(--shadow-card)] transition-colors hover:ring-border",
                      activeKey === key && "ring-[var(--stage-accent)]"
                    )}
                    onClick={() => selectCluster(c)}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <div className="font-medium tracking-tight">
                        {c.venueName ?? "Unknown venue"} — #{c.sessionCode || c.sessionId.slice(0, 8)}
                      </div>
                      <StatusPill tone="warning" className="shrink-0">
                        {KIND_LABEL[c.fingerprintKind]}
                      </StatusPill>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground tabular-nums">
                      <span>{c.playerCount} players</span>
                      <span>{c.answerCount} answers</span>
                      <span>{c.correctCount} correct</span>
                      <span>{c.totalPoints} pts</span>
                      <span className="truncate">fp {shortFingerprint(c.fingerprint)}…</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      last {formatRelative(c.lastAnswerAt)}
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="ring-1 ring-border shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-base font-semibold tracking-tight">
              Cluster answers
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {!active ? (
              <EmptyState
                borderless
                icon={<ShieldAlert className="size-6" />}
                title="Pick a cluster"
                description="Choose any cluster on the left to see every answer sharing that fingerprint and decide whether to disqualify."
              />
            ) : answersLoading ? (
              <SkeletonList rows={5} rowHeight="h-12" />
            ) : answers.length === 0 ? (
              <EmptyState
                borderless
                title="No answers"
                description="This cluster has no matching answers — it may have been cleaned up already."
              />
            ) : (
              <div className="flex flex-col gap-2">
                {answers.map((a) => (
                  <div
                    key={a.answerId}
                    className={cn(
                      "flex flex-col gap-1 rounded-xl border border-border/60 bg-card p-3 text-sm shadow-[var(--shadow-card)]",
                      a.disqualifiedAt && "opacity-70"
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium tracking-tight">{a.username || "—"}</span>
                        <StatusPill tone={a.isCorrect ? "success" : "neutral"}>
                          {a.isCorrect ? "correct" : "wrong"}
                        </StatusPill>
                        {a.disqualifiedAt ? (
                          <StatusPill tone="danger">DQ</StatusPill>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={a.disqualifiedAt ? "outline" : "destructive"}
                        onClick={() => void toggleDisqualified(a)}
                      >
                        {a.disqualifiedAt ? "Restore" : "Disqualify"}
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">“{a.answerGiven}”</div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
                      <span>pts {a.pointsAwarded}</span>
                      <span>client {a.timeToAnswerMs}ms</span>
                      <span>server {a.serverElapsedMs ?? "—"}ms</span>
                      <span>{formatRelative(a.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
