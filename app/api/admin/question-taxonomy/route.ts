import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSiteAdminResponse } from "@/lib/adminApi";
import { db } from "@/lib/db/client";
import {
  getActiveTaxonomyTree,
  getTaxonomyTreeAll,
  isTaxonomyMissingError,
} from "@/lib/questionTaxonomy";
import { questionCategories } from "@/lib/db/schema";

const createCategorySchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  label: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().optional().default(0),
  active: z.boolean().optional().default(true),
});

export async function GET(req: Request) {
  const gate = await requireSiteAdminResponse();
  if (gate) return gate;

  const { searchParams } = new URL(req.url);
  const all = searchParams.get("all") === "1";
  try {
    const tree = all ? await getTaxonomyTreeAll() : await getActiveTaxonomyTree();
    return NextResponse.json({ categories: tree });
  } catch (err) {
    if (isTaxonomyMissingError(err)) {
      return NextResponse.json(
        {
          error: "taxonomy_missing",
          message:
            "Taxonomy tables are missing. Run `npm run db:migrate` to apply migration 0004_question_taxonomy.",
          migration: "0004_question_taxonomy",
        },
        { status: 503 }
      );
    }
    throw err;
  }
}

export async function POST(req: Request) {
  const gate = await requireSiteAdminResponse();
  if (gate) return gate;

  const json = await req.json().catch(() => null);
  const parsed = createCategorySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [row] = await db
    .insert(questionCategories)
    .values({
      slug: parsed.data.slug,
      label: parsed.data.label,
      description: parsed.data.description,
      sortOrder: parsed.data.sortOrder,
      active: parsed.data.active,
    })
    .returning();

  if (!row) {
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }
  return NextResponse.json({ category: row });
}
