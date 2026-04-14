import { desc, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdminResponse } from "@/lib/adminApi";
import { db } from "@/lib/db/client";
import { questionFlags } from "@/lib/db/schema";

export async function GET() {
  const gate = await requireAdminResponse();
  if (gate) return gate;

  const rows = await db
    .select()
    .from(questionFlags)
    .where(isNull(questionFlags.resolvedAt))
    .orderBy(desc(questionFlags.createdAt))
    .limit(200);

  return NextResponse.json({ flags: rows });
}
