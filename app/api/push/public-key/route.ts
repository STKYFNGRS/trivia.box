import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Surface the VAPID public key so the browser can call
 * `PushManager.subscribe({ applicationServerKey })`. We keep it on its own
 * route so we can add rate limiting without touching unrelated endpoints.
 *
 * Returns `{ publicKey: null }` when push is not configured — the client
 * then hides the "Enable push" CTA instead of throwing.
 */
export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? null;
  return NextResponse.json({ publicKey });
}
