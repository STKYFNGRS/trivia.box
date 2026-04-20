import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";

/**
 * Resolve a join code to its owning sessionId. Used by the host page when the
 * `?sessionId=` query param is missing (shared / bookmarked host URLs) so the
 * host doesn't land on a "Missing sessionId" dead-end.
 *
 * Host-gated: the caller must be the session's host account.
 */
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await getAccountByClerkUserId(userId);
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("code") ?? "").toUpperCase();
  if (!code || code.length !== 6) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const rows = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      hostAccountId: sessions.hostAccountId,
      runMode: sessions.runMode,
      timerMode: sessions.timerMode,
    })
    .from(sessions)
    .where(eq(sessions.joinCode, code))
    .limit(1);

  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (row.hostAccountId !== account.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    sessionId: row.id,
    status: row.status,
    runMode: row.runMode,
    timerMode: row.timerMode,
  });
}
