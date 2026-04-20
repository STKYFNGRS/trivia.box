"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Props = {
  sessionId: string;
  variant?: "default" | "secondary" | "outline";
  size?: "default" | "sm";
};

/**
 * Hits POST /api/game/sessions/[id]/launch and pushes the host to the
 * running-game page. Surfaces VENUE_BUSY (409) and scheduling-window
 * errors (400) as friendly toasts.
 */
export function LaunchNowButton({ sessionId, variant = "default", size = "sm" }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const onClick = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/game/sessions/${sessionId}/launch?force=1`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        joinCode?: string;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        if (data.code === "VENUE_BUSY") {
          toast.error(
            data.error ??
              "This venue already has an active game. Finish it before starting a new one."
          );
          return;
        }
        toast.error(typeof data.error === "string" ? data.error : "Launch failed");
        return;
      }
      if (data.joinCode) {
        toast.success(`Launched: ${data.joinCode}`);
        startTransition(() => {
          router.push(
            `/game/${data.joinCode}/host?sessionId=${encodeURIComponent(sessionId)}`
          );
          router.refresh();
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Launch failed");
    } finally {
      setBusy(false);
    }
  }, [router, sessionId]);

  return (
    <Button type="button" variant={variant} size={size} disabled={busy} onClick={onClick}>
      {busy ? "Launching…" : "Launch now"}
    </Button>
  );
}
