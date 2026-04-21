-- Email preferences + transactional email ledger.
--
-- `email_preferences` is keyed by `account_id` (one row per account). Each
-- column is a boolean opt-in/out flag; defaults are the least annoying
-- reasonable setting ("yes" for prize wins because they're rare + valuable,
-- "yes" for weekly digest because it's opt-out per the inbox-best-practice
-- playbook, "yes" for upcoming sessions at venues they've visited, "no"
-- for marketing). Rows are lazily upserted by the notifications API +
-- any trigger path that sends mail, so accounts created before this
-- migration don't need a backfill — their first GET creates the row with
-- defaults.
--
-- `sent_emails` is an append-only ledger that doubles as an idempotency
-- key store for the mailer. Every outgoing email has a `kind` (e.g.
-- `prize_won`) and a `dedupe_key` (the prize claim id, or
-- `weekly:<playerId>:<weekStart>`); the mailer does a `ON CONFLICT DO
-- NOTHING` insert before handing off to Resend so retried cron hits never
-- double-send. Kept tiny on purpose; operators who want richer delivery
-- analytics should instrument the Resend webhook separately.

CREATE TABLE IF NOT EXISTS "email_preferences" (
  "account_id" uuid PRIMARY KEY REFERENCES "accounts"("id") ON DELETE CASCADE,
  "prize_won" boolean NOT NULL DEFAULT TRUE,
  "weekly_digest" boolean NOT NULL DEFAULT TRUE,
  "upcoming_sessions" boolean NOT NULL DEFAULT TRUE,
  "marketing" boolean NOT NULL DEFAULT FALSE,
  "unsubscribed_all_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sent_emails" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid REFERENCES "accounts"("id") ON DELETE SET NULL,
  "to_email" text NOT NULL,
  "kind" text NOT NULL,
  "dedupe_key" text NOT NULL,
  "subject" text NOT NULL,
  "provider_message_id" text,
  "status" text NOT NULL DEFAULT 'queued',
  "error_message" text,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "sent_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sent_emails_kind_dedupe_unique"
  ON "sent_emails" ("kind", "dedupe_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sent_emails_account_idx"
  ON "sent_emails" ("account_id", "created_at");
