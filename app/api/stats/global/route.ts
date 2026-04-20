import { NextResponse } from "next/server";
import { getGlobalStats } from "@/lib/stats/aggregate";

/**
 * Public, unauthenticated global stats feed for `/leaderboards` and any
 * future embed. Intentionally coarse - sorts and filters live client-side.
 * Cached briefly so we don't run the joins on every page view.
 */
export async function GET() {
  const data = await getGlobalStats();
  const res = NextResponse.json(data);
  res.headers.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
  return res;
}

export const dynamic = "force-dynamic";
