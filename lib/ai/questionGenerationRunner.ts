import { eq, sql } from "drizzle-orm";
import { runQuestionDraftPipeline } from "@/lib/ai/pipeline";
import { db } from "@/lib/db/client";
import { questionGenerationJobs } from "@/lib/db/schema";
import { getSubcategoryById, pickNextGapSubcategoryForCategoryLabel } from "@/lib/questionTaxonomy";

/** Jobs that have been in `running` longer than this are considered stale and requeued. */
const STALE_RUNNING_MS = 10 * 60 * 1000;

export type JobRunResult = {
  jobId: string;
  draftId?: string;
  error?: string;
  outcome?: string;
};

async function resolvePipelineArgs(job: typeof questionGenerationJobs.$inferSelect): Promise<{
  category: string;
  subcategoryLabel: string | null;
  notesForGeneration: string | null;
}> {
  if (job.subcategoryId) {
    const row = await getSubcategoryById(job.subcategoryId);
    if (!row) {
      throw new Error("Job references missing subcategory");
    }
    if (row.category.label !== job.category) {
      throw new Error("Job category label does not match subcategory parent");
    }
    return {
      category: row.category.label,
      subcategoryLabel: row.label,
      notesForGeneration: row.notesForGeneration,
    };
  }

  const gap = await pickNextGapSubcategoryForCategoryLabel(job.category);
  if (!gap) {
    return {
      category: job.category,
      subcategoryLabel: null,
      notesForGeneration: null,
    };
  }
  return {
    category: gap.categoryLabel,
    subcategoryLabel: gap.label,
    notesForGeneration: gap.notesForGeneration,
  };
}

/**
 * Atomically claim a single queued job using `FOR UPDATE SKIP LOCKED`.
 * Returns the claimed job row (now status=running) or null if none available.
 * Concurrent cron invocations will never claim the same job.
 */
async function claimNextQueuedJob(): Promise<typeof questionGenerationJobs.$inferSelect | null> {
  const rows = await db.execute(sql`
    WITH claimed AS (
      SELECT id
      FROM ${questionGenerationJobs}
      WHERE status = 'queued'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE ${questionGenerationJobs} j
    SET status = 'running', step = 'pipeline', updated_at = now()
    FROM claimed
    WHERE j.id = claimed.id
    RETURNING j.*
  `);
  const r = (rows.rows ?? []) as Array<typeof questionGenerationJobs.$inferSelect>;
  return r[0] ?? null;
}

/** Requeue jobs that have been stuck in `running` for longer than the threshold. */
async function requeueStaleRunningJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS);
  const rows = await db
    .update(questionGenerationJobs)
    .set({ status: "queued", step: "requeued", updatedAt: new Date() })
    .where(
      sql`${questionGenerationJobs.status} = 'running' AND ${questionGenerationJobs.updatedAt} < ${cutoff}`
    )
    .returning({ id: questionGenerationJobs.id });
  return rows.length;
}

export async function processQueuedQuestionGenerationJobs(maxJobs: number): Promise<{
  processed: number;
  results: JobRunResult[];
}> {
  await requeueStaleRunningJobs();

  const results: JobRunResult[] = [];

  for (let i = 0; i < maxJobs; i++) {
    const job = await claimNextQueuedJob();
    if (!job) break;

    try {
      const args = await resolvePipelineArgs(job);
      const out = await runQuestionDraftPipeline({
        category: args.category,
        topicHint: job.topicHint,
        subcategoryLabel: args.subcategoryLabel,
        notesForGeneration: args.notesForGeneration,
      });
      await db
        .update(questionGenerationJobs)
        .set({
          status: "completed",
          step: "done",
          draftId: out.draftId,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(questionGenerationJobs.id, job.id));
      results.push({ jobId: job.id, draftId: out.draftId, outcome: out.outcome });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Pipeline failed";
      await db
        .update(questionGenerationJobs)
        .set({
          status: "failed",
          step: "failed",
          errorMessage: msg.slice(0, 2000),
          updatedAt: new Date(),
        })
        .where(eq(questionGenerationJobs.id, job.id));
      results.push({ jobId: job.id, error: msg });
    }
  }

  return { processed: results.length, results };
}
