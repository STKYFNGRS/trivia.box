import { NextResponse } from "next/server";
import { z } from "zod";
import { cronAuthOrResponse } from "@/lib/cronAuth";
import {
  sendUpcomingSessionBatch,
  sendWeeklyDigestBatch,
} from "@/lib/email/triggers";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  kind: z.enum(["weekly", "upcoming", "both"]).default("both"),
  max: z.coerce.number().int().positive().max(500).optional(),
  nowMs: z.coerce.number().int().positive().optional(),
});

/**
 * Unified email-digest cron.
 *
 *   /api/cron/email-digests?kind=weekly   — Monday digest; also runs
 *                                           defensively every hour since
 *                                           the week-key dedupe makes it
 *                                           a no-op outside the window.
 *   /api/cron/email-digests?kind=upcoming — Reminder scan for any
 *                                           hosted session starting in
 *                                           the next 24h.
 *   /api/cron/email-digests               — Runs both (vercel.json uses
 *                                           this form so a single cron
 *                                           line can cover everything).
 *
 * Idempotency lives inside each trigger (`sent_emails (kind, dedupe_key)`
 * unique index), so a high-frequency schedule + a missed hour both stay
 * safe.
 */
async function run(req: Request) {
  const unauthorized = cronAuthOrResponse(req);
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    kind: url.searchParams.get("kind") ?? undefined,
    max: url.searchParams.get("max") ?? undefined,
    nowMs: url.searchParams.get("nowMs") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const now = new Date(parsed.data.nowMs ?? Date.now());
  const weekly =
    parsed.data.kind === "weekly" || parsed.data.kind === "both"
      ? await sendWeeklyDigestBatch(now, { max: parsed.data.max }).catch(
          (err) => ({
            error: err instanceof Error ? err.message : String(err),
          })
        )
      : null;
  const upcoming =
    parsed.data.kind === "upcoming" || parsed.data.kind === "both"
      ? await sendUpcomingSessionBatch(now, { max: parsed.data.max }).catch(
          (err) => ({
            error: err instanceof Error ? err.message : String(err),
          })
        )
      : null;

  return NextResponse.json({
    now: now.toISOString(),
    weekly,
    upcoming,
  });
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}
