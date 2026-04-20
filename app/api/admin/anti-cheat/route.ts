import { NextResponse } from "next/server";
import { requireSiteAdminResponse } from "@/lib/adminApi";
import { listSuspiciousClusters } from "@/lib/antiCheatQueries";

export async function GET(req: Request) {
  const gate = await requireSiteAdminResponse();
  if (gate) return gate;

  const url = new URL(req.url);
  const minPlayers = Math.max(
    2,
    Math.min(10, Number(url.searchParams.get("minPlayers") ?? 2) || 2)
  );
  const limit = Math.max(
    1,
    Math.min(200, Number(url.searchParams.get("limit") ?? 50) || 50)
  );

  const clusters = await listSuspiciousClusters({ minPlayers, limit });
  return NextResponse.json({ clusters });
}
