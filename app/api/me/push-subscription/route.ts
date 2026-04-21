import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { apiErrorResponse } from "@/lib/apiError";
import { db } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(10).max(200),
    auth: z.string().min(10).max(100),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

/**
 * Persist a Web Push subscription for the authenticated account. Idempotent
 * per endpoint — repeated "subscribe" calls update the keys so we don't end
 * up with a stale copy if the browser rotates its keypair.
 *
 * Actual delivery uses the `web-push` npm library at push-time; see
 * `lib/push/send.ts`. This endpoint is free to run without that dep — it
 * just stores the subscription row.
 */
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const account = await getAccountByClerkUserId(userId);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    const json = await req.json().catch(() => null);
    const parsed = subscribeSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;

    // Re-use the endpoint's unique index so we don't accumulate duplicates
    // when the user toggles subscribe/unsubscribe from the same device.
    const existing = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, parsed.data.endpoint))
      .limit(1);

    if (existing[0]) {
      await db
        .update(pushSubscriptions)
        .set({
          accountId: account.id,
          p256dh: parsed.data.keys.p256dh,
          auth: parsed.data.keys.auth,
          userAgent: ua,
          lastUsedAt: new Date(),
        })
        .where(eq(pushSubscriptions.id, existing[0].id));
    } else {
      await db.insert(pushSubscriptions).values({
        accountId: account.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent: ua,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const account = await getAccountByClerkUserId(userId);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }
    const json = await req.json().catch(() => null);
    const parsed = unsubscribeSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.accountId, account.id),
          eq(pushSubscriptions.endpoint, parsed.data.endpoint)
        )
      );

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
