"use client";

import { Check, Loader2, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  venueSlug: string;
  venueDisplayName: string;
  /**
   * Visual density — the post-game surfaces want a compact pill; the
   * venue hero can stretch to the default button size.
   */
  size?: "sm" | "md";
};

/**
 * "Follow this venue" toggle.
 *
 * Fetches current state on mount (`GET /api/venues/<slug>/follow`) and
 * POST/DELETEs on click. If the viewer isn't signed in the endpoint
 * returns 401 and we toast a prompt — we intentionally *don't* hide
 * the button for anon viewers because the CTA is a strong sign-up nudge
 * on the post-game screen.
 */
export function FollowVenueButton({
  venueSlug,
  venueDisplayName,
  size = "md",
}: Props) {
  const [following, setFollowing] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/venues/${encodeURIComponent(venueSlug)}/follow`,
          { cache: "no-store" }
        );
        if (res.status === 401) {
          if (active) setFollowing(false); // show "Follow" CTA for anon.
          return;
        }
        if (!res.ok) throw new Error("status check failed");
        const data = (await res.json()) as { following: boolean };
        if (active) setFollowing(data.following);
      } catch {
        if (active) {
          setFollowing(false);
          setLoadError(true);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [venueSlug]);

  async function toggle() {
    if (pending) return;
    const prev = following;
    const nextState = !following;
    setPending(true);
    setFollowing(nextState);
    try {
      const res = await fetch(
        `/api/venues/${encodeURIComponent(venueSlug)}/follow`,
        {
          method: nextState ? "POST" : "DELETE",
        }
      );
      if (res.status === 401) {
        setFollowing(prev);
        toast.message("Sign in to follow venues", {
          description: `${venueDisplayName} will remember you next game.`,
        });
        return;
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(err.error ?? "Couldn't update follow");
      }
      const data = (await res.json()) as { following: boolean };
      setFollowing(data.following);
      toast.success(
        data.following
          ? `Following ${venueDisplayName}`
          : `Unfollowed ${venueDisplayName}`
      );
    } catch (e) {
      setFollowing(prev);
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  if (following === null && !loadError) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-2 rounded-lg bg-white/5 px-4 py-2 text-sm text-white/40 ring-1 ring-white/10",
          size === "sm" && "px-3 py-1.5 text-xs"
        )}
        aria-busy
      >
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Follow
      </span>
    );
  }

  const active = Boolean(following);

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ring-1",
        size === "sm" && "px-3 py-1.5 text-xs",
        active
          ? "bg-[var(--stage-accent)]/20 text-[var(--stage-accent)] ring-[var(--stage-accent)]/40 hover:bg-[var(--stage-accent)]/30"
          : "bg-white/10 text-white ring-white/20 hover:bg-white/15",
        pending && "opacity-70"
      )}
      aria-pressed={active}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : active ? (
        <Check className="size-4" aria-hidden />
      ) : (
        <UserPlus className="size-4" aria-hidden />
      )}
      {active ? "Following" : "Follow"}
    </button>
  );
}
