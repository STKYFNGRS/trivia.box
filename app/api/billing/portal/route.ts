import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { apiErrorResponse } from "@/lib/apiError";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Opens a Stripe Billing Portal session for the signed-in account so the user
 * can update their card, download invoices, change plan, or cancel — all from
 * inside the Clerk UserButton popup via `components/billing/ManageBillingMenuItem`.
 *
 * When the account has never subscribed (`stripeCustomerId` is null) we return
 * a path to the upgrade page instead; the click from the Clerk popup then
 * naturally becomes a "subscribe" CTA without needing two separate menu items.
 *
 * All failures return JSON (never a raw Next 500 page) so the client's JSON
 * parse in `ManageBillingMenuItem` never throws "Unexpected end of JSON input".
 */
export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const account = await getAccountByClerkUserId(userId);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 400 });
    }

    // No Stripe customer yet → route to the upgrade flow instead of a portal.
    // Keeps the "Manage subscription" menu item useful for users who haven't
    // subscribed yet.
    if (!account.stripeCustomerId) {
      return NextResponse.json({
        url: "/dashboard/player/upgrade",
        kind: "upgrade",
      });
    }

    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      return NextResponse.json(
        {
          error:
            "Billing is not configured on this server (STRIPE_SECRET_KEY). Ask the site admin to set the Stripe envs, or enable SITE_ADMIN_DEV_BYPASS=1 for dev.",
        },
        { status: 503 }
      );
    }

    const base =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
      "http://localhost:3000";

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: account.stripeCustomerId,
      return_url: `${base}/dashboard`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a portal URL" },
        { status: 502 }
      );
    }

    return NextResponse.json({ url: session.url, kind: "portal" });
  } catch (e) {
    console.error("[billing/portal] failed", e);
    return apiErrorResponse(e, "Could not open billing portal");
  }
}
