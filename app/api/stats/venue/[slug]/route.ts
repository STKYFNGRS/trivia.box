import { NextResponse } from "next/server";
import { getVenueStats } from "@/lib/stats/aggregate";
import { getVenueProfileBySlug } from "@/lib/venue";

/**
 * Public per-venue stats. Keyed by the venue slug so it stays anonymous-safe
 * and embeddable. Joins the venue profile so the response includes display
 * name / image metadata without a second round-trip from the client.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const profile = await getVenueProfileBySlug(slug);
  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const data = await getVenueStats(profile.accountId);
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const res = NextResponse.json(data);
  res.headers.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
  return res;
}

export const dynamic = "force-dynamic";
