import { auth } from "@clerk/nextjs/server";
import { inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { questionDecks } from "@/lib/db/schema";
import {
  countQuestionsForDecks,
  listDecksByOwner,
  slugifyDeckName,
} from "@/lib/decks";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400).optional(),
  defaultCategory: z.string().trim().max(120).optional(),
  defaultSubcategory: z.string().trim().max(120).optional(),
});

async function resolveOwner() {
  const { userId } = await auth();
  if (!userId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const account = await getAccountByClerkUserId(userId);
  if (!account) return { error: NextResponse.json({ error: "Account not found" }, { status: 400 }) };
  // Players + hosts + site admins can all own decks. We deliberately do NOT
  // gate on `accountType === "host"` so players can start drafting a deck
  // before they upgrade; they just cannot submit a game until they are a host.
  return { account };
}

export async function GET() {
  const owner = await resolveOwner();
  if ("error" in owner) return owner.error;

  const decks = await listDecksByOwner(owner.account.id);
  const visibleDecks = decks.filter((d) => d.visibility !== "game_scoped");
  const counts = await countQuestionsForDecks(visibleDecks.map((d) => d.id));

  return NextResponse.json({
    decks: visibleDecks.map((d) => ({
      id: d.id,
      name: d.name,
      slug: d.slug,
      description: d.description,
      defaultCategory: d.defaultCategory,
      defaultSubcategory: d.defaultSubcategory,
      visibility: d.visibility,
      reviewNote: d.reviewNote,
      reviewedAt: d.reviewedAt,
      submittedAt: d.submittedAt,
      updatedAt: d.updatedAt,
      createdAt: d.createdAt,
      questionCount: counts.get(d.id) ?? 0,
    })),
  });
}

export async function POST(req: Request) {
  const owner = await resolveOwner();
  if ("error" in owner) return owner.error;

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Resolve a unique owner-scoped slug by retrying with numeric suffixes.
  const base = slugifyDeckName(parsed.data.name);
  const existing = await db
    .select({ slug: questionDecks.slug })
    .from(questionDecks)
    .where(inArray(questionDecks.slug, [base, ...Array.from({ length: 20 }, (_, i) => `${base}-${i + 2}`)]));
  const taken = new Set(existing.map((r) => r.slug));
  let slug = base;
  let n = 2;
  while (taken.has(slug) && n < 200) {
    slug = `${base}-${n}`;
    n += 1;
  }

  const [row] = await db
    .insert(questionDecks)
    .values({
      ownerAccountId: owner.account.id,
      name: parsed.data.name,
      slug,
      description: parsed.data.description ?? null,
      defaultCategory: parsed.data.defaultCategory ?? null,
      defaultSubcategory: parsed.data.defaultSubcategory ?? null,
      visibility: "private",
    })
    .returning();

  if (!row) {
    return NextResponse.json({ error: "Failed to create deck" }, { status: 500 });
  }

  return NextResponse.json({ deck: row });
}
