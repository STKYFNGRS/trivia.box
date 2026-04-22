import { auth } from "@clerk/nextjs/server";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountByClerkUserId } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { accounts, hostVenueRelationships, venueProfiles } from "@/lib/db/schema";
import { siteAdminDevBypassEnabled } from "@/lib/siteAdmin";
import { ensureVenueProfileForAccount, pickAvailableSlug } from "@/lib/venue";

type VenueResult = {
  venueAccountId: string;
  name: string;
  displayName: string;
  slug: string | null;
  city: string;
  imageUpdatedAt: Date | null;
  hasImage: boolean;
};

async function hydrateVenueRows(
  rows: { id: string; name: string; city: string }[]
): Promise<VenueResult[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const profiles = await db
    .select()
    .from(venueProfiles)
    .where(inArray(venueProfiles.accountId, ids));

  const profileByAccount = new Map(profiles.map((p) => [p.accountId, p]));
  const results: VenueResult[] = [];
  for (const row of rows) {
    let profile = profileByAccount.get(row.id);
    if (!profile) {
      // Lazy-create for any host that slipped through the backfill.
      profile = await ensureVenueProfileForAccount(row.id);
    }
    const displayName = profile.displayName || row.name || "Untitled venue";
    results.push({
      venueAccountId: row.id,
      name: displayName,
      displayName,
      slug: profile.slug,
      city: row.city,
      imageUpdatedAt: profile.imageUpdatedAt,
      hasImage: Boolean(profile.imageBytes),
    });
  }
  return results;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await getAccountByClerkUserId(userId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 400 });
  }

  if (account.accountType === "site_admin" && siteAdminDevBypassEnabled()) {
    const rows = await db
      .select({ id: accounts.id, name: accounts.name, city: accounts.city })
      .from(accounts)
      .where(inArray(accounts.accountType, ["host", "site_admin"]));
    const venues = await hydrateVenueRows(rows);
    return NextResponse.json({ venues });
  }

  if (account.accountType !== "host" && account.accountType !== "site_admin") {
    return NextResponse.json({ venues: [] });
  }

  const rels = await db
    .select({ venueAccountId: hostVenueRelationships.venueId })
    .from(hostVenueRelationships)
    .where(and(eq(hostVenueRelationships.hostId, account.id), eq(hostVenueRelationships.status, "active")));

  const venueIds = Array.from(
    new Set<string>([account.id, ...rels.map((r) => r.venueAccountId)])
  );

  const venueRows = await db
    .select({ id: accounts.id, name: accounts.name, city: accounts.city })
    .from(accounts)
    .where(inArray(accounts.id, venueIds));

  // Preserve "own account first" order.
  venueRows.sort((a, b) => {
    if (a.id === account.id) return -1;
    if (b.id === account.id) return 1;
    return a.name.localeCompare(b.name);
  });

  const venues = await hydrateVenueRows(venueRows);
  return NextResponse.json({ venues });
}

const postSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  slug: z.string().trim().max(80).optional(),
  city: z.string().trim().max(120).optional(),
});

/**
 * Creates an additional venue for the signed-in host. Spec matters here:
 *
 * - A "venue" in the dashboard is an `accounts` row (`accountType = "host"`)
 *   with a matching `venue_profiles` row. The signed-in host's own account is
 *   their primary venue; any additional venue is a **separate account** they
 *   manage via `host_venue_relationships`.
 * - The new account gets a synthetic `clerk_user_id` (`venue:<uuid>`) and
 *   venue-local email (`<slug>@venues.trivia.box`) so it doesn't collide with
 *   real Clerk users or interfere with sign-in. Sign-in lookups go by the
 *   actual Clerk id, never these synthetic ones.
 * - The slug is always de-duplicated against `venue_profiles.slug` using the
 *   same helper as the auto-created primary venue.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const account = await getAccountByClerkUserId(userId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 400 });
  }
  if (account.accountType !== "host" && account.accountType !== "site_admin") {
    return NextResponse.json({ error: "Not a host" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const displayName = parsed.data.displayName.trim();
  const desiredSlug = parsed.data.slug?.trim() || displayName;
  const city = parsed.data.city?.trim() || "";

  const slug = await pickAvailableSlug(desiredSlug, async (candidate) => {
    const [hit] = await db
      .select({ accountId: venueProfiles.accountId })
      .from(venueProfiles)
      .where(eq(venueProfiles.slug, candidate))
      .limit(1);
    return Boolean(hit);
  });

  const newAccountId = randomUUID();
  const synthClerkId = `venue:${newAccountId}`;
  const synthEmail = `${slug}@venues.trivia.box`;

  // Collision-guard the synthetic email: if two hosts independently pick the
  // same slug that later got suffixed, the email would still match the
  // pre-suffix form. In practice `slug` is already unique by the time we get
  // here, so this is belt-and-suspenders — we fall back to an id-based email
  // if something weird happens.
  const [emailHit] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.email, synthEmail))
    .limit(1);
  const finalEmail = emailHit ? `venue-${newAccountId}@venues.trivia.box` : synthEmail;

  const [inserted] = await db
    .insert(accounts)
    .values({
      id: newAccountId,
      clerkUserId: synthClerkId,
      accountType: "host",
      name: displayName,
      email: finalEmail,
      city,
      subscriptionActive: false,
    })
    .returning();
  if (!inserted) {
    return NextResponse.json({ error: "Failed to create venue account" }, { status: 500 });
  }

  await db.insert(venueProfiles).values({
    accountId: newAccountId,
    slug,
    displayName,
  });

  await db.insert(hostVenueRelationships).values({
    hostId: account.id,
    venueId: newAccountId,
    status: "active",
  });

  return NextResponse.json({
    venue: {
      venueAccountId: newAccountId,
      name: displayName,
      displayName,
      slug,
      city,
      imageUpdatedAt: null,
      hasImage: false,
    },
  });
}
