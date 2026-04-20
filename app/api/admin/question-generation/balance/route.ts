import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSiteAdminResponse } from "@/lib/adminApi";
import { db } from "@/lib/db/client";
import { questionGenerationJobs } from "@/lib/db/schema";
import {
  isTaxonomyMissingError,
  pickBalancedGenerationTargets,
  pickTopGapSubcategoriesGlobal,
} from "@/lib/questionTaxonomy";

/**
 * The balance route accepts either of two shapes so we can deprecate the
 * older top-N-buckets shape without breaking scripts that still hit it:
 *
 *   1. **Balanced (preferred).** `{ total: N }` — spreads N jobs across every
 *      under-target bucket, guaranteeing per-category representation. This
 *      is what the admin "Generate N (random)" button now uses.
 *   2. **Legacy top-N.** `{ buckets: B, perBucket: P }` — enqueues `P` jobs
 *      each against the `B` globally worst-covered buckets. Kept for older
 *      callers; new UI code should use the `total` shape.
 */
const balancedSchema = z.object({
  total: z.number().int().min(1).max(2500),
});
const topNSchema = z.object({
  buckets: z.number().int().min(1).max(50).default(10),
  perBucket: z.number().int().min(1).max(50).default(1),
});
const bodySchema = z.union([balancedSchema, topNSchema]);

/**
 * GET  /api/admin/question-generation/balance?buckets=N
 *   Preview the top-N worst-covered subcategories so the UI can show exactly
 *   what a "Balance now" click will enqueue.
 */
export async function GET(req: Request) {
  const gate = await requireSiteAdminResponse();
  if (gate) return gate;

  const { searchParams } = new URL(req.url);
  const bucketsRaw = Number(searchParams.get("buckets") ?? "10");
  const buckets = Number.isFinite(bucketsRaw)
    ? Math.min(Math.max(1, Math.trunc(bucketsRaw)), 50)
    : 10;

  try {
    const gaps = await pickTopGapSubcategoriesGlobal(buckets);
    return NextResponse.json({ buckets: gaps });
  } catch (err) {
    if (isTaxonomyMissingError(err)) {
      return NextResponse.json(
        {
          error: "taxonomy_missing",
          message:
            "Taxonomy tables are missing. Run `npm run db:migrate` (or `npm run db:repair`) to apply migration 0004_question_taxonomy.",
        },
        { status: 503 }
      );
    }
    throw err;
  }
}

/**
 * POST /api/admin/question-generation/balance
 * Body: { buckets?: number, perBucket?: number }
 *
 * Enqueues `perBucket` generation jobs for each of the `buckets` globally
 * worst-covered subcategories. Each job carries the subcategory id so the
 * pipeline prompt is specific to that bucket — this is how we keep the overall
 * pool balanced across categories while we push toward the 10k target.
 */
export async function POST(req: Request) {
  const gate = await requireSiteAdminResponse();
  if (gate) return gate;

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const now = new Date();

  try {
    if ("total" in parsed.data) {
      const picks = await pickBalancedGenerationTargets(parsed.data.total);
      if (picks.length === 0) {
        return NextResponse.json({ enqueued: 0, buckets: [] });
      }
      const values = picks.flatMap((p) =>
        Array.from({ length: p.jobCount }, () => ({
          category: p.categoryLabel,
          topicHint: null as string | null,
          subcategoryId: p.subcategoryId,
          status: "queued",
          step: "queued",
          createdAt: now,
          updatedAt: now,
        })),
      );
      const inserted = await db
        .insert(questionGenerationJobs)
        .values(values)
        .returning({ id: questionGenerationJobs.id });
      return NextResponse.json({
        enqueued: inserted.length,
        buckets: picks.map((p) => ({
          categoryLabel: p.categoryLabel,
          subcategoryLabel: p.subcategoryLabel,
          vettedCount: p.vettedCount,
          targetCount: p.targetCount,
          absoluteGap: Number(p.absoluteGap.toFixed(2)),
          jobsQueued: p.jobCount,
        })),
      });
    }

    const { buckets, perBucket } = parsed.data;
    const gaps = await pickTopGapSubcategoriesGlobal(buckets);
    if (gaps.length === 0) {
      return NextResponse.json({ enqueued: 0, buckets: [] });
    }
    const values = gaps.flatMap((g) =>
      Array.from({ length: perBucket }, () => ({
        category: g.categoryLabel,
        topicHint: null as string | null,
        subcategoryId: g.id,
        status: "queued",
        step: "queued",
        createdAt: now,
        updatedAt: now,
      })),
    );
    const inserted = await db
      .insert(questionGenerationJobs)
      .values(values)
      .returning({ id: questionGenerationJobs.id });
    return NextResponse.json({
      enqueued: inserted.length,
      buckets: gaps.map((g) => ({
        categoryLabel: g.categoryLabel,
        subcategoryLabel: g.label,
        vettedCount: g.vettedCount,
        targetCount: g.targetCount,
        fillRatio: Number(g.fillRatio.toFixed(3)),
        jobsQueued: perBucket,
      })),
    });
  } catch (err) {
    if (isTaxonomyMissingError(err)) {
      return NextResponse.json(
        {
          error: "taxonomy_missing",
          message:
            "Taxonomy tables are missing. Run `npm run db:migrate` (or `npm run db:repair`) first.",
        },
        { status: 503 },
      );
    }
    throw err;
  }
}
