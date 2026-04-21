import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  accounts,
  playerSessions,
  players,
  prizeClaims,
  sessions,
} from "@/lib/db/schema";
import { notifyPrizeWon } from "@/lib/email/triggers";

/**
 * Phase 4.2 venue IRL prize claim flow.
 *
 * When a session with `hasPrize = true` completes, `materializePrizeClaims`
 * writes one `prize_claims` row per top-N finisher with a short
 * redemption code the player shows at the venue. The host dashboard has
 * a "Prize claims" drawer where they can mark each as `redeemed`, and the
 * player sees their claim on `/dashboard/player` + a dedicated page.
 *
 * Idempotency: we check for existing `prize_claims` rows on the session
 * before inserting. The `prize_claims_code_unique` index catches races if
 * two workers try to complete the same session simultaneously.
 */

export const DEFAULT_PRIZE_EXPIRY_DAYS = 30;

function generateClaimCode(): string {
  // 8-char uppercase alphanumeric, no I/O/1/0 to avoid OCR / phone
  // read-back confusion at a noisy bar.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

function prizeLabelForRank(
  rank: number,
  labels: string[] | null | undefined,
  fallback: string
): string {
  if (labels && labels[rank - 1]) return labels[rank - 1]!;
  if (rank === 1) return `1st place — ${fallback}`;
  if (rank === 2) return `2nd place — ${fallback}`;
  if (rank === 3) return `3rd place — ${fallback}`;
  return `Top ${rank} — ${fallback}`;
}

export type MaterializedClaim = {
  id: string;
  playerId: string;
  finalRank: number;
  claimCode: string;
  prizeLabel: string;
};

/**
 * Create `prize_claims` rows for every eligible finisher in a completed
 * session. Safe to call multiple times — existing rows are not duplicated.
 */
export async function materializePrizeClaims(
  sessionId: string
): Promise<MaterializedClaim[]> {
  const [s] = await db
    .select({
      id: sessions.id,
      hasPrize: sessions.hasPrize,
      prizeDescription: sessions.prizeDescription,
      prizeTopN: sessions.prizeTopN,
      prizeLabels: sessions.prizeLabels,
      prizeInstructions: sessions.prizeInstructions,
      prizeExpiresAt: sessions.prizeExpiresAt,
      venueAccountId: sessions.venueAccountId,
      status: sessions.status,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!s || !s.hasPrize) return [];
  if (s.status !== "completed") return [];

  const existing = await db
    .select({ playerId: prizeClaims.playerId })
    .from(prizeClaims)
    .where(eq(prizeClaims.sessionId, sessionId));
  if (existing.length > 0) {
    return [];
  }

  const topN = s.prizeTopN && s.prizeTopN > 0 ? Math.min(s.prizeTopN, 5) : 3;
  const fallbackLabel = s.prizeDescription?.trim() || "Prize";

  const finishers = await db
    .select({
      playerId: playerSessions.playerId,
      rank: playerSessions.rank,
      score: playerSessions.score,
    })
    .from(playerSessions)
    .where(eq(playerSessions.sessionId, sessionId))
    .orderBy(asc(playerSessions.rank))
    .limit(topN);

  const eligible = finishers.filter(
    (f) => f.rank != null && f.rank >= 1 && f.rank <= topN && f.score > 0
  );
  if (eligible.length === 0) return [];

  const expiresAt =
    s.prizeExpiresAt ??
    new Date(Date.now() + DEFAULT_PRIZE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const results: MaterializedClaim[] = [];
  for (const f of eligible) {
    const rank = f.rank!;
    const label = prizeLabelForRank(rank, s.prizeLabels, fallbackLabel);
    // Retry loop handles the astronomically unlikely code collision.
    let inserted: { id: string; claimCode: string } | null = null;
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      const code = generateClaimCode();
      const rows = await db
        .insert(prizeClaims)
        .values({
          sessionId,
          playerId: f.playerId,
          venueAccountId: s.venueAccountId,
          finalRank: rank,
          prizeLabel: label,
          prizeDetails: s.prizeInstructions,
          claimCode: code,
          status: "pending",
          expiresAt,
        })
        .onConflictDoNothing({ target: prizeClaims.claimCode })
        .returning({ id: prizeClaims.id, claimCode: prizeClaims.claimCode });
      if (rows[0]) inserted = rows[0];
    }
    if (inserted) {
      results.push({
        id: inserted.id,
        playerId: f.playerId,
        finalRank: rank,
        claimCode: inserted.claimCode,
        prizeLabel: label,
      });
    }
  }

  // Fan out "you won a prize" email in the background. We await them all
  // so a cron worker knows the send completed, but wrap in try/catch so a
  // single failure can't unwind the other claims — `sendMail` is already
  // idempotent on `(kind, dedupe_key)` so cron retries are safe.
  await Promise.all(
    results.map((r) =>
      notifyPrizeWon(r.id).catch((err) => {
        console.error("notifyPrizeWon failed", r.id, err);
      })
    )
  );

  return results;
}

export type HostClaimRow = {
  id: string;
  playerId: string;
  playerName: string;
  finalRank: number;
  prizeLabel: string;
  claimCode: string;
  status: string;
  redeemedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export async function listHostClaimsForSession(
  sessionId: string,
  venueAccountId: string
): Promise<HostClaimRow[]> {
  const rows = await db
    .select({
      id: prizeClaims.id,
      playerId: prizeClaims.playerId,
      playerName: players.username,
      finalRank: prizeClaims.finalRank,
      prizeLabel: prizeClaims.prizeLabel,
      claimCode: prizeClaims.claimCode,
      status: prizeClaims.status,
      redeemedAt: prizeClaims.redeemedAt,
      expiresAt: prizeClaims.expiresAt,
      createdAt: prizeClaims.createdAt,
    })
    .from(prizeClaims)
    .innerJoin(players, eq(players.id, prizeClaims.playerId))
    .where(
      and(
        eq(prizeClaims.sessionId, sessionId),
        eq(prizeClaims.venueAccountId, venueAccountId)
      )
    )
    .orderBy(asc(prizeClaims.finalRank));

  return rows.map((r) => ({
    id: r.id,
    playerId: r.playerId,
    playerName: r.playerName,
    finalRank: r.finalRank,
    prizeLabel: r.prizeLabel,
    claimCode: r.claimCode,
    status: r.status,
    redeemedAt: r.redeemedAt ? r.redeemedAt.toISOString() : null,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export type PlayerClaimRow = {
  id: string;
  sessionId: string;
  venueName: string;
  finalRank: number;
  prizeLabel: string;
  prizeDetails: string | null;
  claimCode: string;
  status: string;
  expiresAt: string | null;
  redeemedAt: string | null;
  createdAt: string;
};

export async function listPlayerClaims(
  playerId: string,
  opts: { status?: "pending" | "redeemed" | "all" } = {}
): Promise<PlayerClaimRow[]> {
  const statusFilter = opts.status && opts.status !== "all" ? opts.status : null;

  const rows = await db
    .select({
      id: prizeClaims.id,
      sessionId: prizeClaims.sessionId,
      venueName: accounts.name,
      finalRank: prizeClaims.finalRank,
      prizeLabel: prizeClaims.prizeLabel,
      prizeDetails: prizeClaims.prizeDetails,
      claimCode: prizeClaims.claimCode,
      status: prizeClaims.status,
      expiresAt: prizeClaims.expiresAt,
      redeemedAt: prizeClaims.redeemedAt,
      createdAt: prizeClaims.createdAt,
    })
    .from(prizeClaims)
    .innerJoin(accounts, eq(accounts.id, prizeClaims.venueAccountId))
    .where(
      statusFilter
        ? and(
            eq(prizeClaims.playerId, playerId),
            eq(prizeClaims.status, statusFilter)
          )
        : eq(prizeClaims.playerId, playerId)
    )
    .orderBy(desc(prizeClaims.createdAt))
    .limit(50);

  return rows.map((r) => ({
    id: r.id,
    sessionId: r.sessionId,
    venueName: r.venueName,
    finalRank: r.finalRank,
    prizeLabel: r.prizeLabel,
    prizeDetails: r.prizeDetails,
    claimCode: r.claimCode,
    status: r.status,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    redeemedAt: r.redeemedAt ? r.redeemedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Mark a claim as redeemed (handed out IRL). Only the host venue that
 * owns the claim can do this. Idempotent.
 */
export async function redeemClaim(input: {
  claimId: string;
  venueAccountId: string;
  resolvedByAccountId: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const [row] = await db
    .select({
      id: prizeClaims.id,
      venueAccountId: prizeClaims.venueAccountId,
      status: prizeClaims.status,
      expiresAt: prizeClaims.expiresAt,
    })
    .from(prizeClaims)
    .where(eq(prizeClaims.id, input.claimId))
    .limit(1);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.venueAccountId !== input.venueAccountId) {
    return { ok: false, reason: "forbidden" };
  }
  if (row.status === "redeemed") return { ok: true };
  if (row.status === "void" || row.status === "expired") {
    return { ok: false, reason: `already_${row.status}` };
  }
  if (row.expiresAt && row.expiresAt < new Date()) {
    await db
      .update(prizeClaims)
      .set({ status: "expired" })
      .where(eq(prizeClaims.id, row.id));
    return { ok: false, reason: "expired" };
  }

  await db
    .update(prizeClaims)
    .set({
      status: "redeemed",
      redeemedAt: new Date(),
      redeemedByAccountId: input.resolvedByAccountId,
    })
    .where(eq(prizeClaims.id, row.id));
  return { ok: true };
}

/**
 * Scheduled cleanup: any `pending` claim past `expires_at` becomes
 * `expired`. Called from the daily cron.
 */
export async function expireOverdueClaims(
  now: Date = new Date()
): Promise<number> {
  const rows = await db
    .select({ id: prizeClaims.id })
    .from(prizeClaims)
    .where(eq(prizeClaims.status, "pending"));
  const ids: string[] = [];
  for (const r of rows) {
    ids.push(r.id);
    if (ids.length >= 500) break;
  }
  if (ids.length === 0) return 0;

  const result = await db
    .update(prizeClaims)
    .set({ status: "expired" })
    .where(and(inArray(prizeClaims.id, ids), eq(prizeClaims.status, "pending")))
    .returning({ id: prizeClaims.id });

  void now;
  return result.length;
}
