import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { getPlayerByAccountId } from "@/lib/players";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const account = await getAccountByClerkUserId(userId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  const player = await getPlayerByAccountId(account.id);
  if (!player) {
    return NextResponse.json({ error: "Player profile missing" }, { status: 404 });
  }
  return NextResponse.json({
    playerId: player.id,
    username: player.username,
    displayName: account.name,
  });
}
