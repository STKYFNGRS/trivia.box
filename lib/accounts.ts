import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { ensurePlayerRowForAccount } from "@/lib/players";
import { isSiteAdminClerkUserId } from "@/lib/siteAdmin";

export type AccountRow = typeof accounts.$inferSelect;

export async function getAccountByClerkUserId(clerkUserId: string) {
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.clerkUserId, clerkUserId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getCurrentAccount(): Promise<AccountRow | null> {
  const user = await currentUser();
  if (!user) return null;
  return getAccountByClerkUserId(user.id);
}

type UnsafeMeta = {
  account_type?: string;
  name?: string;
  city?: string;
  player_username?: string;
};

/**
 * Derives the starting account type for a brand-new Clerk user.
 * Site-admin allowlist beats everything; otherwise we default to `player`.
 * Organizer (host) accounts are created only by a successful Stripe upgrade,
 * not at signup time. Exported for unit testing.
 */
export function deriveAccountTypeForNewUser(
  clerkUserId: string,
  meta: UnsafeMeta
): "player" | "site_admin" {
  if (isSiteAdminClerkUserId(clerkUserId)) return "site_admin";
  // Anything else (including the legacy "host"/"venue" metadata values) becomes a player.
  // The Stripe webhook promotes to "host" after a successful subscription.
  void meta;
  return "player";
}

export async function ensureAccountFromClerkUser(): Promise<AccountRow | null> {
  const user = await currentUser();
  if (!user) return null;

  const existing = await getAccountByClerkUserId(user.id);
  if (existing) {
    if (isSiteAdminClerkUserId(user.id) && existing.accountType !== "site_admin") {
      const [upgraded] = await db
        .update(accounts)
        .set({ accountType: "site_admin" })
        .where(eq(accounts.id, existing.id))
        .returning();
      if (upgraded) {
        await ensurePlayerRowForAccount(upgraded, upgraded.name);
        return upgraded;
      }
    }
    return existing;
  }

  const email =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    "";

  const meta = (user.unsafeMetadata ?? {}) as UnsafeMeta;
  const accountType = deriveAccountTypeForNewUser(user.id, meta);

  const name =
    (typeof meta.name === "string" && meta.name.trim()) ||
    user.firstName ||
    user.username ||
    "Member";
  const city = (typeof meta.city === "string" && meta.city.trim()) || "Unknown";

  const [created] = await db
    .insert(accounts)
    .values({
      clerkUserId: user.id,
      accountType,
      name,
      email: email || `${user.id}@users.clerk.trivia.box`,
      city,
    })
    .returning();

  if (!created) {
    throw new Error("Failed to create account");
  }

  // Every account gets a `players` row so stats + upgrades-to-host carry over.
  const preferred =
    (typeof meta.player_username === "string" && meta.player_username.trim()) || name;
  await ensurePlayerRowForAccount(created, preferred);

  return created;
}
