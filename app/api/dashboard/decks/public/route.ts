import { auth } from "@clerk/nextjs/server";
import { inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { countQuestionsForDecks, listPublicDecks } from "@/lib/decks";

/**
 * Lists approved public decks so hosts can pick from them in GameSetup. Auth
 * required so anonymous traffic cannot scrape; any signed-in user is allowed
 * (players browsing the catalog ahead of an upgrade is fine).
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const decks = await listPublicDecks();
  const counts = await countQuestionsForDecks(decks.map((d) => d.id));
  const ownerIds = Array.from(new Set(decks.map((d) => d.ownerAccountId)));
  const owners = ownerIds.length
    ? await db
        .select({ id: accounts.id, name: accounts.name })
        .from(accounts)
        .where(inArray(accounts.id, ownerIds))
    : [];
  const ownerName = new Map(owners.map((o) => [o.id, o.name]));

  return NextResponse.json({
    decks: decks.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      defaultCategory: d.defaultCategory,
      defaultSubcategory: d.defaultSubcategory,
      ownerName: ownerName.get(d.ownerAccountId) ?? "Community",
      questionCount: counts.get(d.id) ?? 0,
      reviewedAt: d.reviewedAt,
    })),
  });
}
