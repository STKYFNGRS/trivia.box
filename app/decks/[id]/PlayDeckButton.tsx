"use client";

import { Loader2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import {
  MAX_SOLO_QUESTIONS,
  MIN_SOLO_QUESTIONS,
  type SoloSpeed,
} from "@/lib/game/soloConstants";
import { cn } from "@/lib/utils";

type Props = {
  deckId: string;
  /** Total vetted questions in the deck — caps session length. */
  deckQuestionCount: number;
  /** Visual size — match the neighboring buttons. */
  size?: "sm" | "md";
};

/**
 * "Play this deck" CTA on `/decks/[id]`.
 *
 * Posts to the shared `/api/solo/start` with `deckId` + a sensible preset
 * (standard 30s timer, 10 questions or the deck size if smaller), then
 * navigates to `/play/solo/<id>` which mirrors the normal solo flow.
 *
 * We don't render the selector (speed, count) here because that would
 * duplicate `SoloSetupClient` for what is ultimately a "try it" CTA —
 * players who want to customize settings can still use `/play/solo`
 * directly, and a power-user deck-config flow is out of scope for the
 * marketplace discovery page.
 */
export function PlayDeckButton({
  deckId,
  deckQuestionCount,
  size = "md",
}: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const onPlay = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const defaultSpeed: SoloSpeed = "standard";
      const count = Math.max(
        MIN_SOLO_QUESTIONS,
        Math.min(
          MAX_SOLO_QUESTIONS,
          deckQuestionCount > 0 ? Math.min(deckQuestionCount, 10) : 10
        )
      );
      const res = await fetch("/api/solo/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speed: defaultSpeed,
          questionCount: count,
          deckId,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(err.error ?? "Couldn't start a deck run");
      }
      const data = (await res.json()) as { sessionId?: string };
      if (!data.sessionId) {
        throw new Error("Missing session id in response");
      }
      router.push(`/play/solo/${data.sessionId}`);
    } catch (e) {
      setSubmitting(false);
      toast.error(e instanceof Error ? e.message : "Couldn't start the deck");
    }
  }, [deckId, deckQuestionCount, router, submitting]);

  const disabled = submitting || deckQuestionCount <= 0;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPlay}
      className={cn(
        buttonVariants({ size: size === "sm" ? "sm" : "default" }),
        "gap-2 bg-[var(--stage-accent)] text-slate-950 hover:bg-[var(--stage-accent)]/90",
        disabled ? "opacity-60" : null
      )}
      aria-busy={submitting}
    >
      {submitting ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Play className="size-4" aria-hidden />
      )}
      {submitting
        ? "Starting…"
        : deckQuestionCount <= 0
          ? "No questions yet"
          : "Play this deck"}
    </button>
  );
}
