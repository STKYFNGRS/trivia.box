import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAccount } from "@/lib/accounts";
import { apiErrorResponse } from "@/lib/apiError";
import {
  ensureEmailPreferences,
  patchEmailPreferences,
} from "@/lib/email/preferences";

export const dynamic = "force-dynamic";

/**
 * Read + update the signed-in account's email notification preferences.
 * Lazy-upserts a row on first read so PATCHes are always a no-branch
 * update. Used by `/dashboard/player/notifications`.
 */

export async function GET() {
  try {
    const account = await getCurrentAccount();
    if (!account) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const preferences = await ensureEmailPreferences(account.id);
    return NextResponse.json({ preferences });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

const patchSchema = z.object({
  prizeWon: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
  upcomingSessions: z.boolean().optional(),
  marketing: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  try {
    const account = await getCurrentAccount();
    if (!account) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const preferences = await patchEmailPreferences(account.id, parsed.data);
    return NextResponse.json({ preferences });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
