import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";

const bodySchema = z.object({
  returnPath: z.string().optional(),
});

/**
 * Starts a Stripe Checkout session for the signed-in account. Works for any
 * account type — players are the default and use this route to upgrade to a
 * host subscription. The webhook at `/api/webhooks/stripe` is responsible for
 * flipping `accounts.account_type` to `host` once the subscription is active.
 */
export async function POST(req: Request) {
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

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return NextResponse.json({ error: "STRIPE_PRICE_ID not configured" }, { status: 500 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  // Players land back on the upgrade confirmation page, hosts on the organizer dashboard.
  const defaultReturn = account.accountType === "player" ? "/dashboard/player/upgrade" : "/dashboard";
  const returnPath = parsed.data.returnPath?.startsWith("/") ? parsed.data.returnPath : defaultReturn;

  const stripe = getStripe();

  let customerId = account.stripeCustomerId ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: account.email,
      metadata: { accountId: account.id },
    });
    customerId = customer.id;
    await db
      .update(accounts)
      .set({ stripeCustomerId: customerId })
      .where(eq(accounts.id, account.id));
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}${returnPath}?checkout=success`,
    cancel_url: `${base}${returnPath}?checkout=cancel`,
    metadata: {
      accountId: account.id,
      intent: account.accountType === "player" ? "upgrade_to_host" : "renew_host",
    },
    subscription_data: {
      metadata: {
        accountId: account.id,
        intent: account.accountType === "player" ? "upgrade_to_host" : "renew_host",
      },
    },
  });

  if (!session.url) {
    return NextResponse.json({ error: "No checkout URL" }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
