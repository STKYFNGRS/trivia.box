import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts, sessions, venueProfiles } from "@/lib/db/schema";
import { slugifyText } from "@/lib/slug";
export { formatVenueAddress } from "@/lib/venue-address";

export type VenueProfileRow = typeof venueProfiles.$inferSelect;

export const MAX_VENUE_IMAGE_BYTES = 4 * 1024 * 1024;
export const ALLOWED_VENUE_IMAGE_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export type VenueImageMime = (typeof ALLOWED_VENUE_IMAGE_MIMES)[number];

/** Turns an arbitrary display name into a URL-safe slug (ASCII, dash-separated,
 *  ≤60 chars). Empty input falls back to `"venue"`. Exported for unit testing. */
export function slugifyVenueName(name: string): string {
  return slugifyText(name, { maxLength: 60, fallback: "venue" });
}

/**
 * Picks the first name-based fallback we can find for an account so
 * `venue_profiles.display_name` is never empty — mirrors the backfill in
 * migration 0008. Exported for unit tests.
 */
export function deriveVenueDisplayName(account: {
  name?: string | null;
  email?: string | null;
}): string {
  const fromName = typeof account.name === "string" ? account.name.trim() : "";
  if (fromName) return fromName;
  const email = typeof account.email === "string" ? account.email : "";
  const local = email.split("@")[0]?.trim() ?? "";
  if (local) return local;
  return "Untitled venue";
}

/**
 * Given a desired slug and a uniqueness predicate, returns the first variant
 * (base, base-2, base-3, ...) that the predicate says is unused. Exported so
 * unit tests can exercise collision handling without hitting the DB.
 */
export async function pickAvailableSlug(
  desired: string,
  isTaken: (candidate: string) => Promise<boolean>
): Promise<string> {
  const base = slugifyVenueName(desired);
  let candidate = base;
  let suffix = 1;
  // 50 is an absurd cap; we just don't want an infinite loop on a buggy predicate.
  for (let i = 0; i < 50; i += 1) {
    if (!(await isTaken(candidate))) return candidate;
    suffix += 1;
    candidate = `${base.slice(0, 56)}-${suffix}`;
  }
  throw new Error(`Could not find an available slug near "${base}"`);
}

/** Looks up a venue profile by its public slug (used by `/v/[slug]` and image routes). */
export async function getVenueProfileBySlug(slug: string): Promise<VenueProfileRow | null> {
  const [row] = await db
    .select()
    .from(venueProfiles)
    .where(eq(venueProfiles.slug, slug))
    .limit(1);
  return row ?? null;
}

/** Looks up a venue profile by host/venue account id. */
export async function getVenueProfileByAccountId(
  accountId: string
): Promise<VenueProfileRow | null> {
  const [row] = await db
    .select()
    .from(venueProfiles)
    .where(eq(venueProfiles.accountId, accountId))
    .limit(1);
  return row ?? null;
}

/**
 * Ensures a venue profile exists for the given account id, creating one from
 * the account's name/email on demand. Safe to call multiple times.
 */
export async function ensureVenueProfileForAccount(accountId: string): Promise<VenueProfileRow> {
  const existing = await getVenueProfileByAccountId(accountId);
  if (existing) return existing;

  const [account] = await db
    .select({ id: accounts.id, name: accounts.name, email: accounts.email })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!account) {
    throw new Error(`Account ${accountId} does not exist`);
  }

  const displayName = deriveVenueDisplayName(account);
  const slug = await pickAvailableSlug(displayName, async (candidate) => {
    const [hit] = await db
      .select({ accountId: venueProfiles.accountId })
      .from(venueProfiles)
      .where(eq(venueProfiles.slug, candidate))
      .limit(1);
    return Boolean(hit);
  });

  const [inserted] = await db
    .insert(venueProfiles)
    .values({ accountId, slug, displayName })
    .returning();
  if (!inserted) {
    throw new Error(`Failed to create venue profile for account ${accountId}`);
  }
  return inserted;
}

/**
 * Updates the venue profile for `accountId`, respecting slug uniqueness.
 * Returns the updated row.
 */
export async function updateVenueProfile(
  accountId: string,
  patch: {
    displayName?: string;
    slug?: string;
    tagline?: string | null;
    description?: string | null;
    timezone?: string | null;
    addressStreet?: string | null;
    addressCity?: string | null;
    addressRegion?: string | null;
    addressPostalCode?: string | null;
    addressCountry?: string | null;
  }
): Promise<VenueProfileRow> {
  const current = await ensureVenueProfileForAccount(accountId);

  const nextDisplayName =
    patch.displayName !== undefined ? patch.displayName.trim() : current.displayName;
  if (!nextDisplayName) {
    throw new Error("display_name cannot be empty");
  }

  let nextSlug = current.slug;
  if (patch.slug !== undefined || patch.displayName !== undefined) {
    const desired = patch.slug !== undefined ? patch.slug : nextDisplayName;
    const cleaned = slugifyVenueName(desired);
    if (cleaned !== current.slug) {
      nextSlug = await pickAvailableSlug(cleaned, async (candidate) => {
        const [hit] = await db
          .select({ accountId: venueProfiles.accountId })
          .from(venueProfiles)
          .where(and(eq(venueProfiles.slug, candidate)))
          .limit(1);
        return Boolean(hit) && hit.accountId !== accountId;
      });
    }
  }

  const [updated] = await db
    .update(venueProfiles)
    .set({
      displayName: nextDisplayName,
      slug: nextSlug,
      tagline: patch.tagline !== undefined ? patch.tagline : current.tagline,
      description: patch.description !== undefined ? patch.description : current.description,
      timezone: patch.timezone !== undefined ? patch.timezone : current.timezone,
      addressStreet:
        patch.addressStreet !== undefined ? patch.addressStreet : current.addressStreet,
      addressCity:
        patch.addressCity !== undefined ? patch.addressCity : current.addressCity,
      addressRegion:
        patch.addressRegion !== undefined ? patch.addressRegion : current.addressRegion,
      addressPostalCode:
        patch.addressPostalCode !== undefined
          ? patch.addressPostalCode
          : current.addressPostalCode,
      addressCountry:
        patch.addressCountry !== undefined ? patch.addressCountry : current.addressCountry,
      updatedAt: new Date(),
    })
    .where(eq(venueProfiles.accountId, accountId))
    .returning();
  if (!updated) throw new Error(`Failed to update venue profile for account ${accountId}`);
  return updated;
}

export async function setVenueImage(
  accountId: string,
  mime: VenueImageMime,
  bytes: Uint8Array
): Promise<VenueProfileRow> {
  await ensureVenueProfileForAccount(accountId);
  const [updated] = await db
    .update(venueProfiles)
    .set({
      imageMime: mime,
      imageBytes: bytes,
      imageUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(venueProfiles.accountId, accountId))
    .returning();
  if (!updated) throw new Error(`Failed to set image for ${accountId}`);
  return updated;
}

export async function clearVenueImage(accountId: string): Promise<VenueProfileRow> {
  await ensureVenueProfileForAccount(accountId);
  const [updated] = await db
    .update(venueProfiles)
    .set({
      imageMime: null,
      imageBytes: null,
      imageUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(venueProfiles.accountId, accountId))
    .returning();
  if (!updated) throw new Error(`Failed to clear image for ${accountId}`);
  return updated;
}

/** Finds the currently-active session for a venue, if any. */
export async function getActiveSessionForVenue(venueAccountId: string) {
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.venueAccountId, venueAccountId), eq(sessions.status, "active")))
    .limit(1);
  return row ?? null;
}

/** Finds the next upcoming (pending) session for a venue, ordered by start time. */
export async function getNextUpcomingSessionForVenue(venueAccountId: string) {
  const [row] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.venueAccountId, venueAccountId),
        eq(sessions.status, "pending"),
        gt(sessions.eventStartsAt, sql`now()`)
      )
    )
    .orderBy(sessions.eventStartsAt)
    .limit(1);
  return row ?? null;
}
