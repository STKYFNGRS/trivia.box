import { auth } from "@clerk/nextjs/server";
import { and, count, eq, gte, notInArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { questionVenueHistory, questions } from "@/lib/db/schema";
import { getActiveTaxonomyTree, isTaxonomyMissingError } from "@/lib/questionTaxonomy";

/**
 * Active categories plus per-venue eligibility counts for the game-creation
 * wizard. The wizard uses the counts to (a) pick a sensible random default
 * category per round (only categories with enough vetted questions qualify)
 * and (b) warn the host when the selected category is thin.
 *
 * The "eligibleCount" matches the filter used by `countSmartPullEligible`:
 * vetted, not retired, not used at this venue in the last 90 days.
 */
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const account = await getAccountByClerkUserId(userId);
  if (!account || account.accountType === "player") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const venueAccountId = url.searchParams.get("venueAccountId");

  let tree;
  try {
    tree = await getActiveTaxonomyTree();
  } catch (err) {
    if (isTaxonomyMissingError(err)) {
      return NextResponse.json({ categories: [], taxonomyMissing: true });
    }
    throw err;
  }

  // Raw per-category vetted counts (not venue-scoped) - used as a fallback
  // signal when no venue is supplied.
  const vettedByCategory = await db
    .select({ category: questions.category, n: count() })
    .from(questions)
    .where(and(eq(questions.vetted, true), eq(questions.retired, false)))
    .groupBy(questions.category);
  const vettedMap = new Map(vettedByCategory.map((r) => [r.category, Number(r.n)]));

  // Per-venue recent-usage set (90 days) - matches smart-pull behavior.
  let recentIds: string[] = [];
  if (venueAccountId) {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({ questionId: questionVenueHistory.questionId })
      .from(questionVenueHistory)
      .where(
        and(
          eq(questionVenueHistory.venueAccountId, venueAccountId),
          gte(questionVenueHistory.usedAt, since)
        )
      );
    recentIds = rows.map((r) => r.questionId);
  }

  let eligibleByCategory = new Map<string, number>();
  if (venueAccountId) {
    const eligibleRows = await db
      .select({ category: questions.category, n: count() })
      .from(questions)
      .where(
        and(
          eq(questions.vetted, true),
          eq(questions.retired, false),
          recentIds.length ? notInArray(questions.id, recentIds) : undefined
        )
      )
      .groupBy(questions.category);
    eligibleByCategory = new Map(eligibleRows.map((r) => [r.category, Number(r.n)]));
  } else {
    eligibleByCategory = new Map(vettedMap);
  }

  const categories = tree.map((c) => {
    const totalVetted = vettedMap.get(c.label) ?? 0;
    const eligibleCount = eligibleByCategory.get(c.label) ?? 0;
    return {
      id: c.id,
      slug: c.slug,
      label: c.label,
      description: c.description,
      sortOrder: c.sortOrder,
      totalVetted,
      eligibleCount,
      subcategories: c.subcategories.map((s) => ({
        id: s.id,
        slug: s.slug,
        label: s.label,
      })),
    };
  });

  return NextResponse.json({ categories });
}

export const dynamic = "force-dynamic";
