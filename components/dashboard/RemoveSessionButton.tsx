"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Props = {
  sessionId: string;
  joinCode: string;
};

/**
 * "Remove" action on a past game card at `/dashboard/games`.
 *
 * Soft-hides the row via `DELETE /api/game/sessions/[sessionId]` (the
 * endpoint only accepts completed/cancelled/draft sessions, so an in-
 * progress game can't be removed by accident). On success we refresh the
 * RSC tree — the row falls out of the query because it now has
 * `host_hidden_at IS NOT NULL`.
 */
export function RemoveSessionButton({ sessionId, joinCode }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const onClick = useCallback(async () => {
    const ok = window.confirm(
      `Remove session ${joinCode} from your dashboard? Player history is kept — this only hides it from your list.`
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
        toast.error(typeof data.error === "string" ? data.error : "Could not remove session");
        return;
      }
      toast.success("Removed from your dashboard");
      startTransition(() => {
        router.refresh();
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove session");
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
      aria-label={`Remove session ${joinCode}`}
      className="text-muted-foreground hover:text-destructive"
    >
      <Trash2 className="mr-1.5 size-3.5" aria-hidden />
      {busy ? "Removing…" : "Remove"}
    </Button>
  );
}
