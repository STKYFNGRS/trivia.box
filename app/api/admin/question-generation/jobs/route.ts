import { count, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSiteAdminResponse } from "@/lib/adminApi";
import { db } from "@/lib/db/client";
import { questionGenerationJobs } from "@/lib/db/schema";
import { getCategoryLabels, validateSubcategoryForCategoryLabel } from "@/lib/questionTaxonomy";

const batchSchema = z.object({
  category: z.string().min(1).max(120),
  topicHint: z.string().max(200).optional(),
  count: z.number().int().min(1).max(500),
  subcategoryId: z.string().uuid().optional(),
});

const enqueueSchema = z.object({
  batches: z.array(batchSchema).min(1).max(50),
});

/** Hard cap on jobs enqueued in a single POST. Raised from 200 so a single
 *  Generate click can queue up to 500 jobs while still bounding the payload. */
const MAX_JOBS_PER_REQUEST = 1000;

export async function GET() {
  const gate = await requireSiteAdminResponse();
  if (gate) return gate;

  const [queuedN] = await db
    .select({ c: count() })
    .from(questionGenerationJobs)
    .where(eq(questionGenerationJobs.status, "queued"));

  const [runningN] = await db
    .select({ c: count() })
    .from(questionGenerationJobs)
    .where(eq(questionGenerationJobs.status, "running"));

  const [failedN] = await db
    .select({ c: count() })
    .from(questionGenerationJobs)
    .where(eq(questionGenerationJobs.status, "failed"));

  const [completedN] = await db
    .select({ c: count() })
    .from(questionGenerationJobs)
    .where(eq(questionGenerationJobs.status, "completed"));

  const [totalRow] = await db.select({ c: count() }).from(questionGenerationJobs);

  const recentFailures = await db
    .select({
      id: questionGenerationJobs.id,
      errorMessage: questionGenerationJobs.errorMessage,
      updatedAt: questionGenerationJobs.updatedAt,
    })
    .from(questionGenerationJobs)
    .where(eq(questionGenerationJobs.status, "failed"))
    .orderBy(desc(questionGenerationJobs.updatedAt))
    .limit(5);

  return NextResponse.json({
    counts: {
      queued: Number(queuedN?.c ?? 0),
      running: Number(runningN?.c ?? 0),
      failed: Number(failedN?.c ?? 0),
      completed: Number(completedN?.c ?? 0),
      total: Number(totalRow?.c ?? 0),
    },
    recentFailures,
  });
}

export async function POST(req: Request) {
  const gate = await requireSiteAdminResponse();
  if (gate) return gate;

  const json = await req.json().catch(() => null);
  const parsed = enqueueSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const labels = await getCategoryLabels();
  if (labels.length === 0) {
    return NextResponse.json(
      { error: "Question taxonomy is empty. Run migration 0004_question_taxonomy." },
      { status: 503 }
    );
  }

  for (const b of parsed.data.batches) {
    if (!labels.includes(b.category)) {
      return NextResponse.json({ error: `Unknown category: ${b.category}` }, { status: 400 });
    }
    if (b.subcategoryId) {
      const ok = await validateSubcategoryForCategoryLabel(b.subcategoryId, b.category);
      if (!ok) {
        return NextResponse.json(
          { error: "subcategoryId does not match category or is inactive" },
          { status: 400 }
        );
      }
    }
  }

  const now = new Date();
  const values: {
    category: string;
    topicHint: string | null;
    subcategoryId: string | null;
    status: string;
    step: string;
    createdAt: Date;
    updatedAt: Date;
  }[] = [];

  for (const b of parsed.data.batches) {
    for (let i = 0; i < b.count; i += 1) {
      values.push({
        category: b.category,
        topicHint: b.topicHint ?? null,
        subcategoryId: b.subcategoryId ?? null,
        status: "queued",
        step: "queued",
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  if (values.length > MAX_JOBS_PER_REQUEST) {
    return NextResponse.json(
      { error: `Too many jobs in one request (max ${MAX_JOBS_PER_REQUEST})` },
      { status: 400 }
    );
  }

  const inserted = await db.insert(questionGenerationJobs).values(values).returning({ id: questionGenerationJobs.id });

  return NextResponse.json({ enqueued: inserted.length, jobIds: inserted.map((r) => r.id) });
}
