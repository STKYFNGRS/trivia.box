import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { track } from "@/lib/analytics/server";
import { db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";
import { isSiteAdminClerkUserId } from "@/lib/siteAdmin";

export const runtime = "nodejs";

/**
 * Stripe -> trivia.box account lifecycle:
 *
 *  - `checkout.session.completed`                      -> promote to host + active
 *  - `customer.subscription.updated` (status active)   -> promote to host + active
 *  - `customer.subscription.updated` (status lapsed)   -> revert to player + inactive
 *  - `customer.subscription.deleted`                   -> revert to player + inactive
 *
 *  Site admin accounts are never demoted; they keep `account_type = 'site_admin'`.
 */
const LAPSED_STATUSES = new Set<Stripe.Subscription.Status>([
  "past_due",
  "unpaid",
  "canceled",
  "incomplete_expired",
  "paused",
]);

const ACTIVE_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
]);

async function promoteAccountToHost(accountId: string, subscriptionId: string | null) {
  const [row] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!row) return;
  const nextType = row.accountType === "site_admin" ? "site_admin" : "host";
  await db
    .update(accounts)
    .set({
      accountType: nextType,
      subscriptionActive: true,
      stripeSubscriptionId: subscriptionId ?? row.stripeSubscriptionId ?? null,
    })
    .where(eq(accounts.id, accountId));
}

async function revertAccountToPlayer(params: {
  accountId?: string;
  customerId?: string;
  subscriptionId: string | null;
  clearSubscriptionId: boolean;
}) {
  const { accountId, customerId, subscriptionId, clearSubscriptionId } = params;
  const [row] = accountId
    ? await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1)
    : customerId
      ? await db.select().from(accounts).where(eq(accounts.stripeCustomerId, customerId)).limit(1)
      : [];
  if (!row) return;

  // Never demote a site admin.
  const baseType = row.accountType === "site_admin" ? "site_admin" : "player";
  // Defensive: if the Clerk id is in the allowlist, make sure the account stays site_admin.
  const nextType = isSiteAdminClerkUserId(row.clerkUserId) ? "site_admin" : baseType;

  await db
    .update(accounts)
    .set({
      accountType: nextType,
      subscriptionActive: false,
      stripeSubscriptionId: clearSubscriptionId ? null : (subscriptionId ?? row.stripeSubscriptionId ?? null),
    })
    .where(eq(accounts.id, row.id));
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const sig = (await headers()).get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json({ error: "Missing webhook configuration" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error("Stripe webhook signature error", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const accountId = session.metadata?.accountId;
        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : (session.subscription?.id ?? null);

        if (accountId && customerId) {
          await db
            .update(accounts)
            .set({
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
            })
            .where(eq(accounts.id, accountId));
          await promoteAccountToHost(accountId, subscriptionId);
          void track("subscription_started", {
            distinctId: `account:${accountId}`,
            properties: {
              accountId,
              customerId,
              subscriptionId: subscriptionId ?? null,
              source: "checkout.session.completed",
            },
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const accountIdFromMeta = sub.metadata?.accountId ?? null;

        if (ACTIVE_STATUSES.has(sub.status)) {
          if (accountIdFromMeta) {
            await promoteAccountToHost(accountIdFromMeta, sub.id);
          } else {
            const [row] = await db
              .select({ id: accounts.id })
              .from(accounts)
              .where(eq(accounts.stripeCustomerId, customerId))
              .limit(1);
            if (row) await promoteAccountToHost(row.id, sub.id);
          }
        } else if (LAPSED_STATUSES.has(sub.status)) {
          await revertAccountToPlayer({
            accountId: accountIdFromMeta ?? undefined,
            customerId,
            subscriptionId: sub.id,
            clearSubscriptionId: false,
          });
        } else {
          // `incomplete` / unknown: leave role unchanged but keep subscription id fresh.
          await db
            .update(accounts)
            .set({ stripeSubscriptionId: sub.id })
            .where(eq(accounts.stripeCustomerId, customerId));
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        await revertAccountToPlayer({
          customerId,
          subscriptionId: null,
          clearSubscriptionId: true,
        });
        break;
      }

      case "invoice.payment_failed": {
        // Stripe almost always follows up with `customer.subscription.updated`,
        // but we flip eagerly if we can identify the account so the user's role
        // reflects reality within a single webhook round-trip.
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : (invoice.customer?.id ?? null);
        if (customerId) {
          await revertAccountToPlayer({
            customerId,
            subscriptionId: null,
            clearSubscriptionId: false,
          });
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("Stripe webhook handler error", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
