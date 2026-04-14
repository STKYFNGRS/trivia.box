"use client";

import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGameChannel } from "@/lib/ably/useGameChannel";

export default function PlayPage() {
  const routeParams = useParams<{ joinCode: string }>();
  const joinCode = String(routeParams.joinCode ?? "").toUpperCase();
  const searchParams = useSearchParams();
  const playerId = searchParams.get("playerId");

  const { messages } = useGameChannel(joinCode);
  const latest = useMemo(() => {
    const reversed = [...messages].reverse();
    return {
      questionStarted: reversed.find((m) => m.name === "question_started"),
      answerRevealed: reversed.find((m) => m.name === "answer_revealed"),
      leaderboard: reversed.find((m) => m.name === "leaderboard_updated"),
    };
  }, [messages]);

  const active = latest.questionStarted?.data as
    | {
        sessionQuestionId?: string;
        question?: string;
        choices?: string[];
        timerSeconds?: number | null;
      }
    | undefined;

  const [picked, setPicked] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitAnswer(choice: string) {
    if (!playerId || !active?.sessionQuestionId) {
      toast.error("Missing player or question");
      return;
    }
    setSubmitting(true);
    setPicked(choice);
    try {
      const res = await fetch("/api/game/public/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          joinCode,
          playerId,
          sessionQuestionId: active.sessionQuestionId,
          answer: choice,
          timeToAnswerMs: 1200,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: unknown; isCorrect?: boolean };
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Submit failed");
      }
      toast.message(data.isCorrect ? "Correct!" : "Nice try");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-background min-h-screen p-4">
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <div className="text-sm text-muted-foreground">Code: {joinCode}</div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Question</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {active?.question ? (
              <div className="text-lg font-medium leading-snug">{active.question}</div>
            ) : (
              <div className="text-muted-foreground text-sm">Waiting for the host to start…</div>
            )}

            {active?.choices?.length ? (
              <div className="grid gap-2">
                {active.choices.map((c) => (
                  <Button
                    key={c}
                    type="button"
                    variant={picked === c ? "default" : "secondary"}
                    disabled={submitting || Boolean(latest.answerRevealed)}
                    onClick={() => submitAnswer(c)}
                  >
                    {c}
                  </Button>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {latest.leaderboard?.data ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Leaderboard</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <pre className="text-foreground overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(latest.leaderboard.data, null, 2)}
              </pre>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
