import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { emailPreferences } from "@/lib/db/schema";

type EmailPreferenceRow = typeof emailPreferences.$inferSelect;

export type EmailPreferences = {
  prizeWon: boolean;
  weeklyDigest: boolean;
  upcomingSessions: boolean;
  marketing: boolean;
  unsubscribedAllAt: string | null;
};

export const DEFAULT_EMAIL_PREFERENCES: EmailPreferences = {
  prizeWon: true,
  weeklyDigest: true,
  upcomingSessions: true,
  marketing: false,
  unsubscribedAllAt: null,
};

function toShape(row: EmailPreferenceRow | null | undefined): EmailPreferences {
  if (!row) return DEFAULT_EMAIL_PREFERENCES;
  return {
    prizeWon: row.prizeWon,
    weeklyDigest: row.weeklyDigest,
    upcomingSessions: row.upcomingSessions,
    marketing: row.marketing,
    unsubscribedAllAt: row.unsubscribedAllAt
      ? row.unsubscribedAllAt.toISOString()
      : null,
  };
}

/**
 * Read-only view of an account's preferences. Returns the defaults when no
 * row exists yet — no write, so this is cheap to call from email-send
 * guards.
 */
export async function getEmailPreferences(
  accountId: string
): Promise<EmailPreferences> {
  const [row] = await db
    .select()
    .from(emailPreferences)
    .where(eq(emailPreferences.accountId, accountId))
    .limit(1);
  return toShape(row ?? null);
}

/**
 * Ensure a row exists for the account and return the current preferences.
 * Called from the dashboard GET so subsequent PATCHes don't need an
 * INSERT-on-missing codepath.
 */
export async function ensureEmailPreferences(
  accountId: string
): Promise<EmailPreferences> {
  const [row] = await db
    .insert(emailPreferences)
    .values({ accountId })
    .onConflictDoNothing({ target: emailPreferences.accountId })
    .returning();
  if (row) return toShape(row);
  return getEmailPreferences(accountId);
}

export type EmailPreferencePatch = Partial<{
  prizeWon: boolean;
  weeklyDigest: boolean;
  upcomingSessions: boolean;
  marketing: boolean;
}>;

/**
 * Patch a subset of flags. Any successful patch also clears
 * `unsubscribed_all_at`, so a user who previously hit the one-click
 * "Unsubscribe from everything" link and then returns to toggle a flag
 * back on doesn't stay silenced by the sweeping override.
 */
export async function patchEmailPreferences(
  accountId: string,
  patch: EmailPreferencePatch
): Promise<EmailPreferences> {
  await ensureEmailPreferences(accountId);
  const set: Record<string, unknown> = {
    updatedAt: new Date(),
    unsubscribedAllAt: null,
  };
  if (typeof patch.prizeWon === "boolean") set.prizeWon = patch.prizeWon;
  if (typeof patch.weeklyDigest === "boolean") set.weeklyDigest = patch.weeklyDigest;
  if (typeof patch.upcomingSessions === "boolean")
    set.upcomingSessions = patch.upcomingSessions;
  if (typeof patch.marketing === "boolean") set.marketing = patch.marketing;

  const [row] = await db
    .update(emailPreferences)
    .set(set)
    .where(eq(emailPreferences.accountId, accountId))
    .returning();
  return toShape(row ?? null);
}

/**
 * Token-path unsubscribe. `scope: "all"` sets every flag to false *and*
 * stamps `unsubscribedAllAt` so any future opt-in must go through the
 * dashboard. `scope: "kind"` just flips the one flag.
 */
export async function applyUnsubscribe(
  accountId: string,
  scope:
    | "all"
    | "prize_won"
    | "weekly_digest"
    | "upcoming_sessions"
    | "marketing"
): Promise<EmailPreferences> {
  await ensureEmailPreferences(accountId);
  if (scope === "all") {
    const [row] = await db
      .update(emailPreferences)
      .set({
        prizeWon: false,
        weeklyDigest: false,
        upcomingSessions: false,
        marketing: false,
        unsubscribedAllAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(emailPreferences.accountId, accountId))
      .returning();
    return toShape(row ?? null);
  }
  const col =
    scope === "prize_won"
      ? "prize_won"
      : scope === "weekly_digest"
        ? "weekly_digest"
        : scope === "upcoming_sessions"
          ? "upcoming_sessions"
          : "marketing";
  await db
    .update(emailPreferences)
    .set({ updatedAt: new Date() })
    .where(eq(emailPreferences.accountId, accountId));
  // Individual flag update via drizzle sql() for the column name so we
  // don't need one branch per column in the type-level update builder.
  await db.execute(
    sql`UPDATE email_preferences SET ${sql.raw(col)} = FALSE, updated_at = NOW() WHERE account_id = ${accountId}`
  );
  return getEmailPreferences(accountId);
}

/**
 * Is a given `kind` currently allowed for this account? Treats the
 * `unsubscribed_all_at` bit as the override. Preference keys here align
 * with `email_preferences` columns.
 */
export function isEmailKindAllowed(
  prefs: EmailPreferences,
  kind: "prize_won" | "weekly_digest" | "upcoming_sessions" | "marketing"
): boolean {
  if (prefs.unsubscribedAllAt) return false;
  if (kind === "prize_won") return prefs.prizeWon;
  if (kind === "weekly_digest") return prefs.weeklyDigest;
  if (kind === "upcoming_sessions") return prefs.upcomingSessions;
  return prefs.marketing;
}
