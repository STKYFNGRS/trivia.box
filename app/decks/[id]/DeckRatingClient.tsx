"use client";

import { Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * 5-star rating widget for a public deck. Debounced: first click optimistically
 * updates, then POSTs to the rating endpoint. Rollback + toast on failure.
 */
export function DeckRatingClient({
  deckId,
  initialScore,
}: {
  deckId: string;
  initialScore: number | null;
}) {
  const [score, setScore] = useState<number | null>(initialScore);
  const [hover, setHover] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function setTo(n: number) {
    const prev = score;
    setScore(n);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/decks/${deckId}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: n }),
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error as string | undefined;
        throw new Error(msg || "Could not save rating");
      }
      toast.success(`Rated ${n}/5`);
    } catch (e) {
      setScore(prev);
      toast.error(e instanceof Error ? e.message : "Could not save rating");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3, 4, 5].map((n) => {
        const target = hover ?? score ?? 0;
        const filled = n <= target;
        return (
          <button
            key={n}
            type="button"
            disabled={submitting}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(null)}
            onClick={() => void setTo(n)}
            className={cn(
              "rounded-md p-1 transition",
              "hover:bg-white/10",
              submitting && "opacity-50"
            )}
            aria-label={`Rate ${n} out of 5`}
          >
            <Star
              className={cn(
                "size-6 transition",
                filled ? "fill-amber-300 text-amber-300" : "text-white/30"
              )}
            />
          </button>
        );
      })}
      <span className="ml-2 text-xs text-white/60">
        {score != null ? `Your rating: ${score}/5` : "Click to rate"}
      </span>
    </div>
  );
}
