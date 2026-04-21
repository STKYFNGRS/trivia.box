import { auth } from "@clerk/nextjs/server";
import { Flame, Sparkles, Target } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import {
  DAILY_CHALLENGE_QUESTION_COUNT,
  DAILY_CHALLENGE_TIMER_SECONDS,
  ensureTodayDailyChallenge,
  getDailyStreak,
  getPlayerDailyAttempt,
  toUtcDateString,
} from "@/lib/game/dailyChallenge";
import { getPlayerByAccountId } from "@/lib/players";
import { cn } from "@/lib/utils";
import { DailyChallengeStart } from "./DailyChallengeStart";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Daily challenge",
  description: `A new free ${DAILY_CHALLENGE_QUESTION_COUNT}-question trivia sprint every day. Same questions for every player — come back tomorrow to keep your streak alive.`,
};

function formatLongDate(dateKey: string): string {
  const d = new Date(dateKey + "T00:00:00Z");
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(d);
  } catch {
    return dateKey;
  }
}

export default async function DailyChallengePage() {
  // Seed today's row the first time anyone visits — guarantees the page
  // always has a challenge to show even if the cron missed a tick.
  const now = new Date();
  const challenge = await ensureTodayDailyChallenge(now);
  const todayKey = toUtcDateString(now);

  const { userId } = await auth();
  let playerId: string | null = null;
  if (userId) {
    const account = await getAccountByClerkUserId(userId);
    if (account) {
      const player = await getPlayerByAccountId(account.id);
      if (player) playerId = player.id;
    }
  }

  const [attempt, streak] = await Promise.all([
    playerId ? getPlayerDailyAttempt(playerId, todayKey) : Promise.resolve(null),
    playerId
      ? getDailyStreak(playerId, now)
      : Promise.resolve({
          current: 0,
          longest: 0,
          playedToday: false,
          lastPlayDate: null,
        }),
  ]);

  // If a signed-in player already completed today's run, skip the start
  // screen entirely and take them to the recap.
  if (attempt && attempt.status === "completed") {
    redirect(`/play/solo/${attempt.soloSessionId}/recap`);
  }

  const alreadyInProgress = attempt?.status === "active";

  return (
    <div className="min-h-screen bg-[var(--stage-bg)] text-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
        <SectionHeader
          eyebrow="Daily"
          title="Today's challenge"
          description={`${DAILY_CHALLENGE_QUESTION_COUNT} questions · ${DAILY_CHALLENGE_TIMER_SECONDS}s each · same five questions for every player, worldwide.`}
        />

        <Card className="border-white/10 bg-white/[0.04] text-white shadow-[var(--shadow-card)] backdrop-blur">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">
                  {formatLongDate(challenge.challengeDate)}
                </CardTitle>
                <CardDescription className="text-white/70">
                  Answer fast, stack streak bonuses, come back tomorrow.
                </CardDescription>
              </div>
              {streak.current > 0 ? (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-sm font-semibold text-amber-300"
                  title="Your daily challenge streak"
                >
                  <Flame className="size-4" aria-hidden />
                  {streak.current} day{streak.current === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="grid gap-3 text-sm sm:grid-cols-2">
              <li className="flex items-start gap-2 text-white/80">
                <Target className="mt-0.5 size-4 text-[var(--stage-accent)]" aria-hidden />
                <span>
                  Mix of {DAILY_CHALLENGE_QUESTION_COUNT} questions spanning easy,
                  medium, and hard.
                </span>
              </li>
              <li className="flex items-start gap-2 text-white/80">
                <Sparkles className="mt-0.5 size-4 text-[var(--neon-magenta)]" aria-hidden />
                <span>
                  XP bonus grows with your streak — up to 50 XP/day for keeping
                  it going.
                </span>
              </li>
            </ul>

            <DailyChallengeStart
              alreadyInProgress={alreadyInProgress}
              existingSessionId={alreadyInProgress ? attempt?.soloSessionId ?? null : null}
            />

            {!playerId ? (
              <p className="text-xs text-white/60">
                Playing as a guest — your run counts for today, but{" "}
                <Link href="/sign-up" className="underline">
                  create a free account
                </Link>{" "}
                to build a daily streak and climb the leaderboard.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {streak.longest > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/60">
            <div>
              Longest daily streak:{" "}
              <span className="font-semibold text-white">{streak.longest}</span>
            </div>
            <Link
              href="/dashboard/player"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "text-white/70 hover:bg-white/10 hover:text-white",
              )}
            >
              View profile
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
