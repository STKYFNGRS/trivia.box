import type { AccountRow } from "@/lib/accounts";
import { siteAdminDevBypassEnabled } from "@/lib/siteAdmin";

/** Stripe subscription or dev-only `site_admin` bypass (never in production). */
export function hasEffectiveOrganizerSubscription(account: AccountRow): boolean {
  if (account.subscriptionActive) return true;
  if (account.accountType === "site_admin" && siteAdminDevBypassEnabled()) return true;
  return false;
}
