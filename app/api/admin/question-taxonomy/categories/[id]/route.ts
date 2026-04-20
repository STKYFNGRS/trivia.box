import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSiteAdminResponse } from "@/lib/adminApi";
import { db } from "@/lib/db/client";
import { questionCategories } from "@/lib/db/schema";

const patchSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const gate = await requireSiteAdminResponse();
  if (gate) return gate;

  const { id } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updates: Partial<{
    label: string;
    description: string | null;
    sortOrder: number;
    active: boolean;
  }> = {};
  if (parsed.data.label !== undefined) updates.label = parsed.data.label;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.sortOrder !== undefined) updates.sortOrder = parsed.data.sortOrder;
  if (parsed.data.active !== undefined) updates.active = parsed.data.active;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const [row] = await db
    .update(questionCategories)
    .set(updates)
    .where(eq(questionCategories.id, id))
    .returning();

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ category: row });
}
