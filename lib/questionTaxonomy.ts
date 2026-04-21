import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  questionCategories,
  questionDrafts,
  questionSubcategories,
  questions,
} from "@/lib/db/schema";

export type TaxonomyCategoryRow = typeof questionCategories.$inferSelect;
export type TaxonomySubcategoryRow = typeof questionSubcategories.$inferSelect;

/**
 * Returns true when the underlying error is "taxonomy tables are missing"
 * (i.e. migration `0004_question_taxonomy` has not been applied). Routes use
 * this to surface a friendly 503 + migration hint instead of crashing the
 * admin page.
 */
export function isTaxonomyMissingError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const maybe = err as { code?: unknown; message?: unknown };
  // Postgres "undefined_table" error code.
  if (maybe.code === "42P01") return true;
  if (typeof maybe.message === "string") {
    const m = maybe.message.toLowerCase();
    return (
      m.includes("question_categories") && m.includes("does not exist")
    ) || (m.includes("question_subcategories") && m.includes("does not exist"));
  }
  return false;
}

export type TaxonomyCategoryDTO = TaxonomyCategoryRow & {
  subcategories: TaxonomySubcategoryRow[];
};

/** Active categories with nested subcategories for generation UI and prompts. */
export async function getActiveTaxonomyTree(): Promise<TaxonomyCategoryDTO[]> {
  const cats = await db
    .select()
    .from(questionCategories)
    .where(eq(questionCategories.active, true))
    .orderBy(asc(questionCategories.sortOrder), asc(questionCategories.label));

  if (cats.length === 0) return [];

  const subs = await db
    .select()
    .from(questionSubcategories)
    .where(eq(questionSubcategories.active, true))
    .orderBy(asc(questionSubcategories.sortOrder), asc(questionSubcategories.label));

  const byCat = new Map<string, TaxonomySubcategoryRow[]>();
  for (const s of subs) {
    const arr = byCat.get(s.categoryId) ?? [];
    arr.push(s);
    byCat.set(s.categoryId, arr);
  }

  return cats.map((c) => ({
    ...c,
    subcategories: byCat.get(c.id) ?? [],
  }));
}

/** Full tree including inactive rows (admin taxonomy editor). */
export async function getTaxonomyTreeAll(): Promise<TaxonomyCategoryDTO[]> {
  const cats = await db
    .select()
    .from(questionCategories)
    .orderBy(asc(questionCategories.sortOrder), asc(questionCategories.label));

  const subs = await db
    .select()
    .from(questionSubcategories)
    .orderBy(asc(questionSubcategories.sortOrder), asc(questionSubcategories.label));

  const byCat = new Map<string, TaxonomySubcategoryRow[]>();
  for (const s of subs) {
    const arr = byCat.get(s.categoryId) ?? [];
    arr.push(s);
    byCat.set(s.categoryId, arr);
  }

  return cats.map((c) => ({
    ...c,
    subcategories: byCat.get(c.id) ?? [],
  }));
}

export async function getCategoryLabels(): Promise<string[]> {
  const rows = await db
    .select({ label: questionCategories.label })
    .from(questionCategories)
    .where(eq(questionCategories.active, true))
    .orderBy(asc(questionCategories.sortOrder), asc(questionCategories.label));
  return rows.map((r) => r.label);
}

export async function getSubcategoryById(id: string): Promise<
  | (TaxonomySubcategoryRow & { category: TaxonomyCategoryRow })
  | undefined
> {
  const [sub] = await db.select().from(questionSubcategories).where(eq(questionSubcategories.id, id)).limit(1);
  if (!sub) return undefined;
  const [cat] = await db
    .select()
    .from(questionCategories)
    .where(eq(questionCategories.id, sub.categoryId))
    .limit(1);
  if (!cat) return undefined;
  return { ...sub, category: cat };
}

/** Validates that subcategory belongs to category when both refer to DB rows (by label match for category string). */
export async function validateSubcategoryForCategoryLabel(
  subcategoryId: string,
  categoryLabel: string
): Promise<boolean> {
  const row = await getSubcategoryById(subcategoryId);
  if (!row) return false;
  return row.category.label === categoryLabel && row.category.active && row.active;
}

export type CoverageRow = {
  subcategoryId: string;
  categoryLabel: string;
  subcategoryLabel: string;
  targetCount: number | null;
  vettedCount: number;
  pendingDraftCount: number;
  approvedDraftCount: number;
  /** Lower is higher priority for generation (coverage gap). */
  fillRatio: number;
};

/**
 * Aggregates per-subcategory vetted + draft counts for the coverage UI and
 * gap picking, in ONE round-trip.
 *
 * Earlier versions looped over every (category, subcategory) tuple and issued
 * three sequential `SELECT COUNT(*)` queries per bucket. With 84 active
 * subcategories that was 252 round-trips against Neon serverless — observed
 * durations of **150–188 seconds per coverage request** in dev, which
 * effectively hung the admin taxonomy page. This version pre-aggregates
 * questions + drafts in two small subqueries and LEFT JOINs them to the
 * taxonomy, so the total cost is one roundtrip even as the taxonomy grows.
 */
export async function getSubcategoryCoverage(): Promise<CoverageRow[]> {
  const rows = await db.execute<{
    subcategory_id: string;
    category_label: string;
    subcategory_label: string;
    target_count: number | null;
    vetted_count: number | string | null;
    pending_count: number | string | null;
    approved_count: number | string | null;
  }>(sql`
    SELECT
      qs.id                             AS subcategory_id,
      qc.label                          AS category_label,
      qs.label                          AS subcategory_label,
      qs.target_count                   AS target_count,
      COALESCE(v.c, 0)::int             AS vetted_count,
      COALESCE(p.c, 0)::int             AS pending_count,
      COALESCE(a.c, 0)::int             AS approved_count
    FROM ${questionSubcategories} qs
    JOIN ${questionCategories} qc ON qc.id = qs.category_id
    LEFT JOIN (
      SELECT category, subcategory, COUNT(*)::int AS c
      FROM ${questions}
      WHERE vetted = true AND retired = false
      GROUP BY category, subcategory
    ) v ON v.category = qc.label AND v.subcategory = qs.label
    LEFT JOIN (
      SELECT category, subcategory, COUNT(*)::int AS c
      FROM ${questionDrafts}
      WHERE status = 'pending_review'
      GROUP BY category, subcategory
    ) p ON p.category = qc.label AND p.subcategory = qs.label
    LEFT JOIN (
      SELECT category, subcategory, COUNT(*)::int AS c
      FROM ${questionDrafts}
      WHERE status = 'approved'
      GROUP BY category, subcategory
    ) a ON a.category = qc.label AND a.subcategory = qs.label
    WHERE qc.active = true AND qs.active = true
  `);

  const list = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? []) as Array<{
    subcategory_id: string;
    category_label: string;
    subcategory_label: string;
    target_count: number | null;
    vetted_count: number | string | null;
    pending_count: number | string | null;
    approved_count: number | string | null;
  }>;

  const out: CoverageRow[] = list.map((r) => {
    const vettedCount = Number(r.vetted_count ?? 0);
    const pendingDraftCount = Number(r.pending_count ?? 0);
    const approvedDraftCount = Number(r.approved_count ?? 0);
    const target = r.target_count;
    const denom = target && target > 0 ? target : 1;
    const numerator = vettedCount + approvedDraftCount * 0.25 + pendingDraftCount * 0.1;
    const fillRatio = numerator / denom;
    return {
      subcategoryId: r.subcategory_id,
      categoryLabel: r.category_label,
      subcategoryLabel: r.subcategory_label,
      targetCount: target,
      vettedCount,
      pendingDraftCount,
      approvedDraftCount,
      fillRatio,
    };
  });

  return out.sort((a, b) => a.fillRatio - b.fillRatio || a.vettedCount - b.vettedCount);
}

/**
 * Picks the subcategory with the lowest coverage ratio under the given category label.
 * Returns null if category unknown or no subcategories.
 */
export async function pickNextGapSubcategoryForCategoryLabel(
  categoryLabel: string
): Promise<{ id: string; label: string; notesForGeneration: string | null; categoryLabel: string } | null> {
  const rows = await getSubcategoryCoverage();
  const first = rows.find((r) => r.categoryLabel === categoryLabel);
  if (!first) return null;
  const sub = await getSubcategoryById(first.subcategoryId);
  if (!sub) return null;
  return {
    id: sub.id,
    label: sub.label,
    notesForGeneration: sub.notesForGeneration,
    categoryLabel: sub.category.label,
  };
}

/** Global worst bucket across all categories (for “fill next gap” without a category pre-select). */
export async function pickNextGapSubcategoryGlobal(): Promise<{
  id: string;
  label: string;
  notesForGeneration: string | null;
  categoryLabel: string;
} | null> {
  const rows = await getSubcategoryCoverage();
  const first = rows[0];
  if (!first) return null;
  const sub = await getSubcategoryById(first.subcategoryId);
  if (!sub) return null;
  return {
    id: sub.id,
    label: sub.label,
    notesForGeneration: sub.notesForGeneration,
    categoryLabel: sub.category.label,
  };
}

export type UnmappedBucket = {
  /** Category label as stored on `questions.category`. May or may not match an active taxonomy category. */
  categoryLabel: string;
  /** Subcategory label as stored on `questions.subcategory`. Does NOT match any active subcategory in the taxonomy. */
  subcategoryLabel: string;
  /** How many vetted, non-retired question rows carry this tuple. */
  vettedCount: number;
  /** True when `categoryLabel` matches an active taxonomy category. Lets the UI offer "Add as subcategory" only when it makes sense. */
  categoryExists: boolean;
};

/**
 * Returns vetted questions grouped by (category, subcategory) whose subcategory
 * label has NO match in the active taxonomy. These rows are invisible to
 * coverage bars (the coverage query requires an exact subcategory match), so
 * the admin UI shows them in a dedicated "Unmapped" panel and offers one-click
 * remap / add-as-subcategory actions.
 *
 * We intentionally scope this to `vetted=true AND retired=false` so the panel
 * matches the question set that coverage SHOULD be counting.
 */
export async function getUnmappedVettedBuckets(): Promise<UnmappedBucket[]> {
  const rows = await db
    .select({
      category: questions.category,
      subcategory: questions.subcategory,
      vettedCount: count(),
    })
    .from(questions)
    .where(
      and(
        eq(questions.vetted, true),
        eq(questions.retired, false),
        // Subcategory text has no matching (active) taxonomy row under any
        // active category. Left as raw SQL because Drizzle's `notExists`
        // helper doesn't interoperate cleanly with the correlated category
        // label comparison.
        sql`NOT EXISTS (
          SELECT 1 FROM ${questionSubcategories} qs
          JOIN ${questionCategories} qc ON qc.id = qs.category_id
          WHERE qc.label = ${questions.category}
            AND qs.label = ${questions.subcategory}
            AND qc.active = true
            AND qs.active = true
        )`
      )
    )
    .groupBy(questions.category, questions.subcategory)
    .orderBy(desc(count()), asc(questions.category), asc(questions.subcategory));

  if (rows.length === 0) return [];

  const activeCats = await db
    .select({ label: questionCategories.label })
    .from(questionCategories)
    .where(eq(questionCategories.active, true));
  const activeCatSet = new Set(activeCats.map((c) => c.label));

  return rows.map((r) => ({
    categoryLabel: r.category,
    subcategoryLabel: r.subcategory,
    vettedCount: Number(r.vettedCount ?? 0),
    categoryExists: activeCatSet.has(r.category),
  }));
}

/**
 * Returns the top-N globally worst-covered subcategories (lowest fillRatio first).
 * Used by the "auto-balance" generation feature to enqueue one job per bucket
 * across the N worst-covered buckets in a single click.
 */
export async function pickTopGapSubcategoriesGlobal(
  n: number
): Promise<
  Array<{
    id: string;
    label: string;
    notesForGeneration: string | null;
    categoryLabel: string;
    fillRatio: number;
    vettedCount: number;
    targetCount: number | null;
  }>
> {
  if (n <= 0) return [];
  const rows = await getSubcategoryCoverage();
  const top = rows.slice(0, n);
  if (top.length === 0) return [];

  // Fetch subcategory rows (for notesForGeneration) in one pass.
  const ids = top.map((r) => r.subcategoryId);
  const subs = await db
    .select()
    .from(questionSubcategories)
    .where(inArray(questionSubcategories.id, ids));
  const notesById = new Map(subs.map((s) => [s.id, s.notesForGeneration] as const));

  return top.map((r) => ({
    id: r.subcategoryId,
    label: r.subcategoryLabel,
    notesForGeneration: notesById.get(r.subcategoryId) ?? null,
    categoryLabel: r.categoryLabel,
    fillRatio: r.fillRatio,
    vettedCount: r.vettedCount,
    targetCount: r.targetCount,
  }));
}

/**
 * Pure allocation helper used by "Generate random" to spread `totalJobs`
 * across every under-target bucket. Isolated from the DB so we can unit-test
 * the math without Neon.
 *
 * Allocation strategy — designed to fix the "5 whole categories stay at 0
 * coverage because the top-50 worst list happens not to include them" bug:
 *
 *   1. **Category fairness pass.** Before any proportional allocation, give
 *      one job to the highest-gap subcategory in EACH distinct category that
 *      has at least one under-target bucket. If we run out of jobs here,
 *      categories with the largest gaps win the tie (so a fresh click never
 *      silently ignores Nature / Technology / Wordplay just because their
 *      slug sort order happens to be last).
 *   2. **Proportional remainder pass.** Remaining `totalJobs - K` are spread
 *      across every under-target bucket proportional to `absoluteGap`, using
 *      largest-remainder rounding so counts sum EXACTLY to `totalJobs` even
 *      for awkward inputs like 7 jobs over 3 buckets.
 *
 * Returns a map of `bucket.id -> jobCount`. Zero-count entries are omitted.
 */
export function allocateJobsByGap<
  T extends { id: string; categoryLabel: string; absoluteGap: number },
>(totalJobs: number, buckets: T[]): Map<string, number> {
  const out = new Map<string, number>();
  if (totalJobs <= 0 || buckets.length === 0) return out;

  const eligible = buckets.filter((b) => b.absoluteGap > 0);
  if (eligible.length === 0) return out;

  let remaining = totalJobs;

  const worstByCategory = new Map<string, T>();
  for (const b of eligible) {
    const cur = worstByCategory.get(b.categoryLabel);
    if (!cur || b.absoluteGap > cur.absoluteGap) worstByCategory.set(b.categoryLabel, b);
  }
  const categoryReps = [...worstByCategory.values()].sort(
    (a, b) => b.absoluteGap - a.absoluteGap,
  );
  for (const rep of categoryReps) {
    if (remaining <= 0) break;
    out.set(rep.id, 1);
    remaining -= 1;
  }

  if (remaining <= 0) return out;

  const totalGap = eligible.reduce((s, b) => s + b.absoluteGap, 0);
  if (totalGap <= 0) return out;

  const shares = eligible.map((b) => {
    const exact = (b.absoluteGap / totalGap) * remaining;
    const base = Math.floor(exact);
    return { bucket: b, base, frac: exact - base };
  });
  let allocated = shares.reduce((s, e) => s + e.base, 0);
  const sortedByFrac = [...shares].sort((a, b) => b.frac - a.frac);
  let idx = 0;
  while (allocated < remaining && idx < sortedByFrac.length) {
    sortedByFrac[idx].base += 1;
    allocated += 1;
    idx += 1;
  }

  for (const e of shares) {
    if (e.base <= 0) continue;
    const prior = out.get(e.bucket.id) ?? 0;
    out.set(e.bucket.id, prior + e.base);
  }

  return out;
}

/**
 * DB-facing counterpart to {@link allocateJobsByGap}. Loads current coverage,
 * computes each bucket's absolute gap (using the same vetted + 25% approved +
 * 10% pending numerator as {@link getSubcategoryCoverage} for consistency),
 * and returns one record per bucket that should get at least one generation
 * job — with the per-bucket `jobCount` baked in.
 *
 * This is the primary entry point the admin UI's "Generate N (random)" click
 * should call. It guarantees that if any category has an under-target bucket,
 * that category shows up in the enqueue list on every click (as long as
 * `totalJobs >= number of categories-with-gaps`).
 */
export async function pickBalancedGenerationTargets(totalJobs: number): Promise<
  Array<{
    subcategoryId: string;
    categoryLabel: string;
    subcategoryLabel: string;
    notesForGeneration: string | null;
    vettedCount: number;
    targetCount: number | null;
    absoluteGap: number;
    jobCount: number;
  }>
> {
  if (totalJobs <= 0) return [];
  const coverage = await getSubcategoryCoverage();
  if (coverage.length === 0) return [];

  const buckets = coverage.map((r) => {
    const target = r.targetCount ?? 0;
    const credit =
      r.vettedCount + r.approvedDraftCount * 0.25 + r.pendingDraftCount * 0.1;
    return {
      id: r.subcategoryId,
      categoryLabel: r.categoryLabel,
      subcategoryLabel: r.subcategoryLabel,
      vettedCount: r.vettedCount,
      targetCount: r.targetCount,
      absoluteGap: Math.max(0, target - credit),
    };
  });

  const allocation = allocateJobsByGap(totalJobs, buckets);
  if (allocation.size === 0) return [];

  const picked = buckets.filter((b) => (allocation.get(b.id) ?? 0) > 0);
  const ids = picked.map((b) => b.id);
  const subs = await db
    .select()
    .from(questionSubcategories)
    .where(inArray(questionSubcategories.id, ids));
  const notesById = new Map(subs.map((s) => [s.id, s.notesForGeneration] as const));

  return picked.map((b) => ({
    subcategoryId: b.id,
    categoryLabel: b.categoryLabel,
    subcategoryLabel: b.subcategoryLabel,
    notesForGeneration: notesById.get(b.id) ?? null,
    vettedCount: b.vettedCount,
    targetCount: b.targetCount,
    absoluteGap: b.absoluteGap,
    jobCount: allocation.get(b.id) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Difficulty balance (1 = easy / 2 = medium / 3 = hard)
//
// Before this helper existed, the LLM decided the difficulty of every
// question on its own and the app just validated the shape — that's how
// the pool ended up at 1 easy / 161 medium / 18 hard. We now steer every
// generation run toward whichever bucket is furthest behind a 1/3-1/3-1/3
// split, scoped to the category+subcategory the run is targeting so each
// subcategory independently converges on balanced coverage.
// ---------------------------------------------------------------------------

export type DifficultyCounts = Record<1 | 2 | 3, number>;

const ZERO_DIFFICULTY_COUNTS: DifficultyCounts = { 1: 0, 2: 0, 3: 0 };

/**
 * Count non-retired questions + in-flight drafts by difficulty, scoped to
 * an optional category / subcategory pair. Drafts are weighted the same
 * way [`pickBalancedGenerationTargets`](#pickBalancedGenerationTargets)
 * weights them (approved = 0.25, pending_review = 0.1) so the allocator
 * doesn't keep generating for a bucket that already has a queue waiting
 * on review.
 *
 * Falls back to all-zero counts if the `question_drafts` or `questions`
 * tables don't exist yet (fresh clone before migrations), so callers can
 * call this unconditionally during bootstrap.
 */
export async function getDifficultyCoverage(scope: {
  categoryLabel?: string | null;
  subcategoryLabel?: string | null;
}): Promise<DifficultyCounts> {
  const conditions = [eq(questions.retired, false)] as ReturnType<typeof eq>[];
  if (scope.categoryLabel) {
    conditions.push(eq(questions.category, scope.categoryLabel));
  }
  if (scope.subcategoryLabel) {
    conditions.push(eq(questions.subcategory, scope.subcategoryLabel));
  }

  const vettedCounts: DifficultyCounts = { ...ZERO_DIFFICULTY_COUNTS };
  try {
    const rows = await db
      .select({
        difficulty: questions.difficulty,
        c: count(),
      })
      .from(questions)
      .where(and(...conditions))
      .groupBy(questions.difficulty);
    for (const r of rows) {
      if (r.difficulty === 1 || r.difficulty === 2 || r.difficulty === 3) {
        vettedCounts[r.difficulty] = r.c;
      }
    }
  } catch (err) {
    if (!isTaxonomyMissingError(err)) throw err;
  }

  const draftConditions = [] as ReturnType<typeof eq>[];
  if (scope.categoryLabel) {
    draftConditions.push(eq(questionDrafts.category, scope.categoryLabel));
  }
  if (scope.subcategoryLabel) {
    draftConditions.push(eq(questionDrafts.subcategory, scope.subcategoryLabel));
  }

  // Pending + approved drafts, weighted the same way pickBalancedGenerationTargets does.
  const draftCredit: DifficultyCounts = { ...ZERO_DIFFICULTY_COUNTS };
  try {
    const rows = await db
      .select({
        difficulty: questionDrafts.difficulty,
        status: questionDrafts.status,
        c: count(),
      })
      .from(questionDrafts)
      .where(draftConditions.length ? and(...draftConditions) : undefined)
      .groupBy(questionDrafts.difficulty, questionDrafts.status);
    for (const r of rows) {
      if (r.difficulty !== 1 && r.difficulty !== 2 && r.difficulty !== 3) continue;
      const weight =
        r.status === "approved" ? 0.25 : r.status === "pending_review" ? 0.1 : 0;
      if (weight === 0) continue;
      draftCredit[r.difficulty] += r.c * weight;
    }
  } catch (err) {
    if (!isTaxonomyMissingError(err)) throw err;
  }

  return {
    1: vettedCounts[1] + draftCredit[1],
    2: vettedCounts[2] + draftCredit[2],
    3: vettedCounts[3] + draftCredit[3],
  };
}

/**
 * Return the difficulty (1=easy, 2=medium, 3=hard) that's furthest below
 * a 1/3-1/3-1/3 split inside the given scope. Ties are broken at random
 * so a pool that's already balanced doesn't always get fed the same
 * difficulty first. Empty scope (no questions or drafts yet) also falls
 * back to a random pick so initial runs don't deterministically skew.
 *
 * Called by the generation runner on every `pipeline.runSingle` so the
 * LLM is asked for a *specific* difficulty on every generation (see
 * [`lib/ai/pipeline.ts`](./ai/pipeline.ts)).
 */
export async function pickNeediestDifficulty(scope: {
  categoryLabel?: string | null;
  subcategoryLabel?: string | null;
}): Promise<1 | 2 | 3> {
  const counts = await getDifficultyCoverage(scope);
  const total = counts[1] + counts[2] + counts[3];

  const levels: Array<1 | 2 | 3> = [1, 2, 3];
  if (total <= 0) {
    return levels[Math.floor(Math.random() * 3)];
  }

  const target = total / 3;
  const deficits = levels.map((lvl) => ({
    lvl,
    deficit: target - counts[lvl],
  }));
  const maxDeficit = Math.max(...deficits.map((d) => d.deficit));
  // Anything within half a question of the max is treated as tied — avoids
  // ping-pong when two difficulties are essentially neck-and-neck.
  const tied = deficits.filter((d) => maxDeficit - d.deficit < 0.5);
  const pick = tied[Math.floor(Math.random() * tied.length)];
  return pick.lvl;
}
