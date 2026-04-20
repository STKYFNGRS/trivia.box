-- Phase 3.3 creator perks: free-tier grant ledger + account-level window.
--
-- `creator_perk_grants` is an append-only audit of every perk we've given a
-- creator (free month of organizer, waived review fee, etc.). `accounts`
-- gets a `creator_free_until` timestamp that host-gate code can check in
-- addition to `subscription_active` -- additive, not a replacement.
--
-- NB: This file is deliberately narrow and idempotent (IF NOT EXISTS) so it
-- only applies the Phase 3.3 delta. Drizzle-kit's `generate` would have
-- produced a much larger file because the snapshot chain in
-- drizzle/meta/ only covers 0000+0001 (migrations 0002-0010 were
-- hand-written without snapshots). The generator output is therefore
-- unsuitable as a migration but the snapshot it emitted (0011_snapshot.json)
-- is a useful baseline for future `db:generate` runs.

ALTER TABLE "accounts"
  ADD COLUMN IF NOT EXISTS "creator_free_until" timestamptz;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "creator_perk_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "note" text,
  "granted_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "creator_perk_grants_account_idx"
  ON "creator_perk_grants" ("account_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "creator_perk_grants_kind_idx"
  ON "creator_perk_grants" ("kind");
