import { NextResponse } from "next/server";
import { requireAdminResponse } from "@/lib/adminApi";
import { apiErrorResponse } from "@/lib/apiError";
import { cancelHouseGame } from "@/lib/game/houseGames";

/**
 * Cancel a pending house game from the admin panel. Only pending games
 * are cancellable — once `auto-launch-sessions` flips the row to
 * `active`, operators have to use the host controls to end the game
 * (avoids leaving live players stranded mid-question).
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
) {
  const gate = await requireAdminResponse();
  if (gate) return gate;
  const { sessionId } = await ctx.params;
  try {
    const ok = await cancelHouseGame(sessionId);
    if (!ok) {
      return NextResponse.json(
        {
          error:
            "House game can't be cancelled — already started, completed, or not a house session.",
          code: "HOUSE_GAME_NOT_CANCELLABLE",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

export const dynamic = "force-dynamic";
