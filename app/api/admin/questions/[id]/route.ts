import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminResponse } from "@/lib/adminApi";
import { db } from "@/lib/db/client";
import { questions } from "@/lib/db/schema";

const patchSchema = z
  .object({
    body: z.string().min(1).optional(),
    correctAnswer: z.string().min(1).optional(),
    wrongAnswers: z.array(z.string()).length(3).optional(),
    category: z.string().min(1).optional(),
    subcategory: z.string().min(1).optional(),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    timeHint: z.union([z.literal(10), z.literal(20), z.literal(30)]).optional(),
    vetted: z.boolean().optional(),
    retired: z.boolean().optional(),
  })
  .strict();

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminResponse();
  if (gate) return gate;

  const { id } = await ctx.params;
  const rows = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ question: row });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminResponse();
  if (gate) return gate;

  const { id } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [row] = await db.update(questions).set(parsed.data).where(eq(questions.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ question: row });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminResponse();
  if (gate) return gate;

  const { id } = await ctx.params;
  await db.delete(questions).where(eq(questions.id, id));
  return NextResponse.json({ ok: true });
}
