CREATE TABLE "achievement_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"icon" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_achievement_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"achievement_id" uuid NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "question_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"body" text NOT NULL,
	"correct_answer" text NOT NULL,
	"wrong_answers" text[] NOT NULL,
	"category" text NOT NULL,
	"subcategory" text NOT NULL,
	"difficulty" integer DEFAULT 2 NOT NULL,
	"time_hint" integer DEFAULT 20 NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"pipeline_log" text,
	"duplicate_score" integer,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"step" text DEFAULT 'init' NOT NULL,
	"category" text NOT NULL,
	"topic_hint" text,
	"draft_id" uuid,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_package_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "run_mode" text DEFAULT 'hosted' NOT NULL;--> statement-breakpoint
ALTER TABLE "player_achievement_grants" ADD CONSTRAINT "player_achievement_grants_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_achievement_grants" ADD CONSTRAINT "player_achievement_grants_achievement_id_achievement_definitions_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievement_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_generation_jobs" ADD CONSTRAINT "question_generation_jobs_draft_id_question_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."question_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_package_items" ADD CONSTRAINT "question_package_items_package_id_question_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."question_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_package_items" ADD CONSTRAINT "question_package_items_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_definitions_slug_unique" ON "achievement_definitions" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "player_achievement_unique" ON "player_achievement_grants" USING btree ("player_id","achievement_id");--> statement-breakpoint
CREATE INDEX "player_achievement_player_idx" ON "player_achievement_grants" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "question_drafts_status_idx" ON "question_drafts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "question_generation_jobs_status_idx" ON "question_generation_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "question_package_items_package_idx" ON "question_package_items" USING btree ("package_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_package_items_unique" ON "question_package_items" USING btree ("package_id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "question_packages_slug_unique" ON "question_packages" USING btree ("slug");--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "players_account_id_unique" ON "players" USING btree ("account_id");