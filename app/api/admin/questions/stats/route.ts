import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { requireAdminResponse } from "@/lib/adminApi";
import { db } from "@/lib/db/client";
import { questionDrafts, questions } from "@/lib/db/schema";

/**
 * Question-pool aggregate counts for the Admin → Question Studio header.
 *
 * The studio's "Drafts" pill means **AI drafts waiting for a curator to
 * approve or reject** — those live in the `question_drafts` table (what
 * the Review tab renders), not in `questions`. Approved drafts are
 * *inserted* into `questions` with `vetted = true`, so the `questions`
 * table almost never contains unvetted rows and counting it as "drafts"
 * was misleading (the pill reported 0 even right after a 500-item
 * generation run). This endpoint now queries both tables:
 *
 *   `questions` — one round-trip of `COUNT(*) FILTER (WHERE …)`:
 *     - `total`         every row including retired
 *     - `active`        not retired
 *     - `vetted`        vetted & not retired (live in the pool)
 *     - `unvetted`      not vetted & not retired (rare, but counted so
 *                        nothing slips through)
 *     - `retired`       soft-retired, excluded from games
 *     - `byDifficulty`  active split across 1 / 2 / 3
 *
 *   `question_drafts` — one round-trip:
 *     - `drafts.pending`  status = 'pending_review' (what the pill shows)
 *     - `drafts.rejected` status = 'rejected'
 *     - `drafts.approved` status = 'approved'
 *
 * Both queries stay cheap even as the library grows past 10k rows
 * because we're only aggregating. Admin-gated (Clerk admin) — same gate
 * as the rest of `/api/admin/questions`.
 */
export async function GET() {
  const gate = await requireAdminResponse();
  if (gate) return gate;

  const [poolRow, draftsRow] = await Promise.all([
    db
      .select({
        total: sql<number>`COUNT(*)::int`,
        active: sql<number>`COUNT(*) FILTER (WHERE ${questions.retired} = false)::int`,
        vetted: sql<number>`COUNT(*) FILTER (WHERE ${questions.vetted} = true AND ${questions.retired} = false)::int`,
        unvetted: sql<number>`COUNT(*) FILTER (WHERE ${questions.vetted} = false AND ${questions.retired} = false)::int`,
        retired: sql<number>`COUNT(*) FILTER (WHERE ${questions.retired} = true)::int`,
        easy: sql<number>`COUNT(*) FILTER (WHERE ${questions.difficulty} = 1 AND ${questions.retired} = false)::int`,
        medium: sql<number>`COUNT(*) FILTER (WHERE ${questions.difficulty} = 2 AND ${questions.retired} = false)::int`,
        hard: sql<number>`COUNT(*) FILTER (WHERE ${questions.difficulty} = 3 AND ${questions.retired} = false)::int`,
      })
      .from(questions)
      .then((rows) => rows[0]),
    db
      .select({
        pending: sql<number>`COUNT(*) FILTER (WHERE ${questionDrafts.status} = 'pending_review')::int`,
        rejected: sql<number>`COUNT(*) FILTER (WHERE ${questionDrafts.status} = 'rejected')::int`,
        approved: sql<number>`COUNT(*) FILTER (WHERE ${questionDrafts.status} = 'approved')::int`,
      })
      .from(questionDrafts)
      .then((rows) => rows[0]),
  ]);

  return NextResponse.json({
    total: poolRow?.total ?? 0,
    active: poolRow?.active ?? 0,
    vetted: poolRow?.vetted ?? 0,
    unvetted: poolRow?.unvetted ?? 0,
    retired: poolRow?.retired ?? 0,
    byDifficulty: {
      1: poolRow?.easy ?? 0,
      2: poolRow?.medium ?? 0,
      3: poolRow?.hard ?? 0,
    },
    drafts: {
      pending: draftsRow?.pending ?? 0,
      rejected: draftsRow?.rejected ?? 0,
      approved: draftsRow?.approved ?? 0,
    },
  });
}
