import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminResponse } from "@/lib/adminApi";
import { db } from "@/lib/db/client";
import { questions } from "@/lib/db/schema";

const createSchema = z.object({
  body: z.string().min(1),
  correctAnswer: z.string().min(1),
  wrongAnswers: z.array(z.string()).length(3),
  category: z.string().min(1),
  subcategory: z.string().min(1),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  timeHint: z.union([z.literal(10), z.literal(20), z.literal(30)]).default(20),
  vetted: z.boolean().default(false),
});

export async function GET(req: Request) {
  const gate = await requireAdminResponse();
  if (gate) return gate;

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") ?? undefined;
  const vetted = searchParams.get("vetted");
  const difficulty = searchParams.get("difficulty");

  const conditions = [];
  if (category) conditions.push(eq(questions.category, category));
  if (vetted === "true") conditions.push(eq(questions.vetted, true));
  if (vetted === "false") conditions.push(eq(questions.vetted, false));
  if (difficulty) {
    const d = Number(difficulty);
    if (d === 1 || d === 2 || d === 3) {
      conditions.push(eq(questions.difficulty, d));
    }
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(questions)
    .where(where)
    .orderBy(desc(questions.createdAt))
    .limit(200);

  return NextResponse.json({ questions: rows });
}

export async function POST(req: Request) {
  const gate = await requireAdminResponse();
  if (gate) return gate;

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [row] = await db.insert(questions).values(parsed.data).returning();
  return NextResponse.json({ question: row });
}
