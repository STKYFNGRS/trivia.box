import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { apiErrorResponse } from "@/lib/apiError";
import { resolveStripeCustomerId } from "@/lib/billing/resolveStripeCustomer";
import { getStripe } from "@/lib/stripe";

const bodySchema = z.object({
  returnPath: z.string().optional(),
});

/**
 * Starts a Stripe Checkout session for the signed-in account. Works for any
 * account type — players are the default and use this route to upgrade to a
 * host subscription. The webhook at `/api/webhooks/stripe` is responsible for
 * flipping `accounts.account_type` to `host` once the subscription is active.
 *
 * All failures return JSON (never a raw Next 500 error page) so the client's
 * `res.json()` never throws "Unexpected end of JSON input" on a crash.
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const account = await getAccountByClerkUserId(userId);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 400 });
    }

    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    // Surface missing Stripe config with a clear, actionable message instead
    // of letting `getStripe()` throw a bare error. Site admins running in dev
    // can set SITE_ADMIN_DEV_BYPASS=1 to skip billing entirely; everyone else
    // needs real keys in their .env.local / Vercel envs.
    const secret = process.env.STRIPE_SECRET_KEY;
    const priceId = process.env.STRIPE_PRICE_ID;
    if (!secret || !priceId) {
      const missing = [
        !secret ? "STRIPE_SECRET_KEY" : null,
        !priceId ? "STRIPE_PRICE_ID" : null,
      ]
        .filter(Boolean)
        .join(" + ");
      return NextResponse.json(
        {
          error: `Billing is not configured on this server (${missing}). Ask the site admin to set the Stripe envs, or enable SITE_ADMIN_DEV_BYPASS=1 for dev.`,
        },
        { status: 503 }
      );
    }

    const base =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
      "http://localhost:3000";
    // Players land back on the upgrade confirmation page, hosts on the organizer dashboard.
    const defaultReturn =
      account.accountType === "player" ? "/dashboard/player/upgrade" : "/dashboard";
    const returnPath = parsed.data.returnPath?.startsWith("/")
      ? parsed.data.returnPath
      : defaultReturn;

    const stripe = getStripe();
    // Self-healing customer lookup — if the stored id is missing in Stripe
    // (account rotated, customer deleted, env copied between test/live), we
    // transparently create a fresh one and persist it instead of 500-ing
    // with "No such customer".
    const customerId = await resolveStripeCustomerId(stripe, account);

    // Duplicate-subscription guard. If Stripe already has an active / trialing
    // sub for this customer, sending them through Checkout would silently
    // charge them a second time. Reroute them to the billing portal where
    // they can cancel, swap cards, or download an invoice. This is the bug
    // that bit us when the webhook missed a `checkout.session.completed` —
    // the user "re-subscribed" and got double-billed.
    try {
      const existing = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 5,
      });
      const liveSub = existing.data.find(
        (s) => s.status === "active" || s.status === "trialing"
      );
      if (liveSub) {
        const portal = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${base}${returnPath}?checkout=existing`,
        });
        return NextResponse.json({
          url: portal.url,
          kind: "portal",
          reason: "already_subscribed",
        });
      }
    } catch (err) {
      console.warn("[billing/checkout] duplicate-sub guard failed", err);
      // Swallow — we'd rather fall through to a potentially-duplicate checkout
      // (webhook will still promote the account) than fail the click entirely.
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}${returnPath}?checkout=success`,
      cancel_url: `${base}${returnPath}?checkout=cancel`,
      metadata: {
        accountId: account.id,
        intent:
          account.accountType === "player" ? "upgrade_to_host" : "renew_host",
      },
      subscription_data: {
        metadata: {
          accountId: account.id,
          intent:
            account.accountType === "player" ? "upgrade_to_host" : "renew_host",
        },
      },
    });

    if (!session.url) {
      return NextResponse.json({ error: "No checkout URL" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("[billing/checkout] failed", e);
    return apiErrorResponse(e, "Checkout failed");
  }
}
