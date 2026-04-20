import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";

/**
 * Lightweight read of the signed-in account's role + subscription state.
 * Used by the player -> host upgrade interstitial to poll for the webhook
 * to finish propagating after Stripe checkout returns.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const account = await getAccountByClerkUserId(userId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  return NextResponse.json({
    accountType: account.accountType,
    subscriptionActive: account.subscriptionActive,
  });
}
