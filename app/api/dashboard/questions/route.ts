import { auth } from "@clerk/nextjs/server";
import { and, eq, ilike, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { questions } from "@/lib/db/schema";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const account = await getAccountByClerkUserId(userId);
  if (!account || account.accountType === "player") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const category = (searchParams.get("category") ?? "").trim();
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "20") || 20));

  const baseFilter = and(eq(questions.vetted, true), eq(questions.retired, false));
  const withCategory = category.length ? and(baseFilter, eq(questions.category, category)) : baseFilter;
  const whereClause = q.length
    ? and(withCategory, or(ilike(questions.body, `%${q}%`), ilike(questions.category, `%${q}%`)))
    : withCategory;

  const rows = await db
    .select({
      id: questions.id,
      body: questions.body,
      category: questions.category,
      subcategory: questions.subcategory,
      difficulty: questions.difficulty,
    })
    .from(questions)
    .where(whereClause)
    .limit(limit);

  return NextResponse.json({ questions: rows });
}
