-- Daily challenge + daily-play streak.
--
-- A daily-challenge is a *single global* 5-question run, the same for
-- every player in a given UTC day. Seeding is handled by a cron (and
-- lazily from `/play/daily` as a fallback) so a row always exists for
-- "today". Players complete the run through the regular `solo_sessions`
-- pipeline; we just tag the solo session with `daily_challenge_date`
-- so we can:
--
--   - enforce one-per-day entry per player, and
--   - roll their play up to the per-player daily streak columns on
--     `player_stats` after the final answer.
--
-- `player_stats` gets three new columns for the streak flame surfaces on
-- `/play`, `/dashboard/player`, and `/u/[username]`. We keep the streak
-- on `player_stats` rather than a new `player_daily_streaks` table —
-- the data is a trivial per-player rollup and we already own the write
-- path in `lib/game/solo.ts`.

CREATE TABLE IF NOT EXISTS "daily_challenges" (
  "challenge_date" date PRIMARY KEY,
  "question_ids" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

ALTER TABLE "player_stats"
  ADD COLUMN IF NOT EXISTS "daily_streak" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "player_stats"
  ADD COLUMN IF NOT EXISTS "longest_daily_streak" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "player_stats"
  ADD COLUMN IF NOT EXISTS "last_daily_play_date" date;
--> statement-breakpoint

ALTER TABLE "solo_sessions"
  ADD COLUMN IF NOT EXISTS "daily_challenge_date" date;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "solo_sessions_daily_challenge_idx"
  ON "solo_sessions" ("daily_challenge_date")
  WHERE "daily_challenge_date" IS NOT NULL;
