import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSiteAdminResponse } from "@/lib/adminApi";
import { db } from "@/lib/db/client";
import { questionDrafts } from "@/lib/db/schema";

const ALLOWED_STATUSES = new Set(["pending_review", "rejected", "approved"]);

export async function GET(req: Request) {
  const gate = await requireSiteAdminResponse();
  if (gate) return gate;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "pending_review";
  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const limitRaw = Number(searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 200) : 100;

  // Pending uses createdAt; rejected/approved order by reviewedAt so the
  // review tab shows the operator's most recent decisions first.
  const orderColumn =
    status === "approved" || status === "rejected"
      ? questionDrafts.reviewedAt
      : questionDrafts.createdAt;

  const rows = await db
    .select()
    .from(questionDrafts)
    .where(eq(questionDrafts.status, status))
    .orderBy(desc(orderColumn))
    .limit(limit);

  return NextResponse.json({ drafts: rows });
}
