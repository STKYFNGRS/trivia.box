import { currentUser } from "@clerk/nextjs/server";
import { getAccountByClerkUserId } from "@/lib/accounts";

/** Site operators: provisioned only when `SITE_ADMIN_CLERK_USER_IDS` contains the Clerk user id. */

export function siteAdminDevBypassEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.SITE_ADMIN_DEV_BYPASS === "1";
}

export function parseSiteAdminClerkAllowlist(): Set<string> {
  const raw = process.env.SITE_ADMIN_CLERK_USER_IDS ?? "";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

export function isSiteAdminClerkUserId(clerkUserId: string): boolean {
  return parseSiteAdminClerkAllowlist().has(clerkUserId);
}

/** Trivia.box operator: env allowlist or upgraded `site_admin` account row. */
export async function isSiteAdminOperator(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  if (isSiteAdminClerkUserId(user.id)) return true;
  const account = await getAccountByClerkUserId(user.id);
  return account?.accountType === "site_admin";
}
