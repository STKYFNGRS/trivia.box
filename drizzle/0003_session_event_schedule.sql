ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "event_starts_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "event_timezone" text;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "has_prize" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "prize_description" text;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "listed_public" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
UPDATE "sessions" SET "event_starts_at" = "created_at" WHERE "event_starts_at" IS NULL;
--> statement-breakpoint
UPDATE "sessions" SET "event_timezone" = 'America/Los_Angeles' WHERE "event_timezone" IS NULL OR "event_timezone" = '';
--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "event_starts_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "event_timezone" SET NOT NULL;
