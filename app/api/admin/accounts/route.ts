import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdminResponse } from "@/lib/adminApi";
import { db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";

export async function GET() {
  const gate = await requireAdminResponse();
  if (gate) return gate;

  const rows = await db
    .select({
      id: accounts.id,
      accountType: accounts.accountType,
      name: accounts.name,
      email: accounts.email,
      city: accounts.city,
      subscriptionActive: accounts.subscriptionActive,
      stripeCustomerId: accounts.stripeCustomerId,
      stripeSubscriptionId: accounts.stripeSubscriptionId,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .orderBy(desc(accounts.createdAt))
    .limit(200);

  return NextResponse.json({ accounts: rows });
}
