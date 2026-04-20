-- House-game themes: store the human-readable label (typically a subcategory
-- name like "90s movies" or "NBA finals") so the /play "Coming up" strip and
-- /games/upcoming can show a topic pill next to each event. Nullable —
-- legacy + hosted sessions without an explicit theme stay NULL.

ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "theme" text;
