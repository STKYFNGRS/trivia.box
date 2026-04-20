import { NextRequest, NextResponse } from "next/server";
import { getVenueProfileBySlug } from "@/lib/venue";

/**
 * Public endpoint that streams the raw venue image bytes straight from Neon.
 * Uses `image_updated_at` (ms) as both the cache-busting query param and the
 * strong ETag so browser caches invalidate the moment a host re-uploads.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const row = await getVenueProfileBySlug(slug);
  if (!row || !row.imageBytes || !row.imageMime) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updatedAt = row.imageUpdatedAt ?? row.updatedAt;
  const etag = `"v-${updatedAt.getTime()}"`;

  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    });
  }

  const body = new Uint8Array(row.imageBytes);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": row.imageMime,
      "Content-Length": body.byteLength.toString(),
      ETag: etag,
      "Last-Modified": updatedAt.toUTCString(),
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
