import { NextResponse } from "next/server";

/**
 * Shared auth for Vercel Cron handlers.
 *
 * Vercel Cron requests are authenticated in two ways, and a well-behaved cron
 * handler must accept **either**:
 *
 *   1. `x-vercel-cron` header — injected automatically by the Vercel Cron
 *      infrastructure on every scheduled hit. This is the primary signal
 *      and works even when `CRON_SECRET` is unset, which is why it's the
 *      header the Vercel docs recommend relying on.
 *   2. `Authorization: Bearer $CRON_SECRET` — only present when the user has
 *      configured `CRON_SECRET` in the Vercel dashboard *and* Vercel has
 *      rolled out the header-injection mechanism to their project. Still
 *      useful for manual curl / local tests; never required.
 *
 * Until 2026-04-20 every cron route in this repo *except* `autopilot-tick`
 * only accepted form (2), which silently 401'd every Vercel Cron hit in
 * environments without `CRON_SECRET` set — that's why `/play` and
 * `/games/upcoming` stayed empty even though the cron schedule in
 * [`vercel.json`](../vercel.json) ran every 5 minutes: `house-games/tick`
 * couldn't authenticate itself. Keep this helper as the single source of
 * truth so the divergence can't happen again.
 */
export function isCronAuthorized(req: Request): boolean {
  if (req.headers.get("x-vercel-cron")) return true;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return req.headers.get("authorization")?.trim() === `Bearer ${secret}`;
}

/**
 * Convenience wrapper that returns a ready-made 401 NextResponse when the
 * caller isn't an authorized cron invocation, or `null` when the request
 * should be allowed through. Keeps the handler bodies a single line.
 */
export function cronAuthOrResponse(req: Request): NextResponse | null {
  if (isCronAuthorized(req)) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
