"use client";

import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGameChannel } from "@/lib/ably/useGameChannel";

export default function HostPage() {
  const routeParams = useParams<{ joinCode: string }>();
  const joinCode = String(routeParams.joinCode ?? "").toUpperCase();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");

  const { messages } = useGameChannel(joinCode);

  const latest = useMemo(() => {
    const reversed = [...messages].reverse();
    return {
      questionStarted: reversed.find((m) => m.name === "question_started"),
      answerRevealed: reversed.find((m) => m.name === "answer_revealed"),
    };
  }, [messages]);

  const active = latest.questionStarted?.data as
    | { question?: string; choices?: string[]; sessionQuestionId?: string }
    | undefined;

  const [busy, setBusy] = useState(false);

  async function callHost(action: "start" | "lock" | "reveal" | "next" | "pause") {
    if (!sessionId) {
      toast.error("Missing sessionId query param");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/game/sessions/${sessionId}/host`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { error?: unknown };
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Request failed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-background min-h-screen p-4">
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Host control</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="text-muted-foreground text-sm">
              Join code: <span className="text-foreground font-mono font-semibold">{joinCode}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={() => callHost("start")}>
                Start question
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => callHost("lock")}>
                Lock answers
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={() => callHost("reveal")}>
                Reveal answer
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => callHost("next")}>
                Next
              </Button>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => callHost("pause")}>
                Pause
              </Button>
            </div>

            <div className="rounded-md border p-4">
              <div className="text-sm text-muted-foreground">Current question</div>
              <div className="mt-2 text-lg font-semibold">{active?.question ?? "—"}</div>
              {active?.choices?.length ? (
                <ol className="mt-3 list-decimal pl-5 text-sm">
                  {active.choices.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ol>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Live feed</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <pre className="text-foreground max-h-[520px] overflow-auto whitespace-pre-wrap">
              {JSON.stringify(messages.slice(-20), null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
