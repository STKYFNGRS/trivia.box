import { NextResponse } from "next/server";
import { getMarketplaceDeck } from "@/lib/deckMarketplace";

/**
 * Public detail view for a single approved deck. Returns null for private /
 * unapproved decks so anonymous pokes can't enumerate.
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
