"use client";

import Link from "next/link";
import { Check, Loader2, UserMinus, X } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Friend = {
  playerId: string;
  username: string | null;
  totalPoints: number;
  friendsSince: string;
};

type Pending = {
  requestId: string;
  playerId: string;
  username: string | null;
  createdAt: string;
  direction: "incoming" | "outgoing";
};

type Props = {
  initialFriends: Friend[];
  initialPending: Pending[];
};

export function FriendsListClient({ initialFriends, initialPending }: Props) {
  const [friends, setFriends] = useState<Friend[]>(initialFriends);
  const [pending, setPending] = useState<Pending[]>(initialPending);
  const [busy, setBusy] = useState<string | null>(null);

  const mutate = useCallback(
    async (
      targetPlayerId: string,
      method: "POST" | "PATCH" | "DELETE",
      successMessage: string
    ) => {
      setBusy(targetPlayerId);
      try {
        const res = await fetch(`/api/friends/${targetPlayerId}`, {
          method,
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error ?? "Request failed");
        }
        toast.success(successMessage);
        // Server is source of truth — re-fetch to avoid drift.
        const listRes = await fetch("/api/me/friends", { cache: "no-store" });
        if (listRes.ok) {
          const data = (await listRes.json()) as {
            friends?: Friend[];
            pending?: Pending[];
          };
          if (data.friends) setFriends(data.friends);
          if (data.pending) setPending(data.pending);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setBusy(null);
      }
    },
    []
  );

  const incoming = pending.filter((p) => p.direction === "incoming");
  const outgoing = pending.filter((p) => p.direction === "outgoing");

  return (
    <div className="flex flex-col gap-8">
      {incoming.length > 0 ? (
        <section className="flex flex-col gap-3">
          <header className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              Pending invites
            </h2>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-white/60">
              {incoming.length}
            </span>
          </header>
          <ul className="flex flex-col gap-2">
            {incoming.map((p) => {
              const label = p.username ?? "Trivia player";
              const pending = busy === p.playerId;
              return (
                <li
                  key={p.requestId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-3"
                >
                  <Link
                    href={
                      p.username ? `/u/${encodeURIComponent(p.username)}` : "#"
                    }
                    className="truncate text-sm font-semibold hover:underline"
                  >
                    {label}
                  </Link>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        mutate(p.playerId, "PATCH", `You and ${label} are now friends`)
                      }
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-200 transition",
                        pending ? "opacity-60" : "hover:bg-emerald-500/20"
                      )}
                    >
                      {pending ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Check className="size-3.5" aria-hidden />
                      )}
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        mutate(p.playerId, "DELETE", `Declined ${label}`)
                      }
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-white/80 transition",
                        pending ? "opacity-60" : "hover:bg-white/[0.08]"
                      )}
                    >
                      <X className="size-3.5" aria-hidden />
                      Decline
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {outgoing.length > 0 ? (
        <section className="flex flex-col gap-3">
          <header className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Sent invites</h2>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-white/60">
              {outgoing.length}
            </span>
          </header>
          <ul className="flex flex-col gap-2">
            {outgoing.map((p) => {
              const label = p.username ?? "Trivia player";
              const pending = busy === p.playerId;
              return (
                <li
                  key={p.requestId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-3"
                >
                  <Link
                    href={
                      p.username ? `/u/${encodeURIComponent(p.username)}` : "#"
                    }
                    className="truncate text-sm font-semibold hover:underline"
                  >
                    {label}
                  </Link>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      mutate(p.playerId, "DELETE", `Cancelled invite to ${label}`)
                    }
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-white/80 transition",
                      pending ? "opacity-60" : "hover:bg-white/[0.08]"
                    )}
                  >
                    {pending ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <X className="size-3.5" aria-hidden />
                    )}
                    Cancel
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <header className="flex items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">
            Your friends
          </h2>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-white/60">
            {friends.length}
          </span>
        </header>
        {friends.length === 0 ? (
          <p className="text-muted-foreground max-w-xl rounded-lg border border-dashed border-white/10 p-6 text-sm">
            No friends yet. Visit any <code>/u/&lt;username&gt;</code> profile
            and tap <em>Add friend</em> to send an invite.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {friends.map((f) => {
              const label = f.username ?? "Trivia player";
              const pending = busy === f.playerId;
              return (
                <li
                  key={f.playerId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-3"
                >
                  <div className="flex min-w-0 flex-col">
                    <Link
                      href={
                        f.username
                          ? `/u/${encodeURIComponent(f.username)}`
                          : "#"
                      }
                      className="truncate text-sm font-semibold hover:underline"
                    >
                      {label}
                    </Link>
                    <span className="text-muted-foreground truncate text-xs">
                      {f.totalPoints.toLocaleString()} lifetime pts
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      mutate(
                        f.playerId,
                        "DELETE",
                        `Unfriended ${label}`
                      )
                    }
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-white/80 transition",
                      pending ? "opacity-60" : "hover:bg-white/[0.08]"
                    )}
                    title={`Unfriend ${label}`}
                  >
                    {pending ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <UserMinus className="size-3.5" aria-hidden />
                    )}
                    Unfriend
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

