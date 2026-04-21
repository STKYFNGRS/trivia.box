import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sentEmails } from "@/lib/db/schema";

export type SendMailInput = {
  accountId: string | null;
  toEmail: string;
  subject: string;
  html: string;
  text: string;
  /** e.g. `prize_won`, `weekly_digest`, `upcoming_sessions`. Indexed. */
  kind: string;
  /**
   * Stable, caller-supplied key used together with `kind` for idempotency.
   * Examples: prize claim id, `weekly:<playerId>:<weekStartIso>`,
   * `upcoming:<sessionId>:<playerId>`.
   */
  dedupeKey: string;
  /** Optional precomputed unsubscribe URL for the List-Unsubscribe header. */
  unsubscribeUrl?: string | null;
};

export type SendMailResult =
  | { status: "sent"; messageId: string }
  | { status: "skipped_duplicate" }
  | { status: "skipped_no_email" }
  | { status: "skipped_no_provider" }
  | { status: "failed"; error: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function getFromAddress(): string {
  const env = process.env.INVITES_FROM_EMAIL?.trim();
  if (env && env.length > 0) return env;
  return "Trivia.Box <noreply@trivia.box>";
}

/**
 * Transactional email primitive. Does three things in order so a retried
 * cron hit can never double-send:
 *
 *   1. Insert a `sent_emails` row with `ON CONFLICT DO NOTHING` against
 *      `(kind, dedupe_key)`. If nothing was inserted, we treat this call
 *      as a duplicate and bail.
 *   2. Call Resend's REST API. We hand-roll the HTTP so we don't pull the
 *      Node SDK into the edge bundle, and so failures are cleanly caught.
 *   3. Stamp the `sent_emails` row with the provider message id + status.
 *
 * `RESEND_API_KEY` unset → `skipped_no_provider` (the ledger row still
 * exists, status: `skipped`). This keeps local dev + CI email-free and
 * means "email backlog" in prod is just "rows with status=queued".
 */
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  if (!input.toEmail) return { status: "skipped_no_email" };

  // Idempotency gate.
  const rows = await db
    .insert(sentEmails)
    .values({
      accountId: input.accountId,
      toEmail: input.toEmail,
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      subject: input.subject,
      status: "queued",
    })
    .onConflictDoNothing({
      target: [sentEmails.kind, sentEmails.dedupeKey],
    })
    .returning({ id: sentEmails.id });

  const ledgerId = rows[0]?.id;
  if (!ledgerId) return { status: "skipped_duplicate" };

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    await db
      .update(sentEmails)
      .set({ status: "skipped" })
      .where(eq(sentEmails.id, ledgerId));
    return { status: "skipped_no_provider" };
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
  if (input.unsubscribeUrl) {
    // RFC 8058 one-click unsubscribe. Gmail / Apple Mail render this as a
    // native "Unsubscribe" link next to the sender name.
    headers["list-unsubscribe"] = `<${input.unsubscribeUrl}>`;
    headers["list-unsubscribe-post"] = "List-Unsubscribe=One-Click";
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: getFromAddress(),
        to: [input.toEmail],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    const payload = (await res.json().catch(() => null)) as
      | { id?: string; message?: string; name?: string }
      | null;
    if (!res.ok) {
      const err =
        payload?.message ??
        payload?.name ??
        `resend_http_${res.status}`;
      await db
        .update(sentEmails)
        .set({ status: "failed", errorMessage: err })
        .where(eq(sentEmails.id, ledgerId));
      return { status: "failed", error: err };
    }
    const messageId = payload?.id ?? "unknown";
    await db
      .update(sentEmails)
      .set({
        status: "sent",
        providerMessageId: messageId,
        sentAt: new Date(),
      })
      .where(eq(sentEmails.id, ledgerId));
    return { status: "sent", messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(sentEmails)
      .set({ status: "failed", errorMessage: msg })
      .where(eq(sentEmails.id, ledgerId));
    return { status: "failed", error: msg };
  }
}

/**
 * Has the provider been configured? Callers can short-circuit expensive
 * payload construction (e.g. the weekly-digest cron) when email is off.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/**
 * Test-only peek into the ledger. Not used at runtime, but exported so we
 * can assert behaviour from the vitest suite.
 */
export async function __peekSentEmail(kind: string, dedupeKey: string) {
  const rows = await db
    .select()
    .from(sentEmails)
    .where(and(eq(sentEmails.kind, kind), eq(sentEmails.dedupeKey, dedupeKey)))
    .limit(1);
  return rows[0] ?? null;
}
