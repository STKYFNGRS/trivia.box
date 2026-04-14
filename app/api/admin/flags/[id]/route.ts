import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdminResponse } from "@/lib/adminApi";
import { db } from "@/lib/db/client";
import { questionFlags } from "@/lib/db/schema";

export async function PATCH(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminResponse();
  if (gate) return gate;

  const { id } = await ctx.params;
  const [row] = await db
    .update(questionFlags)
    .set({ resolvedAt: new Date() })
    .where(eq(questionFlags.id, id))
    .returning();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ flag: row });
}
