import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSiteAdminResponse } from "@/lib/adminApi";
import { db } from "@/lib/db/client";
import { questionSubcategories } from "@/lib/db/schema";

const createSchema = z.object({
  categoryId: z.string().uuid(),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  label: z.string().min(1).max(120),
  notesForGeneration: z.string().max(2000).nullable().optional(),
  sortOrder: z.number().int().optional().default(0),
  active: z.boolean().optional().default(true),
  targetCount: z.number().int().positive().nullable().optional(),
});

export async function POST(req: Request) {
  const gate = await requireSiteAdminResponse();
  if (gate) return gate;

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [row] = await db
    .insert(questionSubcategories)
    .values({
      categoryId: parsed.data.categoryId,
      slug: parsed.data.slug,
      label: parsed.data.label,
      notesForGeneration: parsed.data.notesForGeneration ?? null,
      sortOrder: parsed.data.sortOrder,
      active: parsed.data.active,
      targetCount: parsed.data.targetCount ?? null,
    })
    .returning();

  if (!row) {
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }
  return NextResponse.json({ subcategory: row });
}
