import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import type { AccountRow } from "@/lib/accounts";

/**
 * Get-or-create a Stripe customer for the given account, self-healing a stale
 * `accounts.stripe_customer_id`.
 *
 * A stale id happens when:
 *   - `STRIPE_SECRET_KEY` rotates (test → live, or swapped Stripe accounts)
 *   - the customer was deleted in the Stripe dashboard
 *   - a DB snapshot was copied between environments
 *
 * Without this healing step, every subsequent Checkout/Portal call 500s with
 * "No such customer" because Stripe can't find the stored id. We detect that
 * case, wipe the bad id, create a fresh customer, and persist the new one —
 * the next call hits the happy path and users are unblocked without manual
 * DB surgery.
 */
export async function resolveStripeCustomerId(
  stripe: Stripe,
  account: AccountRow
): Promise<string> {
  if (account.stripeCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(account.stripeCustomerId);
      // A customer that was deleted in Stripe still returns from `retrieve`
      // with `{ deleted: true }` — treat it as gone.
      if (!(existing as { deleted?: boolean }).deleted) {
        return account.stripeCustomerId;
      }
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      // `resource_missing` = id exists in our DB but not in this Stripe
      // account. Fall through to re-create.
      if (code !== "resource_missing") {
        throw err;
      }
    }
  }

  const created = await stripe.customers.create({
    email: account.email,
    metadata: { accountId: account.id },
  });
  await db
    .update(accounts)
    .set({ stripeCustomerId: created.id })
    .where(eq(accounts.id, account.id));
  return created.id;
}
