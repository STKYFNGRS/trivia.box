-- Player friendships — a symmetric social graph stored as a directed request.
--
-- `requester_id` sends a friend request to `addressee_id`. When accepted, the
-- same row flips `status` to 'accepted' and we treat the pair as mutual
-- friends in both directions (the application layer queries both columns).
-- Cancelled / declined rows are hard-deleted so users can re-send later.
--
-- Unique `(requester_id, addressee_id)` prevents duplicate outstanding
-- requests. We deliberately do NOT normalize the ordering here because the
-- application needs to know who initiated (so the addressee sees a pending
-- inbox and the requester sees a pending outbox). Duplicate "mirror"
-- requests are avoided by a CHECK-style guard in the data layer — we reject
-- a new request if an accepted row already exists in the reverse direction.

CREATE TABLE IF NOT EXISTS "friendships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "requester_id" uuid NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
  "addressee_id" uuid NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "accepted_at" timestamptz,
  CONSTRAINT "friendships_self_check" CHECK ("requester_id" <> "addressee_id"),
  CONSTRAINT "friendships_status_check" CHECK ("status" IN ('pending', 'accepted'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "friendships_pair_uidx"
  ON "friendships" ("requester_id", "addressee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friendships_requester_idx"
  ON "friendships" ("requester_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friendships_addressee_idx"
  ON "friendships" ("addressee_id");
