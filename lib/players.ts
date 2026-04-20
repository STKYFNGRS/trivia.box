import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { players } from "@/lib/db/schema";
import type { AccountRow } from "@/lib/accounts";

export type PlayerRow = typeof players.$inferSelect;

export async function getPlayerByAccountId(accountId: string): Promise<PlayerRow | null> {
  const rows = await db.select().from(players).where(eq(players.accountId, accountId)).limit(1);
  return rows[0] ?? null;
}

function sanitizeUsername(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 20);
  return s.length >= 2 ? s : `player_${raw.slice(0, 8).replace(/[^a-z0-9]/gi, "") || "me"}`;
}

async function uniqueUsername(base: string): Promise<string> {
  let candidate = base.slice(0, 24);
  for (let i = 0; i < 20; i++) {
    const existing = await db.select({ id: players.id }).from(players).where(eq(players.username, candidate)).limit(1);
    if (existing.length === 0) return candidate;
    const suffix = String(i + 1);
    candidate = `${base.slice(0, Math.max(2, 24 - suffix.length - 1))}_${suffix}`;
  }
  throw new Error("Could not allocate username");
}

/** Creates the `players` row for a Clerk-linked player account (idempotent). */
export async function ensurePlayerRowForAccount(account: AccountRow, preferredUsername: string): Promise<PlayerRow> {
  const existing = await getPlayerByAccountId(account.id);
  if (existing) return existing;

  const base = sanitizeUsername(preferredUsername || account.name || "player");
  const username = await uniqueUsername(base);

  const [row] = await db
    .insert(players)
    .values({
      username,
      accountId: account.id,
      email: account.email,
    })
    .returning();

  if (!row) {
    throw new Error("Failed to create player profile");
  }
  return row;
}
