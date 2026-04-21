-- Venue follows — lightweight many-to-many between players and venues.
--
-- A follow is the "save this venue for later" handshake: the player gets a
-- bookmark surface (`/dashboard/player` → follows section in a later pass)
-- and opts in to future venue-specific emails via the `email_preferences`
-- path (see `lib/email/triggers.ts` → `notifyUpcomingSession`).
--
-- Kept as a simple edge table so the foreign-keys can cascade cleanly when a
-- venue account is deleted. Unique `(player_id, venue_account_id)` prevents
-- duplicate rows when the player taps "Follow" twice — the API upserts and
-- the UI just toggles state.

CREATE TABLE IF NOT EXISTS "venue_follows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "player_id" uuid NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
  "venue_account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "venue_follows_player_venue_uidx"
  ON "venue_follows" ("player_id", "venue_account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "venue_follows_venue_idx"
  ON "venue_follows" ("venue_account_id");
