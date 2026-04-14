import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdminResponse } from "@/lib/adminApi";
import { db } from "@/lib/db/client";
import { questions } from "@/lib/db/schema";

export async function GET() {
  const gate = await requireAdminResponse();
  if (gate) return gate;

  const rows = await db
    .select({
      category: questions.category,
      count: sql<number>`count(*)::int`,
    })
    .from(questions)
    .where(and(eq(questions.vetted, true), eq(questions.retired, false)))
    .groupBy(questions.category);

  return NextResponse.json({ categories: rows });
}
