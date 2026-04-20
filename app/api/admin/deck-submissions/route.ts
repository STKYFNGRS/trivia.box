import { inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSiteAdminResponse } from "@/lib/adminApi";
import { db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { countQuestionsForDecks, listSubmittedDecks } from "@/lib/decks";

export async function GET() {
  const forbidden = await requireSiteAdminResponse();
  if (forbidden) return forbidden;

  const decks = await listSubmittedDecks();
  const counts = await countQuestionsForDecks(decks.map((d) => d.id));
  const ownerIds = Array.from(new Set(decks.map((d) => d.ownerAccountId)));
  const owners = ownerIds.length
    ? await db
        .select({ id: accounts.id, name: accounts.name, email: accounts.email })
        .from(accounts)
        .where(inArray(accounts.id, ownerIds))
    : [];
  const ownerMap = new Map(owners.map((o) => [o.id, o]));

  return NextResponse.json({
    decks: decks.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      defaultCategory: d.defaultCategory,
      defaultSubcategory: d.defaultSubcategory,
      submittedAt: d.submittedAt,
      owner: ownerMap.get(d.ownerAccountId) ?? null,
      questionCount: counts.get(d.id) ?? 0,
    })),
  });
}
