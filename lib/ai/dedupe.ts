import { and, eq, ilike, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { questionDrafts, questions } from "@/lib/db/schema";

/** @internal Exported only for `dedupe.test.ts`; production code should call the public `dedupeWithinBatchParaphrase` / `duplicateScoreForBody`. */
export function normalizeBodyForDedupe(body: string): string {
  return body
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** ILIKE prefix-style check vs vetted questions and active drafts (substring). */
async function duplicateScoreSnippet(body: string): Promise<number> {
  const snippet = body.trim().slice(0, 48).replace(/%/g, "");
  if (snippet.length < 8) return 0;

  const vetted = await db
    .select({ id: questions.id })
    .from(questions)
    .where(and(eq(questions.vetted, true), eq(questions.retired, false), ilike(questions.body, `%${snippet}%`)))
    .limit(5);

  const drafts = await db
    .select({ id: questionDrafts.id })
    .from(questionDrafts)
    .where(
      and(
        inArray(questionDrafts.status, ["pending_review", "approved"]),
        ilike(questionDrafts.body, `%${snippet}%`)
      )
    )
    .limit(5);

  return Math.min(5, vetted.length + drafts.length);
}

/**
 * When `pg_trgm` is installed (see drizzle migration), returns a richer duplicate signal.
 * Returns null if the query fails (extension missing) so callers can fall back.
 */
async function duplicateScoreTrgm(normalized: string): Promise<number | null> {
  if (normalized.length < 12) return null;
  try {
    const result = await db.execute(sql`
      SELECT (
        (SELECT COUNT(*)::int FROM questions
          WHERE vetted = true AND retired = false
          AND similarity(regexp_replace(lower(body), '[^a-z0-9]+', ' ', 'g'), ${normalized}) > 0.35)
        +
        (SELECT COUNT(*)::int FROM question_drafts
          WHERE status IN ('pending_review', 'approved')
          AND similarity(regexp_replace(lower(body), '[^a-z0-9]+', ' ', 'g'), ${normalized}) > 0.35)
      ) AS c
    `);
    const rows = result.rows as { c: number }[];
    const c = rows[0]?.c;
    return typeof c === "number" ? Math.min(10, c) : null;
  } catch {
    return null;
  }
}

export async function duplicateScoreForBody(body: string): Promise<number> {
  const trgm = await duplicateScoreTrgm(normalizeBodyForDedupe(body));
  if (trgm != null) return trgm;
  return duplicateScoreSnippet(body);
}

/** Counts of similar rows at or above this score should skip human review (see pipeline). */
export function getDuplicateRejectThreshold(): number {
  const raw = process.env.QUESTION_DEDUPE_REJECT_THRESHOLD;
  if (raw === undefined || raw === "") return 1;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 1;
}

/** @internal Exported only for `dedupe.test.ts`; not part of the public dedupe API. */
export function tokenSetForOverlap(body: string): Set<string> {
  const norm = normalizeBodyForDedupe(body);
  return new Set(norm.split(" ").filter((w) => w.length > 2));
}

/** @internal Exported only for `dedupe.test.ts`; not part of the public dedupe API. */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Drops paraphrase duplicates in a single generation batch (exact hash, shared prefix, or high token overlap).
 */
export function dedupeWithinBatchParaphrase<T extends { body: string }>(items: T[]): T[] {
  const out: T[] = [];
  for (const q of items) {
    const k = normalizeBodyForDedupe(q.body);
    if (k.length < 8) continue;
    const tq = tokenSetForOverlap(q.body);
    let dup = false;
    for (const kept of out) {
      if (normalizeBodyForDedupe(q.body) === normalizeBodyForDedupe(kept.body)) {
        dup = true;
        break;
      }
      const kb = normalizeBodyForDedupe(kept.body);
      if (k.slice(0, 48) === kb.slice(0, 48) && k.slice(0, 48).length >= 12) {
        dup = true;
        break;
      }
      if (jaccardSimilarity(tq, tokenSetForOverlap(kept.body)) >= 0.72) {
        dup = true;
        break;
      }
    }
    if (!dup) out.push(q);
  }
  return out;
}
