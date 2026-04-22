import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountByClerkUserId } from "@/lib/accounts";
import {
  ensureVenueProfileForAccount,
  updateVenueProfile,
  type VenueProfileRow,
} from "@/lib/venue";

function toPublic(row: VenueProfileRow) {
  return {
    accountId: row.accountId,
    slug: row.slug,
    displayName: row.displayName,
    tagline: row.tagline,
    description: row.description,
    timezone: row.timezone,
    addressStreet: row.addressStreet,
    addressCity: row.addressCity,
    addressRegion: row.addressRegion,
    addressPostalCode: row.addressPostalCode,
    addressCountry: row.addressCountry,
    hasImage: Boolean(row.imageBytes),
    imageUpdatedAt: row.imageUpdatedAt,
    imageMime: row.imageMime,
  };
}

async function loadAccount() {
  const { userId } = await auth();
  if (!userId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const account = await getAccountByClerkUserId(userId);
  if (!account) {
    return { error: NextResponse.json({ error: "Account not found" }, { status: 400 }) };
  }
  if (account.accountType !== "host" && account.accountType !== "site_admin") {
    return { error: NextResponse.json({ error: "Not a host" }, { status: 403 }) };
  }
  return { account };
}

export async function GET() {
  const gate = await loadAccount();
  if ("error" in gate) return gate.error;
  const profile = await ensureVenueProfileForAccount(gate.account.id);
  return NextResponse.json({ venue: toPublic(profile) });
}

const putSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  slug: z.string().trim().min(1).max(80).optional(),
  tagline: z.string().trim().max(140).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  timezone: z.string().trim().max(64).nullable().optional(),
  // Structured postal address — all nullable so clearing a field is an
  // explicit `null` while `undefined` means "leave as-is" downstream.
  addressStreet: z.string().trim().max(200).nullable().optional(),
  addressCity: z.string().trim().max(120).nullable().optional(),
  addressRegion: z.string().trim().max(80).nullable().optional(),
  addressPostalCode: z.string().trim().max(20).nullable().optional(),
  addressCountry: z.string().trim().max(80).nullable().optional(),
});

export async function PUT(req: Request) {
  const gate = await loadAccount();
  if ("error" in gate) return gate.error;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const updated = await updateVenueProfile(gate.account.id, parsed.data);
    return NextResponse.json({ venue: toPublic(updated) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
