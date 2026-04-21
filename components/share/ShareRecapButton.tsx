"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Size = "sm" | "md";

type ShareRecapButtonProps = {
  /**
   * URL to the public recap page. Accepts either an absolute URL or
   * a root-relative path (e.g. `/r/session/<id>`) — the button
   * resolves relative paths against `window.location.origin` at
   * click time so client callers don't have to probe `window`
   * during render.
   */
  url: string;
  /** Short title used by the system share sheet. */
  title?: string;
  /** One-line summary the share sheet shows under the URL. */
  text?: string;
  /**
   * Visual size. `sm` blends in next to other rail CTAs; `md` is used on
   * the solo recap where the share chip is a first-class action.
   */
  size?: Size;
  /** Extra classes applied to the outer button. */
  className?: string;
};

/**
 * "Share this run" chip. Uses the Web Share API when available
 * (mobile browsers + Safari + recent Chrome desktop) and falls back
 * to clipboard copy everywhere else. The `url` must already be
 * absolute — callers resolve it server-side so SSR + share sheets
 * see the same canonical origin.
 *
 * We intentionally keep this component dumb so it can be dropped
 * into both `FinalStandings` (multiplayer) and `SoloRecapClient`
 * without branching on surface.
 */
export function ShareRecapButton({
  url,
  title = "Trivia.Box recap",
  text,
  size = "sm",
  className,
}: ShareRecapButtonProps) {
  const [copied, setCopied] = useState(false);

  const onShare = useCallback(async () => {
    // Resolve relative URLs against the current origin so the share
    // sheet / clipboard always gets a fully-qualified link.
    let absolute = url;
    if (typeof window !== "undefined" && url.startsWith("/")) {
      absolute = `${window.location.origin}${url}`;
    }
    // Prefer the native share sheet when the browser supports it. We
    // have to feature-detect *and* call inside the click handler — some
    // browsers (Safari) throw `NotAllowedError` when navigator.share
    // isn't invoked from a user gesture.
    const shareData: ShareData = { title, text, url: absolute };
    const canNativeShare =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      // `canShare` is optional; when present, honor it (desktop Chrome
      // returns false for text+url combos in some locales).
      (typeof navigator.canShare !== "function" ||
        navigator.canShare(shareData));

    if (canNativeShare) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        // User cancelled: bail silently. Everything else falls through
        // to clipboard so "share" is never a dead button.
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      toast.success("Link copied — paste it anywhere.");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy the link. Long-press the URL instead.");
    }
  }, [url, title, text]);

  const Icon = copied ? Check : size === "md" ? Share2 : Copy;

  return (
    <button
      type="button"
      onClick={onShare}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg bg-white/10 font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]",
        size === "md" ? "px-4 py-2 text-sm" : "px-3 py-2 text-sm",
        className
      )}
      aria-label="Share this recap"
    >
      <Icon className="h-4 w-4" aria-hidden />
      {copied ? "Copied" : "Share"}
    </button>
  );
}
