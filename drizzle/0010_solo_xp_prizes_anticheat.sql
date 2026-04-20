-- 0010: single-player (solo) sessions + XP ledger + IRL prize claims +
-- deck marketplace metadata + answer-fingerprinting for anti-cheat, and
-- the "house_game" flag / index that powers the 15-minute always-on lobby.
--
-- This migration is intentionally additive: it introduces new tables and
-- nullable columns so that existing session / answer / deck rows remain
-- valid without backfill. A follow-up migration can add NOT NULL
-- constraints once the rollups are warm.

-- ---------------------------------------------------------------------------
-- Solo (single-player) play
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "solo_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "player_id" uuid REFERENCES "players"("id") ON DELETE CASCADE,
  "guest_id" text,
  "speed" text NOT NULL DEFAULT 'standard',
  "question_count" integer NOT NULL DEFAULT 10,
  "category_filter" text[],
  "timer_seconds" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "total_score" integer NOT NULL DEFAULT 0,
  "correct_count" integer NOT NULL DEFAULT 0,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "solo_sessions_player_idx" ON "solo_sessions" ("player_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "solo_sessions_guest_idx" ON "solo_sessions" ("guest_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "solo_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "solo_session_id" uuid NOT NULL REFERENCES "solo_sessions"("id") ON DELETE CASCADE,
  "question_id" uuid NOT NULL REFERENCES "questions"("id") ON DELETE RESTRICT,
  "position" integer NOT NULL,
  "shown_at_ms" bigint,
  "answered" boolean NOT NULL DEFAULT false,
  "correct" boolean NOT NULL DEFAULT false,
  "time_to_answer_ms" integer,
  "answer_given" text,
  "points_awarded" integer NOT NULL DEFAULT 0,
  CONSTRAINT "solo_questions_session_position_unique" UNIQUE ("solo_session_id", "position")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "solo_questions_session_idx" ON "solo_questions" ("solo_session_id");
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- XP ledger & lifetime rollup column
-- ---------------------------------------------------------------------------

ALTER TABLE "player_stats" ADD COLUMN IF NOT EXISTS "total_xp" bigint NOT NULL DEFAULT 0;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "player_xp_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "player_id" uuid NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "amount" integer NOT NULL,
  "session_id" uuid REFERENCES "sessions"("id") ON DELETE SET NULL,
  "solo_session_id" uuid REFERENCES "solo_sessions"("id") ON DELETE SET NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "player_xp_events_player_idx" ON "player_xp_events" ("player_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_xp_events_kind_idx" ON "player_xp_events" ("kind");
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Venue IRL prize claims
-- ---------------------------------------------------------------------------

ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "prize_top_n" integer;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "prize_labels" text[];
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "prize_instructions" text;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "prize_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "house_game" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "sessions_house_idx" ON "sessions" ("house_game", "event_starts_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "prize_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "sessions"("id") ON DELETE CASCADE,
  "player_id" uuid NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
  "venue_account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "final_rank" integer NOT NULL,
  "prize_label" text NOT NULL,
  "prize_details" text,
  "claim_code" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "redeemed_at" timestamp with time zone,
  "redeemed_by_account_id" uuid REFERENCES "accounts"("id") ON DELETE SET NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "prize_claims_code_unique" UNIQUE ("claim_code")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "prize_claims_player_idx" ON "prize_claims" ("player_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prize_claims_venue_idx" ON "prize_claims" ("venue_account_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prize_claims_session_idx" ON "prize_claims" ("session_id");
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Deck marketplace: ratings, popularity rollup, cover art, tags, featured
-- ---------------------------------------------------------------------------

ALTER TABLE "question_decks" ADD COLUMN IF NOT EXISTS "cover_image_mime" text;
--> statement-breakpoint
ALTER TABLE "question_decks" ADD COLUMN IF NOT EXISTS "cover_image_bytes" bytea;
--> statement-breakpoint
ALTER TABLE "question_decks" ADD COLUMN IF NOT EXISTS "cover_updated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "question_decks" ADD COLUMN IF NOT EXISTS "tags" text[];
--> statement-breakpoint
ALTER TABLE "question_decks" ADD COLUMN IF NOT EXISTS "featured" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "deck_ratings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deck_id" uuid NOT NULL REFERENCES "question_decks"("id") ON DELETE CASCADE,
  "player_id" uuid NOT NULL REFERENCES "players"("id") ON DELETE CASCADE,
  "score" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "deck_ratings_deck_player_unique" UNIQUE ("deck_id", "player_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "deck_ratings_deck_idx" ON "deck_ratings" ("deck_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "deck_stats" (
  "deck_id" uuid PRIMARY KEY REFERENCES "question_decks"("id") ON DELETE CASCADE,
  "times_used" integer NOT NULL DEFAULT 0,
  "total_player_plays" integer NOT NULL DEFAULT 0,
  "rating_count" integer NOT NULL DEFAULT 0,
  "avg_rating_x100" integer NOT NULL DEFAULT 0,
  "last_used_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "creator_badges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "note" text,
  CONSTRAINT "creator_badges_account_kind_unique" UNIQUE ("account_id", "kind")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "creator_badges_account_idx" ON "creator_badges" ("account_id");
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Answer fingerprinting + server-side timing for anti-cheat
-- ---------------------------------------------------------------------------

ALTER TABLE "answers" ADD COLUMN IF NOT EXISTS "server_elapsed_ms" integer;
--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN IF NOT EXISTS "ip_hash" text;
--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN IF NOT EXISTS "ua_hash" text;
--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN IF NOT EXISTS "device_id" text;
--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN IF NOT EXISTS "disqualified_at" timestamp with time zone;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "answers_ip_hash_idx" ON "answers" ("ip_hash");
