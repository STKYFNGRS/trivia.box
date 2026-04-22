import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, zodErrorResponse } from "@/lib/apiError";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";
import {
  advanceAutopilotSession,
  type SessionForHost,
} from "@/lib/game/hostActions";
import { clientIpFromRequest, enforceRateLimit } from "@/lib/rateLimit";

/**
 * Viewer-driven autopilot tick for a single session.
 *
 * Background
 * ----------
 * Autopilot / house games are progressed by the Vercel cron
 * (`/api/cron/autopilot-tick`) which only runs every ~60 s. That cadence is
 * too slow for per-question timers (which can be < 60 s) and doesn't exist
 * at all in local dev. If no one were driving the state machine, a player
 * joining mid-game would be stuck on whatever question was active when the
 * session launched.
 *
 * This endpoint lets the hosted play / display pages poke the same state
 * machine at interactive cadence (every ~2 s) as long as at least one viewer
 * has the page open. `advanceAutopilotSession` is idempotent — concurrent
 * pokes from N viewers in the same tick just short-circuit after the first
 * one wins; each branch re-reads authoritative state from the DB.
 *
 * Guardrails
 * ----------
 *  - Rate-limited per IP via the existing `anonymous` bucket (60/min).
 *  - Only operates on `runMode: autopilot` sessions — a call with a hosted
 *    game's code returns `ok:false` with `skipped: "not_autopilot"` without
 *    touching state.
 *  - Returns the same action / reason vocabulary the cron emits so both
 *    paths look identical in logs.
 */
const bodySchema = z.object({
  joinCode: z
    .string()
    .length(6)
    .regex(/^[A-Z0-9]+$/i),
});

export async function POST(req: Request) {
  try {
    await enforceRateLimit("anonymous", `ip:${clientIpFromRequest(req)}`);
  } catch (e) {
    return apiErrorResponse(e);
  }

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const code = parsed.data.joinCode.toUpperCase();

  const rows = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      joinCode: sessions.joinCode,
      timerMode: sessions.timerMode,
      runMode: sessions.runMode,
      secondsPerQuestion: sessions.secondsPerQuestion,
      pausedAt: sessions.pausedAt,
    })
    .from(sessions)
    .where(eq(sessions.joinCode, code))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ ok: false, skipped: "not_found" }, { status: 404 });
  }
  if (row.runMode !== "autopilot") {
    return NextResponse.json({ ok: true, skipped: "not_autopilot" });
  }
  if (row.status !== "active") {
    return NextResponse.json({ ok: true, skipped: `status:${row.status}` });
  }

  const session: SessionForHost = {
    id: row.id,
    status: row.status,
    joinCode: row.joinCode,
    timerMode: row.timerMode,
    runMode: row.runMode,
    secondsPerQuestion: row.secondsPerQuestion ?? null,
    pausedAt: row.pausedAt ?? null,
  };

  try {
    const res = await advanceAutopilotSession(session);
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "tick_failed",
      },
      { status: 500 },
    );
  }
}
