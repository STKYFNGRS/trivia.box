import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { ApiError, apiErrorResponse, zodErrorResponse } from "@/lib/apiError";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";

/**
 * Host-scoped PATCH for a single session. Authorizes on ownership of the
 * venue account (`sessions.venueAccountId === caller account.id`) so that
 * hosts can only edit events at their own venue. Site admins own every
 * venue in dev so the same check passes for them implicitly via the
 * site-admin dev bypass pattern (they have `venueAccountId` equal to their
 * own id when they create a session).
 *
 * Writable fields: event time/timezone, prize metadata (`hasPrize`,
 * `prizeDescription`, `prizeTopN`, `prizeLabels`, `prizeInstructions`,
 * `prizeExpiresAt`), and host notes. All other columns (status, runMode,
 * joinCode, etc.) are intentionally immutable from this endpoint — those
 * transitions have their own dedicated routes (launch / complete / swap).
 */
const patchSchema = z.object({
  eventStartsAt: z.string().datetime().optional(),
  eventTimezone: z.string().trim().min(1).max(64).optional(),
  hasPrize: z.boolean().optional(),
  prizeDescription: z.string().trim().max(280).nullable().optional(),
  prizeTopN: z.number().int().min(1).max(10).nullable().optional(),
  prizeLabels: z.array(z.string().trim().min(1).max(120)).max(10).nullable().optional(),
  prizeInstructions: z.string().trim().max(2000).nullable().optional(),
  prizeExpiresAt: z.string().datetime().nullable().optional(),
  hostNotes: z.string().trim().max(4000).nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) throw new ApiError(401, "Unauthorized");

    const account = await getAccountByClerkUserId(userId);
    if (!account) throw new ApiError(400, "Account not found");
    if (account.accountType !== "host" && account.accountType !== "site_admin") {
      throw new ApiError(403, "Not a host");
    }

    const { sessionId } = await params;
    const [existing] = await db
      .select({
        id: sessions.id,
        venueAccountId: sessions.venueAccountId,
        status: sessions.status,
      })
      .from(sessions)
      .where(eq(sessions.id, sessionId));
    if (!existing) throw new ApiError(404, "Session not found");
    if (existing.venueAccountId !== account.id) {
      throw new ApiError(403, "You do not own this venue");
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ApiError(400, "Invalid JSON body");
    }
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    const updates: Partial<typeof sessions.$inferInsert> = {};
    if (parsed.data.eventStartsAt !== undefined) {
      updates.eventStartsAt = new Date(parsed.data.eventStartsAt);
    }
    if (parsed.data.eventTimezone !== undefined) {
      updates.eventTimezone = parsed.data.eventTimezone;
    }
    if (parsed.data.hasPrize !== undefined) updates.hasPrize = parsed.data.hasPrize;
    if (parsed.data.prizeDescription !== undefined) {
      updates.prizeDescription = parsed.data.prizeDescription;
    }
    if (parsed.data.prizeTopN !== undefined) updates.prizeTopN = parsed.data.prizeTopN;
    if (parsed.data.prizeLabels !== undefined) updates.prizeLabels = parsed.data.prizeLabels;
    if (parsed.data.prizeInstructions !== undefined) {
      updates.prizeInstructions = parsed.data.prizeInstructions;
    }
    if (parsed.data.prizeExpiresAt !== undefined) {
      updates.prizeExpiresAt = parsed.data.prizeExpiresAt
        ? new Date(parsed.data.prizeExpiresAt)
        : null;
    }
    if (parsed.data.hostNotes !== undefined) updates.hostNotes = parsed.data.hostNotes;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true, changed: false });
    }

    await db.update(sessions).set(updates).where(eq(sessions.id, sessionId));
    return NextResponse.json({ ok: true, changed: true });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
