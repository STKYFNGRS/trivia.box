import { and, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSiteAdminResponse } from "@/lib/adminApi";
import { db } from "@/lib/db/client";
import {
  questionCategories,
  questionSubcategories,
  questions,
} from "@/lib/db/schema";
import { slugifyText } from "@/lib/slug";

/**
 * Admin ops endpoint for the taxonomy editor's "Unmapped questions" panel.
 *
 * Three actions:
 *
 * - `adopt`: create a new active subcategory in `categoryLabel` using
 *   `subcategoryLabel` verbatim. Makes the orphaned questions show up under
 *   their existing bucket without mutating their rows. Useful when the label
 *   is worth keeping as-is ("WWII", "Baseball", etc.).
 *
 * - `remap`: bulk-update all vetted, non-retired questions with
 *   `(category, subcategory) = (fromCategory, fromSubcategory)` to the
 *   destination tuple, which MUST already exist and be active. Useful when
 *   the existing taxonomy already has a superset bucket (e.g. "WWII" →
 *   "World wars & conflicts").
 *
 * - `remap_custom`: create-or-reuse an active subcategory with a free-text
 *   label under `toCategory`, then bulk-update matching question rows into
 *   it. This is the "type your own destination" path — lets the admin spell
 *   out exactly where the questions should land ("History / WWII era" or
 *   "Sports / Cycling" under a fresh subcategory) without first creating
 *   the subcategory in a separate step.
 *
 * All actions return a count so the UI can toast a confirmation.
 */

const adoptSchema = z.object({
  action: z.literal("adopt"),
  categoryLabel: z.string().min(1).max(120),
  subcategoryLabel: z.string().min(1).max(120),
});

const remapSchema = z.object({
  action: z.literal("remap"),
  fromCategory: z.string().min(1).max(120),
  fromSubcategory: z.string().min(1).max(120),
  toCategory: z.string().min(1).max(120),
  toSubcategory: z.string().min(1).max(120),
});

const remapCustomSchema = z.object({
  action: z.literal("remap_custom"),
  fromCategory: z.string().min(1).max(120),
  fromSubcategory: z.string().min(1).max(120),
  toCategory: z.string().min(1).max(120),
  toSubcategoryLabel: z.string().min(1).max(120),
});

const schema = z.discriminatedUnion("action", [
  adoptSchema,
  remapSchema,
  remapCustomSchema,
]);

function slugify(input: string): string {
  return slugifyText(input, { maxLength: 64, fallback: "subcategory" });
}

async function pickUniqueSlug(categoryId: string, base: string): Promise<string> {
  const existing = await db
    .select({ slug: questionSubcategories.slug })
    .from(questionSubcategories)
    .where(eq(questionSubcategories.categoryId, categoryId));
  const taken = new Set(existing.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`.slice(0, 64);
    if (!taken.has(candidate)) return candidate;
  }
  // Fall back to a timestamp-suffixed slug if something truly pathological.
  return `${base}-${Date.now()}`.slice(0, 64);
}

export async function POST(req: Request) {
  const gate = await requireSiteAdminResponse();
  if (gate) return gate;

  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.action === "adopt") {
    const { categoryLabel, subcategoryLabel } = parsed.data;

    const [category] = await db
      .select()
      .from(questionCategories)
      .where(
        and(
          eq(questionCategories.label, categoryLabel),
          eq(questionCategories.active, true)
        )
      )
      .limit(1);
    if (!category) {
      return NextResponse.json(
        { error: `No active category with label ${JSON.stringify(categoryLabel)}` },
        { status: 400 }
      );
    }

    const [existing] = await db
      .select()
      .from(questionSubcategories)
      .where(
        and(
          eq(questionSubcategories.categoryId, category.id),
          eq(questionSubcategories.label, subcategoryLabel)
        )
      )
      .limit(1);

    if (existing) {
      if (!existing.active) {
        await db
          .update(questionSubcategories)
          .set({ active: true })
          .where(eq(questionSubcategories.id, existing.id));
      }
      const adoptedCount = await countVettedForTuple(categoryLabel, subcategoryLabel);
      return NextResponse.json({
        subcategory: { ...existing, active: true },
        adoptedCount,
        created: false,
      });
    }

    const slug = await pickUniqueSlug(category.id, slugify(subcategoryLabel));
    const [inserted] = await db
      .insert(questionSubcategories)
      .values({
        categoryId: category.id,
        slug,
        label: subcategoryLabel,
        active: true,
        sortOrder: 0,
        targetCount: null,
        notesForGeneration: null,
      })
      .returning();

    if (!inserted) {
      return NextResponse.json({ error: "Insert failed" }, { status: 500 });
    }

    const adoptedCount = await countVettedForTuple(categoryLabel, subcategoryLabel);
    return NextResponse.json({
      subcategory: inserted,
      adoptedCount,
      created: true,
    });
  }

  if (parsed.data.action === "remap") {
    const { fromCategory, fromSubcategory, toCategory, toSubcategory } = parsed.data;

    // Require the destination to exist + be active, so we don't accidentally
    // create a second orphan tuple on remap.
    const [destCategory] = await db
      .select()
      .from(questionCategories)
      .where(
        and(
          eq(questionCategories.label, toCategory),
          eq(questionCategories.active, true)
        )
      )
      .limit(1);
    if (!destCategory) {
      return NextResponse.json(
        { error: `Destination category ${JSON.stringify(toCategory)} is not active` },
        { status: 400 }
      );
    }
    const [destSub] = await db
      .select()
      .from(questionSubcategories)
      .where(
        and(
          eq(questionSubcategories.categoryId, destCategory.id),
          eq(questionSubcategories.label, toSubcategory),
          eq(questionSubcategories.active, true)
        )
      )
      .limit(1);
    if (!destSub) {
      return NextResponse.json(
        {
          error: `Destination subcategory ${JSON.stringify(toSubcategory)} is not active under ${JSON.stringify(toCategory)}`,
        },
        { status: 400 }
      );
    }

    const result = await db
      .update(questions)
      .set({ category: toCategory, subcategory: toSubcategory })
      .where(
        and(
          eq(questions.category, fromCategory),
          eq(questions.subcategory, fromSubcategory)
        )
      )
      .returning({ id: questions.id });

    return NextResponse.json({
      movedCount: result.length,
      from: { category: fromCategory, subcategory: fromSubcategory },
      to: { category: toCategory, subcategory: toSubcategory },
    });
  }

  // remap_custom: destination label is free text; we create-or-reuse the
  // subcategory row so the questions land in a valid taxonomy bucket rather
  // than a new orphan tuple.
  const { fromCategory, fromSubcategory, toCategory, toSubcategoryLabel } = parsed.data;

  const [destCategory] = await db
    .select()
    .from(questionCategories)
    .where(
      and(
        eq(questionCategories.label, toCategory),
        eq(questionCategories.active, true)
      )
    )
    .limit(1);
  if (!destCategory) {
    return NextResponse.json(
      { error: `Destination category ${JSON.stringify(toCategory)} is not active` },
      { status: 400 }
    );
  }

  const trimmedLabel = toSubcategoryLabel.trim();
  if (trimmedLabel.length === 0) {
    return NextResponse.json({ error: "Destination subcategory label is required" }, { status: 400 });
  }

  let createdSubcategory = false;
  const [existingSub] = await db
    .select()
    .from(questionSubcategories)
    .where(
      and(
        eq(questionSubcategories.categoryId, destCategory.id),
        eq(questionSubcategories.label, trimmedLabel)
      )
    )
    .limit(1);

  let destSub = existingSub;
  if (destSub && !destSub.active) {
    await db
      .update(questionSubcategories)
      .set({ active: true })
      .where(eq(questionSubcategories.id, destSub.id));
    destSub = { ...destSub, active: true };
  }

  if (!destSub) {
    const slug = await pickUniqueSlug(destCategory.id, slugify(trimmedLabel));
    const [inserted] = await db
      .insert(questionSubcategories)
      .values({
        categoryId: destCategory.id,
        slug,
        label: trimmedLabel,
        active: true,
        sortOrder: 0,
        targetCount: null,
        notesForGeneration: null,
      })
      .returning();
    if (!inserted) {
      return NextResponse.json({ error: "Could not create destination subcategory" }, { status: 500 });
    }
    destSub = inserted;
    createdSubcategory = true;
  }

  const result = await db
    .update(questions)
    .set({ category: toCategory, subcategory: trimmedLabel })
    .where(
      and(
        eq(questions.category, fromCategory),
        eq(questions.subcategory, fromSubcategory)
      )
    )
    .returning({ id: questions.id });

  return NextResponse.json({
    movedCount: result.length,
    createdSubcategory,
    subcategory: destSub,
    from: { category: fromCategory, subcategory: fromSubcategory },
    to: { category: toCategory, subcategory: trimmedLabel },
  });
}

async function countVettedForTuple(
  categoryLabel: string,
  subcategoryLabel: string
): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(questions)
    .where(
      and(
        eq(questions.category, categoryLabel),
        eq(questions.subcategory, subcategoryLabel),
        eq(questions.vetted, true),
        eq(questions.retired, false)
      )
    );
  return Number(row?.c ?? 0);
}
