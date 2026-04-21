"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Kick-off button for `/play/daily`. Posts to `/api/solo/daily`, which
 * either creates a fresh solo session for today's global challenge or
 * returns the player's existing attempt id (so a mid-run refresh still
 * drops them back into the same run).
 */
export function DailyChallengeStart({
  alreadyInProgress,
  existingSessionId,
}: {
  alreadyInProgress: boolean;
  existingSessionId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function start() {
    if (alreadyInProgress && existingSessionId) {
      router.push(`/play/solo/${existingSessionId}`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/solo/daily", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Couldn't start today's challenge.");
      }
      const data = (await res.json()) as {
        sessionId: string;
        alreadyStarted: boolean;
      };
      router.push(`/play/solo/${data.sessionId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start today's challenge.");
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      onClick={start}
      disabled={busy}
      className="w-full bg-[var(--stage-accent)] text-slate-950 hover:bg-[var(--stage-accent)]/90 sm:w-auto"
    >
      {busy
        ? "Loading…"
        : alreadyInProgress
          ? "Resume today's challenge"
          : "Start today's challenge"}
    </Button>
  );
}
