-- Web Push subscriptions — one row per (account, endpoint). A single user
-- may be subscribed from multiple devices (laptop + phone), so we key on
-- the endpoint URL which is globally unique per-subscription.
--
-- When the browser invalidates a subscription (user revokes perms, clears
-- site data, logs into a different profile), web-push replies with a 410
-- Gone and we delete the row lazily via `lib/push/prune.ts`.

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "last_used_at" timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_uidx"
  ON "push_subscriptions" ("endpoint");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_subscriptions_account_idx"
  ON "push_subscriptions" ("account_id");
