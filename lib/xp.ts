import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  accounts,
  playerSessions,
  playerStats,
  playerXpEvents,
  players,
  questionDecks,
  questions,
  sessionQuestions,
} from "@/lib/db/schema";
import { normalizeDifficulty, type Difficulty } from "@/lib/game/scoring";

/**
 * Phase 4.1 XP / points system.
 *
 * XP is a lifetime currency that a player accrues from:
 *  - every correct answer (+1, hosted games) — awarded inline by
 *    `recordAnswer` via `awardCorrectAnswerXp`.
 *  - podium placements in a hosted session (+50 / +25 / +10) — awarded by
 *    `awardSessionEndXp` once the session transitions to `completed`.
 *  - creators get XP when their deck is played in any hosted session
 *    (+10 per deck played) — piggybacks on `awardSessionEndXp` so it runs
 *    exactly once per session.
 *  - solo runs write their own `solo_complete` events from `rollupSoloForPlayer`.
 *
 * The `player_xp_events` table is the append-only source of truth; the
 * `player_stats.totalXp` column is an atomic rollup. `awardXp` writes both
 * inside the same call — callers never need to remember to update the
 * rollup.
 *
 * Idempotency: `awardSessionEndXp` pre-checks for a `session_podium` event
 * on the same sessionId before awarding. `awardCorrectAnswerXp` relies on
 * the `(player, sessionQuestion)` unique insert in `recordAnswer` to guard
 * against duplicates.
 */

export const XP_PER_CORRECT_ANSWER = 1;
export const XP_PODIUM = [50, 25, 10] as const;
export const XP_CREATOR_PER_DECK_PLAY = 10;

/**
 * XP per correct answer, scaled by difficulty. Parallel shape to
 * `DIFFICULTY_POINT_WEIGHTS` in `lib/game/scoring.ts` — a hard correct is
 * worth 3× an easy correct, keeping XP aligned with the points economy.
 * Integer math so `totalXp` stays clean without rounding drift.
 *
 *   easy   → 1 XP
 *   medium → 2 XP
 *   hard   → 3 XP
 */
export const XP_PER_CORRECT_BY_DIFFICULTY: Record<Difficulty, number> = {
  1: 1,
  2: 2,
  3: 3,
};

export function xpPerCorrectForDifficulty(
  raw: number | null | undefined
): number {
  return XP_PER_CORRECT_BY_DIFFICULTY[normalizeDifficulty(raw)];
}

export type AwardXpKind =
  | "correct_answer"
  | "session_podium"
  | "solo_complete"
  | "creator_deck_played";

type AwardContext = {
  sessionId?: string | null;
  soloSessionId?: string | null;
  note?: string | null;
};

/**
 * Core write: append an XP event + atomically bump the player's lifetime
 * rollup. Writes are skipped when `amount <= 0`.
 */
export async function awardXp(
  playerId: string,
  kind: AwardXpKind,
  amount: number,
  ctx: AwardContext = {}
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;

  await db.insert(playerXpEvents).values({
    playerId,
    kind,
    amount,
    sessionId: ctx.sessionId ?? null,
    soloSessionId: ctx.soloSessionId ?? null,
    note: ctx.note ?? null,
  });

  await db
    .update(playerStats)
    .set({
      totalXp: sql`${playerStats.totalXp} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(eq(playerStats.playerId, playerId));
}

/**
 * Called by `recordAnswer` after a correct answer has been newly inserted
 * (so duplicates are impossible). XP is scaled to difficulty so a hard
 * correct pays 3× an easy correct — same curve the points system uses.
 * Wrapped in a try/catch by the caller to avoid breaking gameplay if the
 * XP write fails.
 *
 * `difficulty` is optional for backwards compat; unknown values fall back
 * to the medium weight via `xpPerCorrectForDifficulty`.
 */
export async function awardCorrectAnswerXp(input: {
  playerId: string;
  sessionId: string;
  questionId: string;
  difficulty?: number | null;
}): Promise<void> {
  const amount = xpPerCorrectForDifficulty(input.difficulty);
  await awardXp(input.playerId, "correct_answer", amount, {
    sessionId: input.sessionId,
    note: `Correct answer · d${normalizeDifficulty(input.difficulty)} · ${input.questionId}`,
  });
}

/**
 * Called by hosted-session completion (both `startNextQuestion` and
 * `advanceOrComplete`). Idempotent: if we've already written any
 * `session_podium` events for this sessionId, the function returns
 * without doing more work.
 *
 * Awards:
 *  - Podium XP to top-3 players by rank (score > 0).
 *  - Creator XP (+10 / deck) to the owners of every public deck whose
 *    questions appeared in the session.
 */
export async function awardSessionEndXp(sessionId: string): Promise<{
  podiumAwards: Array<{ playerId: string; rank: number; amount: number }>;
  creatorAwards: Array<{ accountId: string; amount: number; deckId: string }>;
}> {
  const already = await db
    .select({ id: playerXpEvents.id })
    .from(playerXpEvents)
    .where(
      and(
        eq(playerXpEvents.sessionId, sessionId),
        eq(playerXpEvents.kind, "session_podium")
      )
    )
    .limit(1);
  if (already.length > 0) {
    return { podiumAwards: [], creatorAwards: [] };
  }

  // Podium XP — only ranks 1..3 with score > 0 qualify, so a session that
  // was abandoned without any points doesn't burn podium XP.
  const topRows = await db
    .select({
      playerId: playerSessions.playerId,
      rank: playerSessions.rank,
      score: playerSessions.score,
    })
    .from(playerSessions)
    .where(eq(playerSessions.sessionId, sessionId))
    .orderBy(playerSessions.rank);

  const podiumAwards: Array<{ playerId: string; rank: number; amount: number }> = [];
  for (const row of topRows) {
    if (row.rank == null || row.rank < 1 || row.rank > 3) continue;
    if (row.score <= 0) continue;
    const amount = XP_PODIUM[row.rank - 1];
    if (amount == null) continue;
    try {
      await awardXp(row.playerId, "session_podium", amount, {
        sessionId,
        note: `Podium rank ${row.rank}`,
      });
      podiumAwards.push({ playerId: row.playerId, rank: row.rank, amount });
    } catch (err) {
      console.error("awardSessionEndXp podium failure", row.playerId, err);
    }
  }

  // Creator XP — find every public deck whose questions ran in this
  // session and reward the owning player (if the creator has a linked
  // player profile).
  const deckRows = await db
    .selectDistinct({ deckId: questions.deckId })
    .from(sessionQuestions)
    .innerJoin(questions, eq(questions.id, sessionQuestions.questionId))
    .where(eq(sessionQuestions.sessionId, sessionId));
  const deckIds = deckRows
    .map((r) => r.deckId)
    .filter((id): id is string => !!id);

  const creatorAwards: Array<{ accountId: string; amount: number; deckId: string }> = [];
  if (deckIds.length > 0) {
    const ownerRows = await db
      .select({
        deckId: questionDecks.id,
        ownerAccountId: questionDecks.ownerAccountId,
        visibility: questionDecks.visibility,
        deckName: questionDecks.name,
      })
      .from(questionDecks)
      .where(
        and(
          inArray(questionDecks.id, deckIds),
          eq(questionDecks.visibility, "public")
        )
      );

    const accountIds = Array.from(new Set(ownerRows.map((r) => r.ownerAccountId)));
    const playerRows = accountIds.length
      ? await db
          .select({ accountId: accounts.id, playerId: players.id })
          .from(accounts)
          .innerJoin(players, eq(players.accountId, accounts.id))
          .where(inArray(accounts.id, accountIds))
      : [];
    const acctToPlayer = new Map(playerRows.map((r) => [r.accountId, r.playerId]));

    for (const deck of ownerRows) {
      const creatorPlayerId = acctToPlayer.get(deck.ownerAccountId);
      if (!creatorPlayerId) continue;
      try {
        await awardXp(
          creatorPlayerId,
          "creator_deck_played",
          XP_CREATOR_PER_DECK_PLAY,
          {
            sessionId,
            note: `Deck played: ${deck.deckName}`,
          }
        );
        creatorAwards.push({
          accountId: deck.ownerAccountId,
          amount: XP_CREATOR_PER_DECK_PLAY,
          deckId: deck.deckId,
        });
      } catch (err) {
        console.error(
          "awardSessionEndXp creator failure",
          deck.ownerAccountId,
          err
        );
      }
    }
  }

  return { podiumAwards, creatorAwards };
}

/**
 * XP-derived "level" + progress toward the next level. Level is
 * floor(sqrt(totalXp / 25)) + 1 — keeps the first few levels fast (level
 * 2 at 25 xp, level 5 at 400 xp) but slows naturally for whales without
 * a config table. Pure function so UI can call it client-side too.
 */
export function xpToLevel(xp: number): {
  level: number;
  current: number;
  needed: number;
  progress: number; // 0..1
} {
  const clamped = Math.max(0, Math.floor(xp));
  const level = Math.floor(Math.sqrt(clamped / 25)) + 1;
  const levelStart = 25 * (level - 1) * (level - 1);
  const levelEnd = 25 * level * level;
  const current = clamped - levelStart;
  const needed = levelEnd - levelStart;
  return {
    level,
    current,
    needed,
    progress: needed > 0 ? Math.min(1, current / needed) : 0,
  };
}
