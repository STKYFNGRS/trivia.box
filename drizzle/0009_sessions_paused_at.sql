-- 0009: real pause semantics. `sessions.paused_at` is nullable; when non-null
-- the autopilot cron skips the session and the public session endpoint surfaces
-- a banner. `start` clears it; `pause` sets it to now().
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "paused_at" timestamp with time zone;
