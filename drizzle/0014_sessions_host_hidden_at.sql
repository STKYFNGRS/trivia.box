-- Host-dashboard soft-hide for past sessions.
--
-- `/dashboard/games` grew a "Recent games" section alongside the existing
-- active/upcoming list; clicking the **Remove** button on a completed or
-- cancelled card stamps `host_hidden_at` = NOW() and the query filters the
-- row out on the next render. The session + its history (`player_sessions`,
-- `answers`, `player_xp_events`, `prize_claims`, …) is left intact so
-- player-facing leaderboards, XP totals, and profile pages don't forget
-- the games that already happened.
--
-- Index is a partial idx on rows the dashboard cares about (NULL =
-- still-visible) so the listing query stays cheap as the table grows.

ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "host_hidden_at" timestamptz;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_host_hidden_idx"
  ON "sessions" ("host_account_id")
  WHERE "host_hidden_at" IS NULL;
