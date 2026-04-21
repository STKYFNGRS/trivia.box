-- Seasons — named windows over the answers table used to power a Season
-- leaderboard that resets every quarter (or whatever cadence a site admin
-- configures). We keep the row history forever so past champions are still
-- citable on profiles. `getCurrentSeason()` returns whichever row overlaps
-- the current timestamp.
--
-- Rows are intentionally hand-curated: no automatic rollover, so admins can
-- skip or extend a season without a migration. `ensureCurrentSeason()`
-- lazily seeds a default 3-month window on first read when the table is
-- empty.

CREATE TABLE IF NOT EXISTS "seasons" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" text NOT NULL,
  "label" text NOT NULL,
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT "seasons_time_check" CHECK ("ends_at" > "starts_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "seasons_slug_uidx" ON "seasons" ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seasons_window_idx"
  ON "seasons" ("starts_at", "ends_at");
