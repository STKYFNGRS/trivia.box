import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { accounts, hostInvites, hostVenueRelationships, venues } from "@/lib/db/schema";
import { sendHostInviteEmail } from "@/lib/email/hostInvite";

export type AccountRow = typeof accounts.$inferSelect;

export async function getAccountByClerkUserId(clerkUserId: string) {
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.clerkUserId, clerkUserId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getCurrentAccount(): Promise<AccountRow | null> {
  const user = await currentUser();
  if (!user) return null;
  return getAccountByClerkUserId(user.id);
}

type UnsafeMeta = {
  account_type?: string;
  name?: string;
  city?: string;
  address?: string;
  has_host?: boolean;
  host_email?: string;
  invite_token?: string;
};

export async function ensureAccountFromClerkUser(): Promise<AccountRow | null> {
  const user = await currentUser();
  if (!user) return null;

  const existing = await getAccountByClerkUserId(user.id);
  if (existing) return existing;

  const email =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress ??
    "";

  const meta = (user.unsafeMetadata ?? {}) as UnsafeMeta;
  const accountType = meta.account_type === "venue" ? "venue" : "host";
  const name =
    (typeof meta.name === "string" && meta.name.trim()) ||
    user.firstName ||
    user.username ||
    "Member";
  const city = (typeof meta.city === "string" && meta.city.trim()) || "Unknown";

  const [created] = await db
    .insert(accounts)
    .values({
      clerkUserId: user.id,
      accountType,
      name,
      email: email || `${user.id}@users.clerk.trivia.box`,
      city,
    })
    .returning();

  if (!created) {
    throw new Error("Failed to create account");
  }

  if (accountType === "venue") {
    const address =
      (typeof meta.address === "string" && meta.address.trim()) || `${city}`;
    await db.insert(venues).values({
      accountId: created.id,
      address,
    });

    if (meta.has_host && meta.host_email) {
      const hostEmail = meta.host_email.trim().toLowerCase();
      if (hostEmail) {
        const token = nanoid(32);
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
        await db.insert(hostInvites).values({
          venueAccountId: created.id,
          email: hostEmail,
          token,
          expiresAt,
        });
        try {
          await sendHostInviteEmail({
            to: hostEmail,
            venueName: name,
            token,
          });
        } catch (err) {
          console.error("Host invite email failed:", err);
        }
      }
    }
  }

  if (accountType === "host" && typeof meta.invite_token === "string" && meta.invite_token) {
    const inviteRows = await db
      .select()
      .from(hostInvites)
      .where(eq(hostInvites.token, meta.invite_token))
      .limit(1);
    const invite = inviteRows[0];
    if (invite && !invite.consumedAt && invite.expiresAt > new Date()) {
      await db.insert(hostVenueRelationships).values({
        hostId: created.id,
        venueId: invite.venueAccountId,
        status: "active",
      });
      await db
        .update(hostInvites)
        .set({ consumedAt: new Date() })
        .where(eq(hostInvites.id, invite.id));
    }
  }

  return created;
}
