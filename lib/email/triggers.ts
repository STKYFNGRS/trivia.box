import { and, countDistinct, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  accounts,
  answers,
  playerAchievementGrants,
  achievementDefinitions,
  playerSessions,
  playerStats,
  playerVenues,
  playerXpEvents,
  players,
  prizeClaims,
  sessions,
} from "@/lib/db/schema";
import { sendMail, isEmailConfigured } from "@/lib/email/client";
import {
  ensureEmailPreferences,
  getEmailPreferences,
  isEmailKindAllowed,
} from "@/lib/email/preferences";
import { resolveSiteUrl } from "@/lib/email/siteUrl";
import {
  renderPrizeWonEmail,
  renderUpcomingSessionEmail,
  renderWeeklyDigestEmail,
} from "@/lib/email/templates";
import { unsubscribeUrlFor } from "@/lib/email/unsubscribe";
import { getNextHouseGame } from "@/lib/game/houseGames";

function rankLabel(rank: number): string {
  if (rank === 1) return "1st place";
  if (rank === 2) return "2nd place";
  if (rank === 3) return "3rd place";
  return `#${rank}`;
}

/**
 * Fire-and-forget notification for a freshly-materialized prize claim.
 * Looks up the winner's email via their account and respects preferences +
 * the per-account `unsubscribed_all_at` override. Idempotent per claim id.
 *
 * Callers do NOT need to check `isEmailConfigured` — `sendMail` skips when
 * the provider isn't set up and still writes the ledger row.
 */
export async function notifyPrizeWon(claimId: string): Promise<void> {
  const [row] = await db
    .select({
      claimId: prizeClaims.id,
      sessionId: prizeClaims.sessionId,
      playerId: prizeClaims.playerId,
      finalRank: prizeClaims.finalRank,
      prizeLabel: prizeClaims.prizeLabel,
      claimCode: prizeClaims.claimCode,
      expiresAt: prizeClaims.expiresAt,
      venueName: accounts.name,
      playerAccountId: players.accountId,
      playerEmail: players.email,
      username: players.username,
    })
    .from(prizeClaims)
    .innerJoin(accounts, eq(accounts.id, prizeClaims.venueAccountId))
    .innerJoin(players, eq(players.id, prizeClaims.playerId))
    .where(eq(prizeClaims.id, claimId))
    .limit(1);
  if (!row) return;
  if (!row.playerAccountId) return; // guests never registered a mailbox.

  const [accountRow] = await db
    .select({ email: accounts.email })
    .from(accounts)
    .where(eq(accounts.id, row.playerAccountId))
    .limit(1);
  const toEmail =
    (row.playerEmail && row.playerEmail.trim()) ||
    (accountRow?.email && accountRow.email.trim()) ||
    "";
  if (!toEmail || toEmail.endsWith("@users.clerk.trivia.box")) return;

  const prefs = await getEmailPreferences(row.playerAccountId);
  if (!isEmailKindAllowed(prefs, "prize_won")) return;

  const siteUrl = resolveSiteUrl();
  const unsubscribeUrl = unsubscribeUrlFor({
    accountId: row.playerAccountId,
    scope: "all",
    siteUrl,
  });
  const manageUrl = `${siteUrl}/dashboard/player/notifications`;
  const claimUrl = `${siteUrl}/dashboard/player`;

  const { subject, html, text } = renderPrizeWonEmail({
    username: row.username,
    venueName: row.venueName,
    rankLabel: rankLabel(row.finalRank),
    prizeLabel: row.prizeLabel,
    claimCode: row.claimCode,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    claimUrl,
    siteUrl,
    unsubscribeUrl,
    manageUrl,
  });

  await sendMail({
    accountId: row.playerAccountId,
    toEmail,
    subject,
    html,
    text,
    kind: "prize_won",
    dedupeKey: row.claimId,
    unsubscribeUrl,
  });

  // Best-effort push ping alongside the email. Silently no-ops when the
  // user has no subscriptions or VAPID isn't configured.
  try {
    const { sendPushToAccount } = await import("@/lib/push/send");
    await sendPushToAccount(row.playerAccountId, {
      title: "You won a Trivia.Box prize!",
      body: `${rankLabel(row.finalRank)} at ${row.venueName} — tap to grab your code.`,
      url: "/dashboard/player",
      tag: `prize:${row.claimId}`,
    });
  } catch (err) {
    console.warn("[notifyPrizeWon] push delivery failed", err);
  }
}

/**
 * Start-of-week boundary (Monday 00:00 UTC) strictly before `now`. Used as
 * the de-facto start of the weekly-digest window.
 */
function weekStartMondayUtc(now: Date): Date {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const day = d.getUTCDay(); // 0 Sun..6 Sat
  const offsetToMonday = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - offsetToMonday);
  return d;
}

function isoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type WeeklyDigestSummary = {
  /** Number of emails we actually queued for send (excluding duplicates). */
  queued: number;
  /** Number of candidate players evaluated. */
  considered: number;
  /** Per-kind breakdown of skip reasons. */
  skipped: Record<string, number>;
};

/**
 * Weekly digest of each opted-in player's past seven days, for the window
 * ending at the Monday-00:00 UTC boundary strictly before `now`.
 *
 * Send criteria (all must hold):
 *   - Player has an account + a real email (not the synthesized
 *     `@users.clerk.trivia.box` placeholder).
 *   - Email preferences allow `weekly_digest` (and account isn't
 *     globally unsubscribed).
 *   - Player had *any* activity in the target week (answer, XP event, or
 *     achievement grant). Empty weeks are dropped to keep the inbox
 *     signal-to-noise high.
 *
 * Idempotent per `weekly:<playerId>:<weekStartIso>`.
 */
export async function sendWeeklyDigestBatch(
  now: Date = new Date(),
  opts: { max?: number } = {}
): Promise<WeeklyDigestSummary> {
  const thisWeekStart = weekStartMondayUtc(now);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
  const weekEnd = thisWeekStart;
  const weekKey = isoDateOnly(lastWeekStart);
  const weekLabel = `${lastWeekStart.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })} – ${new Date(weekEnd.getTime() - 24 * 60 * 60 * 1000).toLocaleDateString(
    undefined,
    { month: "short", day: "numeric", timeZone: "UTC" }
  )}`;
  const siteUrl = resolveSiteUrl();
  const limit = Math.max(1, Math.min(opts.max ?? 200, 500));

  const summary: WeeklyDigestSummary = {
    queued: 0,
    considered: 0,
    skipped: {
      no_email: 0,
      opt_out: 0,
      no_activity: 0,
      duplicate: 0,
      no_provider: 0,
      failed: 0,
    },
  };

  // Candidate set: players with any activity in the window. The join on
  // accounts filters out anon guest rows and gives us the email + account id.
  const candidates = await db
    .select({
      playerId: players.id,
      username: players.username,
      accountId: players.accountId,
      accountEmail: accounts.email,
    })
    .from(players)
    .innerJoin(accounts, eq(accounts.id, players.accountId))
    .where(
      sql`${players.id} IN (
        SELECT DISTINCT ${answers.playerId} FROM ${answers}
          WHERE ${answers.createdAt} >= ${lastWeekStart}
            AND ${answers.createdAt} < ${weekEnd}
        UNION
        SELECT DISTINCT ${playerXpEvents.playerId} FROM ${playerXpEvents}
          WHERE ${playerXpEvents.createdAt} >= ${lastWeekStart}
            AND ${playerXpEvents.createdAt} < ${weekEnd}
      )`
    )
    .limit(limit);

  for (const cand of candidates) {
    summary.considered += 1;
    if (!cand.accountId) continue;
    const email = cand.accountEmail?.trim();
    if (!email || email.endsWith("@users.clerk.trivia.box")) {
      summary.skipped.no_email += 1;
      continue;
    }
    const prefs = await getEmailPreferences(cand.accountId);
    if (!isEmailKindAllowed(prefs, "weekly_digest")) {
      summary.skipped.opt_out += 1;
      continue;
    }

    // Activity rollup: games played (distinct sessionQuestions grouped by
    // session), correct answers, points awarded, XP gained, new achievements.
    const [answerAgg] = await db
      .select({
        totalAnswered: sql<number>`COUNT(${answers.id})::int`,
        correct: sql<number>`COUNT(${answers.id}) FILTER (WHERE ${answers.isCorrect})::int`,
        points: sql<number>`COALESCE(SUM(${answers.pointsAwarded}), 0)::int`,
      })
      .from(answers)
      .where(
        and(
          eq(answers.playerId, cand.playerId),
          gte(answers.createdAt, lastWeekStart),
          lt(answers.createdAt, weekEnd)
        )
      );

    const [gamesAgg] = await db
      .select({
        games: countDistinct(playerSessions.sessionId).as("games"),
      })
      .from(playerSessions)
      .innerJoin(sessions, eq(sessions.id, playerSessions.sessionId))
      .where(
        and(
          eq(playerSessions.playerId, cand.playerId),
          gte(sessions.eventStartsAt, lastWeekStart),
          lt(sessions.eventStartsAt, weekEnd)
        )
      );

    const [xpAgg] = await db
      .select({
        xp: sql<number>`COALESCE(SUM(${playerXpEvents.amount}), 0)::int`,
      })
      .from(playerXpEvents)
      .where(
        and(
          eq(playerXpEvents.playerId, cand.playerId),
          gte(playerXpEvents.createdAt, lastWeekStart),
          lt(playerXpEvents.createdAt, weekEnd)
        )
      );

    const newAchievements = await db
      .select({
        title: achievementDefinitions.title,
        description: achievementDefinitions.description,
      })
      .from(playerAchievementGrants)
      .innerJoin(
        achievementDefinitions,
        eq(achievementDefinitions.id, playerAchievementGrants.achievementId)
      )
      .where(
        and(
          eq(playerAchievementGrants.playerId, cand.playerId),
          gte(playerAchievementGrants.earnedAt, lastWeekStart),
          lt(playerAchievementGrants.earnedAt, weekEnd)
        )
      )
      .orderBy(desc(playerAchievementGrants.earnedAt))
      .limit(8);

    const totalCorrect = answerAgg?.correct ?? 0;
    const totalPoints = answerAgg?.points ?? 0;
    const games = Number(gamesAgg?.games ?? 0);
    const xp = xpAgg?.xp ?? 0;

    if (games === 0 && totalCorrect === 0 && xp === 0 && newAchievements.length === 0) {
      summary.skipped.no_activity += 1;
      continue;
    }

    const [statsRow] = await db
      .select({
        dailyStreak: playerStats.dailyStreak,
        longestStreak: playerStats.longestStreak,
      })
      .from(playerStats)
      .where(eq(playerStats.playerId, cand.playerId))
      .limit(1);

    const nextHouse = await getNextHouseGame(now).catch(() => null);

    const unsubscribeUrl = unsubscribeUrlFor({
      accountId: cand.accountId,
      scope: "weekly_digest",
      siteUrl,
    });
    const manageUrl = `${siteUrl}/dashboard/player/notifications`;
    const dailyUrl = `${siteUrl}/play/daily`;

    const rendered = renderWeeklyDigestEmail({
      username: cand.username,
      weekLabel,
      totals: {
        games,
        correct: totalCorrect,
        points: totalPoints,
        xpGained: xp,
        dailyStreak: statsRow?.dailyStreak ?? 0,
        longestStreak: statsRow?.longestStreak ?? 0,
      },
      newAchievements: newAchievements.map((a) => ({
        title: a.title,
        description: a.description,
      })),
      nextHouseGameAt: nextHouse ? nextHouse.eventStartsAt.toISOString() : null,
      dailyUrl,
      siteUrl,
      unsubscribeUrl,
      manageUrl,
    });

    const result = await sendMail({
      accountId: cand.accountId,
      toEmail: email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      kind: "weekly_digest",
      dedupeKey: `${cand.playerId}:${weekKey}`,
      unsubscribeUrl,
    });
    if (result.status === "sent") summary.queued += 1;
    else if (result.status === "skipped_duplicate") summary.skipped.duplicate += 1;
    else if (result.status === "skipped_no_provider")
      summary.skipped.no_provider += 1;
    else if (result.status === "failed") summary.skipped.failed += 1;
  }

  // Fast-path informational: still run even when unconfigured so the
  // ledger tells ops which players *would* have been emailed.
  void isEmailConfigured;
  return summary;
}

/**
 * "We're hosting trivia this week" reminder. Walks every hosted session
 * with `eventStartsAt` in the next 24h and emails players who have visited
 * that venue in the past — capped at `max` per run to keep a single cron
 * tick bounded. Idempotent per `upcoming:<sessionId>:<playerId>`.
 */
export async function sendUpcomingSessionBatch(
  now: Date = new Date(),
  opts: { max?: number; lookaheadHours?: number } = {}
): Promise<WeeklyDigestSummary> {
  const lookaheadH = opts.lookaheadHours ?? 24;
  const horizon = new Date(now.getTime() + lookaheadH * 60 * 60 * 1000);
  const siteUrl = resolveSiteUrl();
  const limitPerRun = Math.max(1, Math.min(opts.max ?? 100, 500));

  const summary: WeeklyDigestSummary = {
    queued: 0,
    considered: 0,
    skipped: {
      no_email: 0,
      opt_out: 0,
      duplicate: 0,
      no_provider: 0,
      failed: 0,
    },
  };

  const upcoming = await db
    .select({
      sessionId: sessions.id,
      joinCode: sessions.joinCode,
      eventStartsAt: sessions.eventStartsAt,
      theme: sessions.theme,
      hasPrize: sessions.hasPrize,
      prizeDescription: sessions.prizeDescription,
      venueAccountId: sessions.venueAccountId,
      venueName: accounts.name,
    })
    .from(sessions)
    .innerJoin(accounts, eq(accounts.id, sessions.venueAccountId))
    .where(
      and(
        eq(sessions.status, "pending"),
        eq(sessions.houseGame, false),
        eq(sessions.listedPublic, true),
        gte(sessions.eventStartsAt, now),
        lte(sessions.eventStartsAt, horizon)
      )
    )
    .orderBy(sessions.eventStartsAt);

  let emailedTotal = 0;
  for (const sess of upcoming) {
    if (emailedTotal >= limitPerRun) break;

    const recipients = await db
      .select({
        playerId: players.id,
        username: players.username,
        accountId: players.accountId,
        email: accounts.email,
      })
      .from(playerVenues)
      .innerJoin(players, eq(players.id, playerVenues.playerId))
      .innerJoin(accounts, eq(accounts.id, players.accountId))
      .where(eq(playerVenues.venueAccountId, sess.venueAccountId))
      .limit(limitPerRun - emailedTotal);

    for (const r of recipients) {
      summary.considered += 1;
      if (!r.accountId) continue;
      const email = r.email?.trim();
      if (!email || email.endsWith("@users.clerk.trivia.box")) {
        summary.skipped.no_email += 1;
        continue;
      }
      const prefs = await getEmailPreferences(r.accountId);
      if (!isEmailKindAllowed(prefs, "upcoming_sessions")) {
        summary.skipped.opt_out += 1;
        continue;
      }

      const unsubscribeUrl = unsubscribeUrlFor({
        accountId: r.accountId,
        scope: "upcoming_sessions",
        siteUrl,
      });
      const manageUrl = `${siteUrl}/dashboard/player/notifications`;
      const joinUrl = `${siteUrl}/join?code=${encodeURIComponent(sess.joinCode)}`;

      const rendered = renderUpcomingSessionEmail({
        username: r.username,
        venueName: sess.venueName,
        startsAtIso: sess.eventStartsAt.toISOString(),
        theme: sess.theme,
        hasPrize: sess.hasPrize,
        prizeDescription: sess.prizeDescription,
        joinUrl,
        siteUrl,
        unsubscribeUrl,
        manageUrl,
      });

      const result = await sendMail({
        accountId: r.accountId,
        toEmail: email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        kind: "upcoming_sessions",
        dedupeKey: `${sess.sessionId}:${r.playerId}`,
        unsubscribeUrl,
      });
      if (result.status === "sent") summary.queued += 1;
      else if (result.status === "skipped_duplicate")
        summary.skipped.duplicate += 1;
      else if (result.status === "skipped_no_provider")
        summary.skipped.no_provider += 1;
      else if (result.status === "failed") summary.skipped.failed += 1;
      emailedTotal += 1;
      if (emailedTotal >= limitPerRun) break;
    }
  }

  return summary;
}

/**
 * Helper for the notifications UI — lazy-upsert the row and return the
 * current set of flags in display order.
 */
export async function readOrInitEmailPreferences(accountId: string) {
  void inArray; // keep import shape stable for future multi-account reads.
  return ensureEmailPreferences(accountId);
}
