import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { soloSessions } from "@/lib/db/schema";
import { assertSoloOwner, loadNextSoloQuestion } from "@/lib/game/solo";
import { getPlayerByAccountId } from "@/lib/players";

const GUEST_COOKIE = "tb_solo_guest";

/**
 * Fetch the next unanswered question for a solo session. Idempotent: hitting
 * this twice without answering doesn't re-roll the question and doesn't
 * re-stamp `shown_at_ms` (so a refresh mid-timer doesn't reset elapsed).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const rows = await db
    .select()
    .from(soloSessions)
    .where(eq(soloSessions.id, id))
    .limit(1);
  const session = rows[0];
  if (!session) {
    return NextResponse.json({ error: "Solo session not found" }, { status: 404 });
  }

  const { userId } = await auth();
  let playerId: string | null = null;
  if (userId) {
    const account = await getAccountByClerkUserId(userId);
    if (account) {
      const player = await getPlayerByAccountId(account.id);
      if (player) playerId = player.id;
    }
  }
  const jar = await cookies();
  const guestId = jar.get(GUEST_COOKIE)?.value ?? null;

  try {
    assertSoloOwner(session, { playerId, guestId });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const next = await loadNextSoloQuestion(id);
  if (!next) {
    return NextResponse.json({
      complete: session.status !== "active",
      status: session.status,
      totalScore: session.totalScore,
      correctCount: session.correctCount,
      totalQuestions: session.questionCount,
    });
  }

  return NextResponse.json({
    complete: false,
    status: session.status,
    question: next,
    totalScore: session.totalScore,
    correctCount: session.correctCount,
  });
}

export const dynamic = "force-dynamic";
