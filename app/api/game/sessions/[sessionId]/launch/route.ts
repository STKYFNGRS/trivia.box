import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { LaunchBlockedError, launchSession } from "@/lib/game/launchSession";
import { assertHostControlsSession } from "@/lib/game/sessionPermissions";
import { hasEffectiveOrganizerSubscription } from "@/lib/subscription";
import { apiErrorResponse } from "@/lib/apiError";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await getAccountByClerkUserId(userId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 400 });
  }
  if (!hasEffectiveOrganizerSubscription(account)) {
    return NextResponse.json({ error: "Subscription required" }, { status: 402 });
  }

  const { sessionId } = await ctx.params;
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  try {
    const session = await assertHostControlsSession(account, sessionId);
    const { joinCode } = await launchSession({ session, force });
    return NextResponse.json({ joinCode });
  } catch (e) {
    if (e instanceof LaunchBlockedError) {
      switch (e.reason) {
        case "already_launched":
          return NextResponse.json({ error: "Session already launched" }, { status: 400 });
        case "too_early":
          return NextResponse.json(
            {
              error: "Too early to launch. Add ?force=1 to launch now.",
              eventStartsAt: e.eventStartsAt,
            },
            { status: 400 }
          );
        case "too_late":
          return NextResponse.json(
            {
              error: "This session's scheduled window has passed. Add ?force=1 to launch now.",
              eventStartsAt: e.eventStartsAt,
            },
            { status: 400 }
          );
        case "venue_busy":
          return NextResponse.json(
            {
              error: "This venue already has an active game. Finish it before starting a new one.",
              code: "VENUE_BUSY",
            },
            { status: 409 }
          );
      }
    }
    return apiErrorResponse(e);
  }
}
