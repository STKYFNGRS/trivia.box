import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  accounts,
  players,
  sessions,
  soloSessions,
  venueProfiles,
} from "@/lib/db/schema";
import { getLeaderboardTop } from "@/lib/game/scoring";

/**
 * Data access for public, shareable post-game recap pages (`/r/...`).
 *
 * The live-session endpoint (`app/api/game/public/session/route.ts`) is
 * keyed by join code and also serves in-progress data; for shareable
 * recap cards we want:
 *   - lookup by session id (the canonical URL param),
 *   - only completed sessions visible,
 *   - no leak of unanswered question content.
 *
 * Guest solo runs expose their recap intentionally — the owner is
 * sharing their own link. We only surface aggregate numbers + the
 * owner's display name; the per-question answer log stays private
 * (authenticated recap API only).
 */

export type PublicSessionRecap = {
  kind: "session";
  sessionId: string;
  status: "completed";
  venueName: string;
  venueSlug: string | null;
  venueDisplayName: string;
  houseGame: boolean;
  theme: string | null;
  totalPlayers: number;
  eventStartsAt: Date;
  estimatedEndAt: Date | null;
  top: Array<{ playerId: string; username: string; score: number }>;
};

export type PublicSoloRecap = {
  kind: "solo";
  soloSessionId: string;
  status: "completed" | "abandoned";
  ownerUsername: string | null;
  speed: string;
  questionCount: number;
  correctCount: number;
  accuracyPercent: number;
  totalScore: number;
  timerSeconds: number;
  completedAt: Date | null;
  dailyChallengeDate: string | null;
};

/**
 * Load a completed multiplayer session for public display. Returns
 * null for unknown ids or sessions that aren't `completed` yet —
 * we do not expose live scoreboards via the share route to avoid
 * being used as a scraping shortcut.
 */
export async function loadPublicSessionRecap(
  sessionId: string
): Promise<PublicSessionRecap | null> {
  const rows = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      venueAccountId: sessions.venueAccountId,
      eventStartsAt: sessions.eventStartsAt,
      estimatedEndAt: sessions.estimatedEndAt,
      houseGame: sessions.houseGame,
      theme: sessions.theme,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const session = rows[0];
  if (!session || session.status !== "completed") return null;

  const [venueRow] = await db
    .select({ name: accounts.name })
    .from(accounts)
    .where(eq(accounts.id, session.venueAccountId))
    .limit(1);
  const [profileRow] = await db
    .select({
      slug: venueProfiles.slug,
      displayName: venueProfiles.displayName,
    })
    .from(venueProfiles)
    .where(eq(venueProfiles.accountId, session.venueAccountId))
    .limit(1);

  let leaderboard: Array<{ playerId: string; username: string; score: number }> = [];
  try {
    leaderboard = await getLeaderboardTop(session.id, 50);
  } catch {
    leaderboard = [];
  }

  return {
    kind: "session",
    sessionId: session.id,
    status: "completed",
    venueName: venueRow?.name ?? "Venue",
    venueSlug: profileRow?.slug ?? null,
    venueDisplayName: profileRow?.displayName ?? venueRow?.name ?? "Venue",
    houseGame: session.houseGame,
    theme: session.theme ?? null,
    totalPlayers: leaderboard.length,
    eventStartsAt: session.eventStartsAt,
    estimatedEndAt: session.estimatedEndAt ?? null,
    top: leaderboard.slice(0, 10),
  };
}

/**
 * Load a solo recap for public display. We intentionally don't
 * expose the question/answer breakdown — that remains owner-only
 * at `/play/solo/[id]/recap`. Active runs (`status === 'active'`)
 * also return null so an abandoned / in-flight link can't be used
 * to snoop live scores before the owner finishes.
 */
export async function loadPublicSoloRecap(
  soloSessionId: string
): Promise<PublicSoloRecap | null> {
  const rows = await db
    .select({
      id: soloSessions.id,
      status: soloSessions.status,
      speed: soloSessions.speed,
      questionCount: soloSessions.questionCount,
      correctCount: soloSessions.correctCount,
      totalScore: soloSessions.totalScore,
      timerSeconds: soloSessions.timerSeconds,
      completedAt: soloSessions.completedAt,
      playerId: soloSessions.playerId,
      dailyChallengeDate: soloSessions.dailyChallengeDate,
    })
    .from(soloSessions)
    .where(eq(soloSessions.id, soloSessionId))
    .limit(1);
  const session = rows[0];
  if (!session) return null;
  if (session.status !== "completed" && session.status !== "abandoned") {
    return null;
  }

  let ownerUsername: string | null = null;
  if (session.playerId) {
    const [playerRow] = await db
      .select({ username: players.username })
      .from(players)
      .where(eq(players.id, session.playerId))
      .limit(1);
    ownerUsername = playerRow?.username ?? null;
  }

  const accuracy =
    session.questionCount > 0
      ? Math.round((session.correctCount / session.questionCount) * 100)
      : 0;

  return {
    kind: "solo",
    soloSessionId: session.id,
    status: session.status as "completed" | "abandoned",
    ownerUsername,
    speed: session.speed,
    questionCount: session.questionCount,
    correctCount: session.correctCount,
    accuracyPercent: accuracy,
    totalScore: session.totalScore,
    timerSeconds: session.timerSeconds,
    completedAt: session.completedAt,
    dailyChallengeDate: session.dailyChallengeDate ?? null,
  };
}
