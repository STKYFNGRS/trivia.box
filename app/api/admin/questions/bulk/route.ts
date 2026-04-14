import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminResponse } from "@/lib/adminApi";
import { db } from "@/lib/db/client";
import { questions } from "@/lib/db/schema";

const itemSchema = z.object({
  body: z.string().min(1),
  correctAnswer: z.string().min(1),
  wrongAnswers: z.array(z.string()).length(3),
  category: z.string().min(1),
  subcategory: z.string().min(1),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  timeHint: z.union([z.literal(10), z.literal(20), z.literal(30)]).default(20),
  vetted: z.boolean().default(false),
});

const schema = z.object({
  questions: z.array(itemSchema).min(1).max(500),
});

export async function POST(req: Request) {
  const gate = await requireAdminResponse();
  if (gate) return gate;

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const inserted = await db.transaction(async (tx) => {
    return tx.insert(questions).values(parsed.data.questions).returning({ id: questions.id });
  });

  return NextResponse.json({ inserted: inserted.length });
}
