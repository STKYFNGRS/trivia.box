"use client";

import { Copy, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Duplicate this deck into my library" — lets anyone signed in clone a
 * public deck as a private starting point for their own remix. Anonymous
 * visitors are sent to sign-in so the clone is attributed.
 */
export function DuplicateDeckButton({
  deckId,
  size = "sm",
}: {
  deckId: string;
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/dashboard/decks/${deckId}/duplicate`, {
        method: "POST",
      });
      if (res.status === 401) {
        window.location.href = "/sign-in";
        return;
      }
      const data = (await res.json()) as {
        deck?: { id: string };
        copiedQuestions?: number;
        error?: unknown;
      };
      if (!res.ok || !data.deck) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Duplicate failed"
        );
      }
      toast.success(
        `Added to your decks · ${data.copiedQuestions ?? 0} questions copied`
      );
      router.push(`/dashboard/decks/${data.deck.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Duplicate failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        buttonVariants({ variant: "secondary", size }),
        "gap-1.5"
      )}
      title="Clone into your deck library"
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Copy className="size-4" aria-hidden />
      )}
      Duplicate
    </button>
  );
}
