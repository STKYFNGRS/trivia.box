import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import type { AccountRow } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";
import { isSiteAdminClerkUserId } from "@/lib/siteAdmin";

/**
 * Stripe subscription statuses that grant organizer access in the app.
 * Kept in sync with the webhook handler at `app/api/webhooks/stripe/route.ts`.
 */
const ACTIVE_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing"]);

export type ReconcileResult = {
  /** Whether any DB write happened. */
  changed: boolean;
  /** The live subscription status post-reconcile. */
  subscriptionActive: boolean;
  /** The Stripe subscription id we latched onto, if any. */
  stripeSubscriptionId: string | null;
  /** How many active/trialing subscriptions Stripe reported (includes those scheduled to cancel at period end). */
  activeSubscriptionCount: number;
  /**
   * How many subs are *actually* going to re-bill — i.e. active/trialing AND
   * not scheduled to cancel at period end. This is the count we use to flag
   * a real duplicate-charge situation; a single sub with
   * `cancel_at_period_end: true` is a normal mid-cancellation state, not a
   * duplicate.
   */
  billingSubscriptionCount: number;
  /**
   * When the latched subscription is scheduled to cancel, this is the date
   * access will end (Stripe's `cancel_at`, falling back to the current
   * period end). Null when the sub isn't scheduled to cancel, or no sub
   * exists. Drives the "access until …" hint on the Subscription card.
   */
  scheduledCancelAt: Date | null;
};

/**
 * Normalize the "when does this subscription end" timestamp across Stripe
 * API versions. In older versions `current_period_end` sat on the
 * Subscription; in the 2025+ versions it moved to each SubscriptionItem.
 * We prefer `cancel_at` (set whenever `cancel_at_period_end: true`) and
 * fall back to whichever period-end field the current SDK exposes.
 */
function extractScheduledCancelDate(sub: Stripe.Subscription): Date | null {
  if (!sub.cancel_at_period_end) return null;
  const raw = sub as unknown as {
    cancel_at?: number | null;
    current_period_end?: number | null;
    items?: { data?: Array<{ current_period_end?: number | null }> };
  };
  const ts =
    raw.cancel_at ??
    raw.current_period_end ??
    raw.items?.data?.[0]?.current_period_end ??
    null;
  return typeof ts === "number" ? new Date(ts * 1000) : null;
}

/**
 * Ask Stripe directly whether an account has an active subscription, and
 * reconcile the local `accounts` row if the DB is out of sync.
 *
 * This is our **belt-and-suspenders** for missed Stripe webhooks. In
 * production, `/api/webhooks/stripe` is the primary source of truth, but
 * webhooks can silently fail when:
 *   - `STRIPE_WEBHOOK_SECRET` is unset or mismatched (401 to Stripe)
 *   - the webhook endpoint isn't registered in the correct Stripe mode
 *     (test vs live)
 *   - a deploy was down during a subscription event and Stripe's retries
 *     expired
 *
 * Without reconciliation a user pays, sees the banner still nagging them to
 * subscribe, then pays *again* (we've seen this firsthand). We call this
 * from the organizer dashboard on load so state self-heals on the next visit.
 *
 * Best-effort: all Stripe errors are swallowed and reported via the result's
 * `changed: false` shape so the caller can render without throwing.
 */
export async function reconcileOrganizerSubscription(
  account: AccountRow
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    changed: false,
    subscriptionActive: account.subscriptionActive,
    stripeSubscriptionId: account.stripeSubscriptionId ?? null,
    activeSubscriptionCount: 0,
    billingSubscriptionCount: 0,
    scheduledCancelAt: null,
  };

  // No Stripe customer → nothing to reconcile against.
  if (!account.stripeCustomerId) return result;
  // Billing not configured on this server — skip silently rather than 500.
  if (!process.env.STRIPE_SECRET_KEY) return result;

  let subs: Stripe.ApiList<Stripe.Subscription>;
  try {
    subs = await getStripe().subscriptions.list({
      customer: account.stripeCustomerId,
      status: "all",
      limit: 10,
    });
  } catch (err) {
    // Could be `resource_missing` (stale customer id) or a network blip;
    // either way we don't want dashboard renders to fail. The checkout /
    // portal flows handle stale customer ids via `resolveStripeCustomerId`.
    console.warn("[billing/reconcile] stripe.subscriptions.list failed", err);
    return result;
  }

  const activeSubs = subs.data.filter((s) => ACTIVE_STATUSES.has(s.status));
  result.activeSubscriptionCount = activeSubs.length;
  // A sub with `cancel_at_period_end: true` is technically still "active" in
  // Stripe until the period expires, but it won't re-bill. We don't want the
  // dashboard to scream "2 active subscriptions!" at a user who has already
  // canceled one — that's a normal winding-down state.
  result.billingSubscriptionCount = activeSubs.filter(
    (s) => !s.cancel_at_period_end
  ).length;

  // Prefer a sub that's actually going to re-bill; fall back to any active
  // sub (e.g. user has one sub scheduled to cancel but nothing replacing it
  // yet — we still want the app to say "active" until it lapses).
  const truthySub =
    activeSubs.find((s) => !s.cancel_at_period_end) ?? activeSubs[0] ?? null;
  const truthyActive = Boolean(truthySub);
  const truthySubId = truthySub?.id ?? null;
  result.scheduledCancelAt = truthySub ? extractScheduledCancelDate(truthySub) : null;

  // Does the DB already agree with Stripe? No-op.
  if (
    truthyActive === account.subscriptionActive &&
    truthySubId === (account.stripeSubscriptionId ?? null)
  ) {
    result.subscriptionActive = truthyActive;
    result.stripeSubscriptionId = truthySubId;
    return result;
  }

  // Never demote a site admin's role; keep them `site_admin` regardless of
  // Stripe state so admin UIs remain reachable.
  const keepSiteAdmin =
    account.accountType === "site_admin" ||
    isSiteAdminClerkUserId(account.clerkUserId);
  const nextType = keepSiteAdmin
    ? "site_admin"
    : truthyActive
      ? "host"
      : account.accountType === "host"
        ? "player"
        : account.accountType;

  await db
    .update(accounts)
    .set({
      subscriptionActive: truthyActive,
      stripeSubscriptionId: truthySubId,
      accountType: nextType,
    })
    .where(eq(accounts.id, account.id));

  result.changed = true;
  result.subscriptionActive = truthyActive;
  result.stripeSubscriptionId = truthySubId;
  return result;
}
