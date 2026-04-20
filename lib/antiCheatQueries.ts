import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "./db/client";
import {
  accounts,
  answers,
  playerSessions,
  players,
  sessionQuestions,
  sessions,
} from "./db/schema";

/**
 * Admin anti-cheat read/write helpers (Phase 4.3).
 *
 * The ranking UX intentionally highlights *sessions* (not individual answers)
 * - a moderator usually wants to see "which games had shenanigans" first,
 * then drill down into the suspicious answers inside that session.
 */

export type SuspiciousCluster = {
  sessionId: string;
  sessionCode: string;
  startedAt: string | null;
  venueName: string | null;
  /** The fingerprint being clustered on (ip, ua, or device). */
  fingerprintKind: "ip" | "ua" | "device";
  fingerprint: string;
  playerCount: number;
  answerCount: number;
  correctCount: number;
  totalPoints: number;
  lastAnswerAt: string | null;
};

/**
 * Surface (session × fingerprint) pairs that share the same hash across
 * multiple distinct players. Two players with the same ipHash in the same
 * session is not proof of cheating (shared wifi, family dining together),
 * but it's a signal worth surfacing.
 */
export async function listSuspiciousClusters(opts: {
  minPlayers?: number;
  limit?: number;
} = {}): Promise<SuspiciousCluster[]> {
  const minPlayers = opts.minPlayers ?? 2;
  const limit = opts.limit ?? 50;

  async function queryFor(
    column: typeof answers.ipHash | typeof answers.uaHash | typeof answers.deviceId,
    kind: SuspiciousCluster["fingerprintKind"]
  ): Promise<SuspiciousCluster[]> {
    const rows = await db
      .select({
        sessionId: sessionQuestions.sessionId,
        sessionCode: sessions.joinCode,
        startedAt: sessions.eventStartsAt,
        venueName: accounts.name,
        fingerprint: column,
        playerCount: sql<number>`COUNT(DISTINCT ${answers.playerId})`,
        answerCount: sql<number>`COUNT(${answers.id})`,
        correctCount: sql<number>`COUNT(*) FILTER (WHERE ${answers.isCorrect})`,
        totalPoints: sql<number>`COALESCE(SUM(${answers.pointsAwarded}), 0)`,
        lastAnswerAt: sql<string>`MAX(${answers.createdAt})`,
      })
      .from(answers)
      .innerJoin(sessionQuestions, eq(sessionQuestions.id, answers.sessionQuestionId))
      .innerJoin(sessions, eq(sessions.id, sessionQuestions.sessionId))
      .leftJoin(accounts, eq(accounts.id, sessions.venueAccountId))
      .where(and(isNotNull(column), isNull(answers.disqualifiedAt)))
      .groupBy(
        sessionQuestions.sessionId,
        sessions.joinCode,
        sessions.eventStartsAt,
        accounts.name,
        column
      )
      .having(sql`COUNT(DISTINCT ${answers.playerId}) >= ${minPlayers}`)
      .orderBy(desc(sql`COUNT(*) FILTER (WHERE ${answers.isCorrect})`))
      .limit(limit);

    return rows.map((r) => ({
      sessionId: r.sessionId,
      sessionCode: r.sessionCode ?? "",
      startedAt: r.startedAt ? (r.startedAt as Date).toISOString() : null,
      venueName: r.venueName ?? null,
      fingerprintKind: kind,
      fingerprint: (r.fingerprint as string) ?? "",
      playerCount: Number(r.playerCount ?? 0),
      answerCount: Number(r.answerCount ?? 0),
      correctCount: Number(r.correctCount ?? 0),
      totalPoints: Number(r.totalPoints ?? 0),
      lastAnswerAt: r.lastAnswerAt
        ? typeof r.lastAnswerAt === "string"
          ? r.lastAnswerAt
          : (r.lastAnswerAt as unknown as Date).toISOString()
        : null,
    }));
  }

  const [ipClusters, deviceClusters] = await Promise.all([
    queryFor(answers.ipHash, "ip"),
    queryFor(answers.deviceId, "device"),
  ]);

  // UA clusters are much noisier (every phone on the same browser version
  // shares a UA hash) so we omit them from the default list — an admin can
  // still inspect UA on the drill-down view.
  const merged = [...ipClusters, ...deviceClusters].sort(
    (a, b) => b.correctCount - a.correctCount
  );

  return merged.slice(0, limit);
}

export type SuspiciousAnswerRow = {
  answerId: string;
  playerId: string;
  username: string;
  sessionCode: string;
  sessionQuestionId: string;
  answerGiven: string;
  isCorrect: boolean;
  timeToAnswerMs: number;
  serverElapsedMs: number | null;
  pointsAwarded: number;
  ipHash: string | null;
  uaHash: string | null;
  deviceId: string | null;
  disqualifiedAt: string | null;
  createdAt: string;
};

/** All answers inside a session that match a given fingerprint, newest first. */
export async function listAnswersForCluster(input: {
  sessionId: string;
  fingerprintKind: "ip" | "ua" | "device";
  fingerprint: string;
}): Promise<SuspiciousAnswerRow[]> {
  const column =
    input.fingerprintKind === "ip"
      ? answers.ipHash
      : input.fingerprintKind === "ua"
        ? answers.uaHash
        : answers.deviceId;

  const rows = await db
    .select({
      answerId: answers.id,
      playerId: answers.playerId,
      username: players.username,
      sessionCode: sessions.joinCode,
      sessionQuestionId: answers.sessionQuestionId,
      answerGiven: answers.answerGiven,
      isCorrect: answers.isCorrect,
      timeToAnswerMs: answers.timeToAnswerMs,
      serverElapsedMs: answers.serverElapsedMs,
      pointsAwarded: answers.pointsAwarded,
      ipHash: answers.ipHash,
      uaHash: answers.uaHash,
      deviceId: answers.deviceId,
      disqualifiedAt: answers.disqualifiedAt,
      createdAt: answers.createdAt,
    })
    .from(answers)
    .innerJoin(sessionQuestions, eq(sessionQuestions.id, answers.sessionQuestionId))
    .innerJoin(sessions, eq(sessions.id, sessionQuestions.sessionId))
    .innerJoin(players, eq(players.id, answers.playerId))
    .where(
      and(eq(sessionQuestions.sessionId, input.sessionId), eq(column, input.fingerprint))
    )
    .orderBy(desc(answers.createdAt))
    .limit(500);

  return rows.map((r) => ({
    answerId: r.answerId,
    playerId: r.playerId,
    username: r.username ?? "",
    sessionCode: r.sessionCode ?? "",
    sessionQuestionId: r.sessionQuestionId,
    answerGiven: r.answerGiven ?? "",
    isCorrect: Boolean(r.isCorrect),
    timeToAnswerMs: Number(r.timeToAnswerMs ?? 0),
    serverElapsedMs:
      r.serverElapsedMs == null ? null : Number(r.serverElapsedMs),
    pointsAwarded: Number(r.pointsAwarded ?? 0),
    ipHash: r.ipHash ?? null,
    uaHash: r.uaHash ?? null,
    deviceId: r.deviceId ?? null,
    disqualifiedAt: r.disqualifiedAt
      ? (r.disqualifiedAt as unknown as Date).toISOString()
      : null,
    createdAt: (r.createdAt as unknown as Date).toISOString(),
  }));
}

/**
 * Recompute `playerSessions.score` for a session by summing non-disqualified
 * answer points, then refresh ranks. Called after any admin DQ/restore so
 * the live leaderboard reflects moderation actions.
 */
export async function recomputeSessionScoresAndRanks(sessionId: string) {
  // Sum non-disqualified points per (session, player)
  const sums = await db
    .select({
      playerId: answers.playerId,
      total: sql<number>`COALESCE(SUM(${answers.pointsAwarded}), 0)`,
    })
    .from(answers)
    .innerJoin(sessionQuestions, eq(sessionQuestions.id, answers.sessionQuestionId))
    .where(
      and(eq(sessionQuestions.sessionId, sessionId), isNull(answers.disqualifiedAt))
    )
    .groupBy(answers.playerId);

  const byPlayer = new Map<string, number>();
  for (const s of sums) byPlayer.set(s.playerId, Number(s.total ?? 0));

  const sessionRows = await db
    .select({ id: playerSessions.id, playerId: playerSessions.playerId })
    .from(playerSessions)
    .where(eq(playerSessions.sessionId, sessionId));

  for (const row of sessionRows) {
    const nextScore = byPlayer.get(row.playerId) ?? 0;
    await db
      .update(playerSessions)
      .set({ score: nextScore })
      .where(eq(playerSessions.id, row.id));
  }

  // Delegated: same tie-break as live scoring path.
  const { recomputeSessionRanks } = await import("./game/scoring");
  await recomputeSessionRanks(sessionId);
}

/**
 * Flip an answer's disqualified state. Pass `disqualified: true` to DQ and
 * `false` to restore. The session's scores + ranks are recomputed afterward.
 */
export async function setAnswerDisqualified(input: {
  answerId: string;
  disqualified: boolean;
}) {
  const rows = await db
    .select({ id: answers.id, sessionQuestionId: answers.sessionQuestionId })
    .from(answers)
    .where(eq(answers.id, input.answerId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("Answer not found");

  const sqRows = await db
    .select({ sessionId: sessionQuestions.sessionId })
    .from(sessionQuestions)
    .where(eq(sessionQuestions.id, row.sessionQuestionId))
    .limit(1);
  const sessionId = sqRows[0]?.sessionId;

  await db
    .update(answers)
    .set({ disqualifiedAt: input.disqualified ? new Date() : null })
    .where(eq(answers.id, input.answerId));

  if (sessionId) {
    await recomputeSessionScoresAndRanks(sessionId);
  }
}
