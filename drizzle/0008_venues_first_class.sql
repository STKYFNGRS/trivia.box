-- 0008: venues become first-class, gameplay timing gets per-round overrides,
-- scoring stores points + streak per answer, player stats rollup, and only one
-- session can be active per venue at a time.
--
-- Safe to re-run via scripts/db-repair.mjs: every statement uses IF NOT EXISTS
-- / CREATE INDEX IF NOT EXISTS and the backfill is wrapped in DO $$ ... $$
-- so duplicate-slug survivors don't explode the second time.

CREATE TABLE IF NOT EXISTS "venue_profiles" (
  "account_id" uuid PRIMARY KEY REFERENCES "accounts"("id") ON DELETE CASCADE,
  "slug" text NOT NULL,
  "display_name" text NOT NULL,
  "tagline" text,
  "description" text,
  "timezone" text,
  "image_mime" text,
  "image_bytes" bytea,
  "image_updated_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "venue_profiles_slug_unique" UNIQUE ("slug")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "venue_profiles_slug_idx" ON "venue_profiles" ("slug");
--> statement-breakpoint

-- Backfill one venue_profiles row per host/site_admin account. Slug is derived
-- from the account name (or email local part) and deduped with a numeric suffix
-- on collision. display_name is guaranteed non-empty so the location dropdown
-- never renders a UUID.
DO $$
DECLARE
  acct RECORD;
  base_slug text;
  candidate_slug text;
  candidate_name text;
  suffix int;
BEGIN
  FOR acct IN
    SELECT a.id, a.name, a.email
    FROM accounts a
    LEFT JOIN venue_profiles vp ON vp.account_id = a.id
    WHERE vp.account_id IS NULL
      AND a.account_type IN ('host', 'site_admin')
  LOOP
    candidate_name := NULLIF(trim(acct.name), '');
    IF candidate_name IS NULL THEN
      candidate_name := split_part(acct.email, '@', 1);
    END IF;
    IF candidate_name IS NULL OR candidate_name = '' THEN
      candidate_name := 'Untitled venue';
    END IF;

    base_slug := regexp_replace(lower(candidate_name), '[^a-z0-9]+', '-', 'g');
    base_slug := regexp_replace(base_slug, '(^-|-$)', '', 'g');
    IF base_slug IS NULL OR base_slug = '' THEN
      base_slug := 'venue';
    END IF;
    base_slug := substr(base_slug, 1, 60);

    candidate_slug := base_slug;
    suffix := 1;
    WHILE EXISTS (SELECT 1 FROM venue_profiles WHERE slug = candidate_slug) LOOP
      suffix := suffix + 1;
      candidate_slug := substr(base_slug, 1, 56) || '-' || suffix::text;
    END LOOP;

    INSERT INTO venue_profiles (account_id, slug, display_name)
    VALUES (acct.id, candidate_slug, candidate_name);
  END LOOP;
END$$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "player_stats" (
  "player_id" uuid PRIMARY KEY REFERENCES "players"("id") ON DELETE CASCADE,
  "total_answered" integer NOT NULL DEFAULT 0,
  "total_correct" integer NOT NULL DEFAULT 0,
  "total_points" bigint NOT NULL DEFAULT 0,
  "total_games" integer NOT NULL DEFAULT 0,
  "best_rank" integer,
  "longest_streak" integer NOT NULL DEFAULT 0,
  "fastest_correct_ms" integer,
  "last_played_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Per-round timer override (NULL falls back to session.seconds_per_question).
ALTER TABLE "rounds" ADD COLUMN IF NOT EXISTS "seconds_per_question" integer;
--> statement-breakpoint

-- Per-question resolved timer + server wall-clock start (ms since epoch) so
-- every client can compute identical remaining-time regardless of tab lag.
ALTER TABLE "session_questions" ADD COLUMN IF NOT EXISTS "timer_seconds" integer;
--> statement-breakpoint
ALTER TABLE "session_questions" ADD COLUMN IF NOT EXISTS "timer_started_at_ms" bigint;
--> statement-breakpoint

-- Kahoot-style scoring: store points awarded + streak length at time of answer.
ALTER TABLE "answers" ADD COLUMN IF NOT EXISTS "points_awarded" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "answers" ADD COLUMN IF NOT EXISTS "streak_at_answer" integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- Hard guarantee that a venue can only host one active session at a time.
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_session_per_venue"
  ON "sessions" ("venue_account_id")
  WHERE "status" = 'active';
