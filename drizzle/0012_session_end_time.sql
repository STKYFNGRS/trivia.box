-- Phase 5.1 session lifecycle: projected end time so the host dashboard can
-- auto-hide finished sessions and the stale-session sweeper has a concrete
-- cutoff. `estimated_end_at` is computed at creation (autopilot derives from
-- question count + seconds/question; hosted takes a host-supplied duration
-- or explicit override). NULL is tolerated for legacy rows.

ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "estimated_end_at" timestamptz;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "sessions_estimated_end_idx"
  ON "sessions" ("status", "estimated_end_at");
