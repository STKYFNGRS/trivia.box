import { and, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { questions } from "@/lib/db/schema";
import { getActiveTaxonomyTree, isTaxonomyMissingError } from "@/lib/questionTaxonomy";

/**
 * Public read-only list of active question categories with vetted counts.
 * Used by the solo-game setup UI; safe to cache for a minute because the
 * taxonomy changes at admin-scale frequency and the counts are only used
 * to hint "this category has enough to be interesting."
 */
export async function GET() {
  let tree;
  try {
    tree = await getActiveTaxonomyTree();
  } catch (err) {
    if (isTaxonomyMissingError(err)) {
      return NextResponse.json({ categories: [] });
    }
    throw err;
  }

  const vettedByCategory = await db
    .select({ category: questions.category, n: count() })
    .from(questions)
    .where(and(eq(questions.vetted, true), eq(questions.retired, false)))
    .groupBy(questions.category);
  const vettedMap = new Map(vettedByCategory.map((r) => [r.category, Number(r.n)]));

  const categories = tree
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      label: c.label,
      description: c.description,
      sortOrder: c.sortOrder,
      totalVetted: vettedMap.get(c.label) ?? 0,
    }))
    .filter((c) => c.totalVetted > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return NextResponse.json(
    { categories },
    {
      headers: {
        // Cache aggressively; category totals shift slowly.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}

export const dynamic = "force-dynamic";
