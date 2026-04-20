-- 0007: community-authored question decks.
--
-- A deck is a named collection of questions authored by a host. Decks have a
-- visibility flag:
--   - 'private'      deck only visible to its owner (default)
--   - 'game_scoped'  hidden deck auto-created when a host writes one-off
--                    custom questions while building a single game
--   - 'submitted'    owner has asked site admin to make the deck public
--   - 'public'       approved by site admin, usable by any host
--   - 'rejected'     submission was declined
--
-- `questions.deck_id` is NULL for the canonical AI / site-admin-authored pool
-- so existing smart-pull queries keep working unchanged.

CREATE TABLE IF NOT EXISTS "question_decks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "default_category" text,
  "default_subcategory" text,
  "visibility" text NOT NULL DEFAULT 'private',
  "reviewed_by_account_id" uuid REFERENCES "accounts"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp with time zone,
  "review_note" text,
  "submitted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "question_decks_owner_slug_unique" UNIQUE("owner_account_id", "slug")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "question_decks_visibility_idx" ON "question_decks" ("visibility");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_decks_owner_idx" ON "question_decks" ("owner_account_id");
--> statement-breakpoint

ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "deck_id" uuid REFERENCES "question_decks"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "author_account_id" uuid REFERENCES "accounts"("id") ON DELETE SET NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "questions_deck_idx" ON "questions" ("deck_id");
