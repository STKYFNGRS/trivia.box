CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"account_type" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"city" text NOT NULL,
	"logo_url" text,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"session_question_id" uuid NOT NULL,
	"answer_given" text NOT NULL,
	"is_correct" boolean NOT NULL,
	"time_to_answer_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "host_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_account_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "host_venue_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"venue_account_id" uuid NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"rank" integer,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"venue_account_id" uuid NOT NULL,
	"visits" integer DEFAULT 1 NOT NULL,
	"first_visit" timestamp with time zone DEFAULT now() NOT NULL,
	"last_visit" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"email" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"host_account_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "question_venue_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"venue_account_id" uuid NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"body" text NOT NULL,
	"correct_answer" text NOT NULL,
	"wrong_answers" text[] NOT NULL,
	"category" text NOT NULL,
	"subcategory" text NOT NULL,
	"difficulty" integer NOT NULL,
	"time_hint" integer DEFAULT 20 NOT NULL,
	"vetted" boolean DEFAULT false NOT NULL,
	"times_used" integer DEFAULT 0 NOT NULL,
	"retired" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"round_number" integer NOT NULL,
	"category" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"question_order" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"time_started" timestamp with time zone,
	"time_locked" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_account_id" uuid NOT NULL,
	"venue_account_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"timer_mode" text DEFAULT 'auto' NOT NULL,
	"seconds_per_question" integer,
	"join_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_session_question_id_session_questions_id_fk" FOREIGN KEY ("session_question_id") REFERENCES "public"."session_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_invites" ADD CONSTRAINT "host_invites_venue_account_id_accounts_id_fk" FOREIGN KEY ("venue_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_venue_relationships" ADD CONSTRAINT "host_venue_relationships_host_id_accounts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_venue_relationships" ADD CONSTRAINT "host_venue_relationships_venue_id_accounts_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_sessions" ADD CONSTRAINT "player_sessions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_sessions" ADD CONSTRAINT "player_sessions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_sessions" ADD CONSTRAINT "player_sessions_venue_account_id_accounts_id_fk" FOREIGN KEY ("venue_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_venues" ADD CONSTRAINT "player_venues_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_venues" ADD CONSTRAINT "player_venues_venue_account_id_accounts_id_fk" FOREIGN KEY ("venue_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_flags" ADD CONSTRAINT "question_flags_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_flags" ADD CONSTRAINT "question_flags_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_flags" ADD CONSTRAINT "question_flags_host_account_id_accounts_id_fk" FOREIGN KEY ("host_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_venue_history" ADD CONSTRAINT "question_venue_history_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_venue_history" ADD CONSTRAINT "question_venue_history_venue_account_id_accounts_id_fk" FOREIGN KEY ("venue_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_questions" ADD CONSTRAINT "session_questions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_questions" ADD CONSTRAINT "session_questions_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_questions" ADD CONSTRAINT "session_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_host_account_id_accounts_id_fk" FOREIGN KEY ("host_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_venue_account_id_accounts_id_fk" FOREIGN KEY ("venue_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_email_unique" ON "accounts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "answers_player_idx" ON "answers" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "answers_sq_idx" ON "answers" USING btree ("session_question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "host_invites_token_unique" ON "host_invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX "host_venue_host_idx" ON "host_venue_relationships" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "host_venue_venue_idx" ON "host_venue_relationships" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "player_sessions_player_idx" ON "player_sessions" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_sessions_session_idx" ON "player_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_venues_player_venue_unique" ON "player_venues" USING btree ("player_id","venue_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_username_unique" ON "players" USING btree ("username");--> statement-breakpoint
CREATE INDEX "question_flags_resolved_idx" ON "question_flags" USING btree ("resolved_at");--> statement-breakpoint
CREATE INDEX "qvh_question_venue_used_idx" ON "question_venue_history" USING btree ("question_id","venue_account_id","used_at");--> statement-breakpoint
CREATE INDEX "questions_category_idx" ON "questions" USING btree ("category");--> statement-breakpoint
CREATE INDEX "questions_vetted_retired_idx" ON "questions" USING btree ("vetted","retired");--> statement-breakpoint
CREATE INDEX "rounds_session_idx" ON "rounds" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_questions_session_idx" ON "session_questions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_questions_round_idx" ON "session_questions" USING btree ("round_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_join_code_unique" ON "sessions" USING btree ("join_code");--> statement-breakpoint
CREATE INDEX "venues_account_id_idx" ON "venues" USING btree ("account_id");