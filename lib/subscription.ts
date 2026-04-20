import type { AccountRow } from "@/lib/accounts";
import { siteAdminDevBypassEnabled } from "@/lib/siteAdmin";

/**
 * Stripe subscription, active Phase 3.3 creator free-tier window, or
 * dev-only `site_admin` bypass (never in production).
 *
 * The free-tier window is additive: a creator earning a free month while
 * already paying simply extends their paid subscription — we don't
 * substitute. This matches player expectations ("I earned a free month,
 * please let me host") without disturbing Stripe state.
 */
export function hasEffectiveOrganizerSubscription(account: AccountRow): boolean {
  if (account.subscriptionActive) return true;
  if (
    account.creatorFreeUntil &&
    account.creatorFreeUntil.getTime() > Date.now()
  ) {
    return true;
  }
  if (account.accountType === "site_admin" && siteAdminDevBypassEnabled()) return true;
  return false;
}
