import { NextResponse } from "next/server";
import { requireSiteAdminResponse } from "@/lib/adminApi";
import {
  getSubcategoryCoverage,
  getUnmappedVettedBuckets,
  isTaxonomyMissingError,
  pickNextGapSubcategoryGlobal,
} from "@/lib/questionTaxonomy";

export async function GET() {
  const gate = await requireSiteAdminResponse();
  if (gate) return gate;

  try {
    const coverage = await getSubcategoryCoverage();
    const nextGlobal = await pickNextGapSubcategoryGlobal();
    const unmapped = await getUnmappedVettedBuckets();
    const totalTarget = coverage.reduce((s, r) => s + (r.targetCount ?? 0), 0);
    const totalVetted = coverage.reduce((s, r) => s + r.vettedCount, 0);
    const totalUnmapped = unmapped.reduce((s, r) => s + r.vettedCount, 0);

    return NextResponse.json({
      coverage,
      nextGlobal,
      unmapped,
      summary: {
        totalTarget,
        totalVetted,
        totalUnmapped,
        rowCount: coverage.length,
      },
    });
  } catch (err) {
    if (isTaxonomyMissingError(err)) {
      return NextResponse.json(
        {
          error: "taxonomy_missing",
          message:
            "Taxonomy tables are missing. Run `npm run db:migrate` to apply migration 0004_question_taxonomy.",
          migration: "0004_question_taxonomy",
        },
        { status: 503 }
      );
    }
    throw err;
  }
}
