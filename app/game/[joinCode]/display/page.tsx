"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useGameChannel } from "@/lib/ably/useGameChannel";

export default function DisplayPage() {
  const routeParams = useParams<{ joinCode: string }>();
  const joinCode = String(routeParams.joinCode ?? "").toUpperCase();
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
    | { question?: string; choices?: string[]; timerSeconds?: number | null }
    | undefined;

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!active?.timerSeconds) {
      setSecondsLeft(null);
      return;
    }
    setSecondsLeft(active.timerSeconds);
    const t = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s === null) return s;
        return s > 0 ? s - 1 : 0;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [active?.timerSeconds, latest.questionStarted?.id]);

  return (
    <div className="bg-black text-white min-h-screen p-10">
      <div className="flex items-start justify-between gap-10">
        <div className="text-3xl font-semibold tracking-tight">trivia.box</div>
        {secondsLeft !== null ? (
          <div className="text-6xl font-black tabular-nums">{secondsLeft}</div>
        ) : null}
      </div>

      <div className="mt-16 max-w-6xl">
        {active?.question ? (
          <div className="text-6xl font-bold leading-tight">{active.question}</div>
        ) : (
          <div className="text-4xl text-white/70">Waiting…</div>
        )}

        {active?.choices?.length ? (
          <div className="mt-12 grid grid-cols-2 gap-8">
            {active.choices.map((c, idx) => (
              <div
                key={`${c}-${idx}`}
                className="rounded-2xl border border-white/20 bg-white/5 p-8 text-4xl font-semibold"
              >
                {c}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {latest.leaderboard?.data ? (
        <div className="mt-16 text-3xl font-semibold">Leaderboard update</div>
      ) : null}
    </div>
  );
}
