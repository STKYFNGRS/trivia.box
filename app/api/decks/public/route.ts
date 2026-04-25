import { NextResponse } from "next/server";
import { listMarketplaceDecks, type DeckSort } from "@/lib/deckMarketplace";

/**
 * GET /api/decks/public — public HTTP surface.
 *
 * Anonymous-friendly deck marketplace listing. Cached briefly so Vercel / the
 * browser can coalesce identical queries.
 *
 * Not consumed by the in-repo app. The `/decks` index page calls
 * `listMarketplaceDecks` directly as an RSC. This route is kept as the
 * external contract for embeds, mobile clients, and future partner
 * integrations — keep the response shape stable.
 *
 * Query params:
 *   - sort: popular | top_rated | new
 *   - tag:  exact tag match
 *   - category: default category label
 *   - search: substring match on deck name (lowercased)
 *   - limit: 1..50 (default 24)
 *   - offset: default 0
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawSort = url.searchParams.get("sort") ?? "popular";
  const sort: DeckSort = (["popular", "top_rated", "new"] as const).includes(
    rawSort as DeckSort
  )
    ? (rawSort as DeckSort)
    : "popular";

  const limit = Number(url.searchParams.get("limit") ?? "24");
  const offset = Number(url.searchParams.get("offset") ?? "0");

  const data = await listMarketplaceDecks({
    sort,
    tag: url.searchParams.get("tag"),
    category: url.searchParams.get("category"),
    search: url.searchParams.get("search"),
    limit: Number.isFinite(limit) ? limit : 24,
    offset: Number.isFinite(offset) ? offset : 0,
  });

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
    },
  });
}

export const dynamic = "force-dynamic";
