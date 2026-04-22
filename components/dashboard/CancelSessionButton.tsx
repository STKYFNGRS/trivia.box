"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Props = {
  sessionId: string;
  joinCode: string;
};

/**
 * **Cancel** action on an upcoming game card at `/dashboard/games`.
 *
 * Hits `DELETE /api/game/sessions/[sessionId]`, which flips a `pending`
 * session to `cancelled` *and* soft-hides it so the dashboard drops the
 * card immediately. Active / paused games reply 409 — the API forces hosts
 * to end a live game through the host controls rather than killing it
 * from the dashboard — and the toast surfaces the reason.
 */
export function CancelSessionButton({ sessionId, joinCode }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const onClick = useCallback(async () => {
    const ok = window.confirm(
      `Cancel scheduled session ${joinCode}? It won't auto-launch and will be removed from your dashboard. Player history is kept.`
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/game/sessions/${sessionId}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Could not cancel session");
        return;
      }
      toast.success("Session cancelled");
      startTransition(() => {
        router.refresh();
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel session");
    } finally {
      setBusy(false);
    }
  }, [joinCode, router, sessionId]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={onClick}
      aria-label={`Cancel session ${joinCode}`}
      className="text-muted-foreground hover:text-destructive"
    >
      <XCircle className="mr-1.5 size-3.5" aria-hidden />
      {busy ? "Cancelling…" : "Cancel"}
    </Button>
  );
}
