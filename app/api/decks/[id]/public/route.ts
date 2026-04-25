import { NextResponse } from "next/server";
import { getMarketplaceDeck } from "@/lib/deckMarketplace";

/**
 * GET /api/decks/[id]/public — public HTTP surface.
 *
 * Public detail view for a single approved deck. Returns 404 for private or
 * unapproved decks so anonymous pokes can't enumerate.
 *
 * Not consumed by the in-repo app. The `/decks/[id]` page calls
 * `getMarketplaceDeck` directly as an RSC. This route is kept as the external
 * contract for embeds, mobile clients, and future partner integrations —
 * keep the response shape stable.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  }
  const deck = await getMarketplaceDeck(id);
  if (!deck) {
    return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  }
  return NextResponse.json(
    { deck },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
      },
    }
  );
}

export const dynamic = "force-dynamic";
