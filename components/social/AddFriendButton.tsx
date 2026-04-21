"use client";

import { Check, Loader2, UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Status = "none" | "pending_in" | "pending_out" | "friends" | "self";

type Props = {
  targetPlayerId: string;
  targetLabel: string;
  /** Kept optional so solo-only signed-out visitors don't hammer the API. */
  disabled?: boolean;
};

/**
 * Fetches the viewer ↔ target friendship state on mount and exposes a single
 * contextual CTA (Add / Accept / Cancel / Unfriend). Anonymous visitors get
 * a softer "Sign in to add friends" prompt instead of a 401 toast so the
 * button is still discoverable.
 */
export function AddFriendButton({ targetPlayerId, targetLabel, disabled }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [anon, setAnon] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/friends/${targetPlayerId}`, {
          signal: ac.signal,
          cache: "no-store",
        });
        if (res.status === 401) {
          setAnon(true);
          setStatus("none");
          return;
        }
        if (res.status === 400) {
          setStatus("self");
          return;
        }
        if (!res.ok) {
          setStatus("none");
          return;
        }
        const data = (await res.json()) as { status?: Status };
        setStatus((data.status ?? "none") as Status);
      } catch {
        // Network issue — leave button hidden rather than flashing an error.
        setStatus("none");
      }
    })();
    return () => ac.abort();
  }, [targetPlayerId]);

  const mutate = useCallback(
    async (method: "POST" | "PATCH" | "DELETE", successMessage: string) => {
      if (pending) return;
      if (anon) {
        window.location.href = "/sign-in";
        return;
      }
      setPending(true);
      try {
        const res = await fetch(`/api/friends/${targetPlayerId}`, {
          method,
          headers: { "Content-Type": "application/json" },
        });
        if (res.status === 401) {
          setAnon(true);
          window.location.href = "/sign-in";
          return;
        }
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error ?? "Request failed");
        }
        const data = (await res.json()) as { status?: Status };
        setStatus((data.status ?? "none") as Status);
        toast.success(successMessage);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setPending(false);
      }
    },
    [anon, pending, targetPlayerId]
  );

  // "self" or loading → render nothing so the profile CTA row stays tight.
  if (status === null || status === "self") {
    return null;
  }
  if (disabled) {
    return null;
  }

  const base =
    "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition";

  if (anon) {
    return (
      <Link
        href="/sign-in"
        className={cn(
          base,
          "border border-white/15 bg-white/[0.05] text-white/90 hover:bg-white/[0.08]"
        )}
        title="Sign in to add this player as a friend"
      >
        <UserPlus className="size-3.5" aria-hidden />
        Add friend
      </Link>
    );
  }

  if (status === "friends") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          mutate("DELETE", `Unfriended ${targetLabel}`)
        }
        aria-pressed
        className={cn(
          base,
          "border border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
        )}
        title={`Unfriend ${targetLabel}`}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <UserMinus className="size-3.5" aria-hidden />
        )}
        Friends
      </button>
    );
  }

  if (status === "pending_out") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          mutate("DELETE", `Cancelled invite to ${targetLabel}`)
        }
        className={cn(
          base,
          "border border-amber-400/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
        )}
        title="Cancel pending invite"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Check className="size-3.5" aria-hidden />
        )}
        Invited
      </button>
    );
  }

  if (status === "pending_in") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          mutate("PATCH", `You and ${targetLabel} are now friends`)
        }
        className={cn(
          base,
          "border border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
        )}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Check className="size-3.5" aria-hidden />
        )}
        Accept request
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => mutate("POST", `Invite sent to ${targetLabel}`)}
      className={cn(
        base,
        "border border-white/15 bg-white/[0.05] text-white/90 hover:bg-white/[0.08]"
      )}
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <UserPlus className="size-3.5" aria-hidden />
      )}
      Add friend
    </button>
  );
}
