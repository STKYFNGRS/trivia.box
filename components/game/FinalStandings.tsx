"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Home, Medal, Trophy, UserCircle2 } from "lucide-react";
import { NextHouseGameChip } from "@/components/game/NextHouseGameChip";
import { ShareRecapButton } from "@/components/share/ShareRecapButton";
import { FollowVenueButton } from "@/components/venue/FollowVenueButton";
import { cn } from "@/lib/utils";

export type FinalStandingsEntry = {
  playerId: string;
  username: string;
  score: number;
};

type FinalStandingsVariant = "phone" | "host" | "big-screen";

type FinalStandingsProps = {
  leaderboard: FinalStandingsEntry[];
  /**
   * Player id for the viewer; used to highlight "you" and compute the
   * rank-hero pill on the phone variant. `null` on host / big-screen.
   */
  viewerPlayerId?: string | null;
  /**
   * Controls which action buttons + typography scale are rendered. See
   * PROJECT_GUIDE.md §13 row 21 for the rationale.
   *
   * - `phone`      → compact hero + top-10, "find another game" CTA
   * - `host`       → medium hero + top-10, "Back to dashboard" CTA
   * - `big-screen` → oversized typography, no CTAs (room display)
   */
  variant?: FinalStandingsVariant;
  /**
   * Phone/host only — optional link target for the "View profile"
   * secondary action. When omitted the button is hidden.
   */
  profileHref?: string | null;
  /**
   * Absolute URL to the public session recap (/r/session/[id]).
   * When provided the phone/host variants render a Share chip that
   * drops into the system share sheet (clipboard fallback). Omit
   * for the big-screen variant — room displays have no input.
   */
  shareUrl?: string | null;
  /**
   * Optional display name used by the share sheet (e.g. venue or
   * theme). Defaults to a generic Trivia.Box recap title.
   */
  shareTitle?: string | null;
  /**
   * Venue identity for the contextual "Follow this venue" CTA on the
   * phone variant. When both are provided we render a follow toggle
   * right beneath the top-N table — see `FollowVenueButton` for the
   * auth/state semantics. Omit to hide.
   */
  venueSlug?: string | null;
  venueDisplayName?: string | null;
  /**
   * When `true` (default on the phone variant) we render the "Next
   * house game in Xm" chip — great on the player phone to keep them
   * rolling into the next house round. Forced `false` on big-screen.
   */
  showNextHouseGame?: boolean;
  className?: string;
};

const PLACE_TONE: Record<1 | 2 | 3, string> = {
  1: "bg-amber-400/20 ring-amber-300/60 text-amber-200",
  2: "bg-slate-400/20 ring-slate-300/60 text-slate-100",
  3: "bg-orange-500/20 ring-orange-300/60 text-orange-200",
};

/**
 * Shared end-of-game summary rendered on the player phone, host
 * control surface, and the big-screen display. Keeps the three
 * surfaces in lockstep — a change to the hero or leaderboard markup
 * only has to happen here.
 *
 * Data source: the `leaderboard` array from
 * `GET /api/game/public/session` when `status === 'completed'`
 * (top-50 rows). See `app/api/game/public/session/route.ts`.
 */
export function FinalStandings({
  leaderboard,
  viewerPlayerId = null,
  variant = "phone",
  profileHref = null,
  shareUrl = null,
  shareTitle = null,
  venueSlug = null,
  venueDisplayName = null,
  showNextHouseGame,
  className,
}: FinalStandingsProps) {
  const top = leaderboard.slice(0, variant === "big-screen" ? 10 : 10);
  const viewerEntry = viewerPlayerId
    ? leaderboard.find((e) => e.playerId === viewerPlayerId) ?? null
    : null;
  const viewerRank = viewerEntry
    ? leaderboard.findIndex((e) => e.playerId === viewerPlayerId) + 1
    : null;

  const isBig = variant === "big-screen";
  const isPhone = variant === "phone";
  const showHouseChip = !isBig && (showNextHouseGame ?? isPhone);

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-6",
        isBig ? "items-center text-center" : "items-stretch",
        className
      )}
    >
      {/* Hero: trophy + "you finished #X" pill (phone) or generic title
         (host / big-screen). */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={cn(
          "flex flex-col items-center gap-3 py-2",
          isBig ? "py-6" : null
        )}
      >
        <motion.div
          initial={{ scale: 0.8, rotate: -8 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 12 }}
          className={cn(
            "flex items-center justify-center rounded-full bg-[var(--stage-accent)]/15 ring-1 ring-[var(--stage-accent)]/30",
            isBig ? "h-28 w-28" : "h-16 w-16"
          )}
        >
          <Trophy
            className={cn(
              "text-[var(--stage-accent)]",
              isBig ? "h-14 w-14" : "h-8 w-8"
            )}
            aria-hidden
          />
        </motion.div>
        <div
          className={cn(
            "font-semibold uppercase tracking-[0.3em] text-white/60",
            isBig ? "text-base" : "text-[11px]"
          )}
        >
          {isBig ? "Final Standings" : "Game Complete"}
        </div>
        {isPhone && viewerEntry && viewerRank ? (
          <div className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 ring-1 ring-white/15">
            <Medal className="h-4 w-4 text-[var(--stage-accent)]" aria-hidden />
            <span className="text-sm text-white">
              You finished{" "}
              <span className="font-semibold text-white">
                #{viewerRank}
                {leaderboard.length > 0 ? ` of ${leaderboard.length}` : ""}
              </span>{" "}
              <span className="text-white/60">
                · {viewerEntry.score.toLocaleString()} pts
              </span>
            </span>
          </div>
        ) : null}
        {isBig ? (
          <p
            className={cn(
              "max-w-3xl text-white/80",
              isBig ? "text-3xl" : "text-lg"
            )}
          >
            Thanks for playing — see you next round.
          </p>
        ) : !viewerEntry ? (
          <p className="max-w-md text-sm text-white/70">Thanks for playing!</p>
        ) : null}
      </motion.div>

      {/* Top-N rail. Highlights the viewer's row on phone. */}
      {top.length > 0 ? (
        <div
          className={cn(
            "overflow-hidden rounded-2xl bg-[var(--stage-glass)] ring-1 ring-white/10 shadow-[var(--shadow-card)] backdrop-blur-xl",
            isBig ? "w-full max-w-3xl" : null
          )}
        >
          <ol className="divide-y divide-white/5">
            {top.map((entry, idx) => {
              const rank = idx + 1;
              const podium = rank <= 3 ? PLACE_TONE[rank as 1 | 2 | 3] : null;
              const isYou =
                viewerPlayerId && entry.playerId === viewerPlayerId;
              return (
                <li
                  key={entry.playerId}
                  className={cn(
                    "flex items-center gap-3",
                    isBig ? "px-6 py-4 text-2xl" : "px-4 py-3 text-sm",
                    isYou && "bg-[var(--stage-accent)]/10"
                  )}
                >
                  <span
                    className={cn(
                      "flex shrink-0 items-center justify-center rounded-full font-mono font-semibold tabular-nums ring-1",
                      podium ??
                        "bg-white/5 ring-white/15 text-white/70",
                      isBig ? "h-10 w-10 text-xl" : "h-7 w-7 text-xs"
                    )}
                  >
                    {rank}
                  </span>
                  <span
                    className={cn(
                      "flex-1 truncate font-semibold text-white",
                      isBig ? "text-2xl" : "text-sm"
                    )}
                  >
                    {entry.username}
                    {isYou ? (
                      <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/80">
                        You
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-mono tabular-nums text-white",
                      isBig ? "text-2xl" : "text-sm"
                    )}
                  >
                    {entry.score.toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ol>
          {leaderboard.length > top.length ? (
            <div
              className={cn(
                "border-t border-white/5 px-4 py-2 text-center text-white/50",
                isBig ? "text-base" : "text-[11px]"
              )}
            >
              +{leaderboard.length - top.length} more
            </div>
          ) : null}
        </div>
      ) : (
        <div
          className={cn(
            "rounded-2xl bg-[var(--stage-glass)] p-6 text-center text-white/60 ring-1 ring-white/10 backdrop-blur-xl",
            isBig ? "text-2xl" : "text-sm"
          )}
        >
          No scores were recorded for this game.
        </div>
      )}

      {/* Contextual nudges — only on the player phone / host variant.
         The `NextHouseGameChip` self-hides when no house game is
         scheduled, so we can always mount it. */}
      {!isBig ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {showHouseChip ? <NextHouseGameChip /> : null}
          {venueSlug && venueDisplayName && isPhone ? (
            <FollowVenueButton
              venueSlug={venueSlug}
              venueDisplayName={venueDisplayName}
              size="sm"
            />
          ) : null}
        </div>
      ) : null}

      {/* Actions — hidden on big-screen (room display has no user input). */}
      {!isBig ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {variant === "host" ? (
            <Link
              href="/dashboard/games"
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/15"
            >
              <Home className="h-4 w-4" aria-hidden />
              Back to dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/play"
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--stage-accent)] px-4 py-2 text-sm font-semibold text-black ring-1 ring-[var(--stage-accent)]/50 transition hover:brightness-110"
              >
                Find another game
              </Link>
              {profileHref ? (
                <Link
                  href={profileHref}
                  className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/15"
                >
                  <UserCircle2 className="h-4 w-4" aria-hidden />
                  View profile
                </Link>
              ) : null}
            </>
          )}
          {shareUrl ? (
            <ShareRecapButton
              url={shareUrl}
              title={shareTitle ?? "Trivia.Box recap"}
              text={
                viewerEntry && viewerRank
                  ? `I finished #${viewerRank} with ${viewerEntry.score.toLocaleString()} pts.`
                  : "Check out the final standings on Trivia.Box."
              }
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
