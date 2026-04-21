import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema";

/**
 * Shape the service worker expects in `event.data.json()`.
 * Keep this flat — we can evolve it later with an `actions` array for
 * "mute venue" / "view recap" buttons.
 */
export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

type DeliveryResult = {
  attempted: number;
  sent: number;
  removed: number;
  skipped: "unconfigured" | null;
};

/**
 * Send a Web Push notification to every subscription under an account.
 *
 * Fails OPEN when VAPID keys or the `web-push` dep are missing — this lets
 * the rest of the app (game lifecycle, cron) run in dev/prod without
 * babysitting optional config. Stale `410 Gone` subscriptions are pruned
 * from the DB so we don't keep retrying them.
 */
export async function sendPushToAccount(
  accountId: string,
  payload: PushPayload
): Promise<DeliveryResult> {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const contact =
    process.env.VAPID_CONTACT_EMAIL ?? "mailto:notifications@trivia.box";

  if (!pub || !priv) {
    return { attempted: 0, sent: 0, removed: 0, skipped: "unconfigured" };
  }

  // Dynamic import so builds don't require `web-push` to be installed.
  // The indirection through a string literal inside `Function` keeps
  // webpack/Turbopack from trying to statically resolve the module at
  // build time — when it's genuinely missing we log once and bail.
  type WebPushLib = {
    setVapidDetails: (contact: string, pub: string, priv: string) => void;
    sendNotification: (
      sub: { endpoint: string; keys: { p256dh: string; auth: string } },
      body: string
    ) => Promise<unknown>;
  };
  let webpush: WebPushLib;
  try {
    const dyn = new Function("m", "return import(m)") as (
      m: string
    ) => Promise<{ default?: WebPushLib } & WebPushLib>;
    const mod = await dyn("web-push");
    webpush = (mod.default ?? mod) as WebPushLib;
  } catch {
    console.warn(
      "[push] web-push dependency is not installed; skipping delivery"
    );
    return { attempted: 0, sent: 0, removed: 0, skipped: "unconfigured" };
  }

  webpush.setVapidDetails(contact, pub, priv);

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.accountId, accountId));

  if (subs.length === 0) {
    return { attempted: 0, sent: 0, removed: 0, skipped: null };
  }

  const body = JSON.stringify(payload);
  const deadEndpoints: string[] = [];
  let sent = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          body
        );
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number } | null)?.statusCode;
        // 404/410 = push service says "this subscription is gone";
        // any other error is transient and we leave the row alone.
        if (status === 404 || status === 410) {
          deadEndpoints.push(s.endpoint);
        } else {
          console.warn("[push] delivery failed", { endpoint: s.endpoint, status });
        }
      }
    })
  );

  if (deadEndpoints.length > 0) {
    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.accountId, accountId),
          inArray(pushSubscriptions.endpoint, deadEndpoints)
        )
      );
  }

  return {
    attempted: subs.length,
    sent,
    removed: deadEndpoints.length,
    skipped: null,
  };
}
