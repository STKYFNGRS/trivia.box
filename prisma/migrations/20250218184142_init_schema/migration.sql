-- CreateEnum
CREATE TYPE "trivia_difficulty" AS ENUM ('easy', 'medium', 'hard');

-- CreateEnum
CREATE TYPE "trivia_category" AS ENUM ('technology', 'science', 'literature', 'pop_culture', 'history', 'geography', 'sports', 'gaming', 'internet', 'movies', 'music');

-- CreateEnum
CREATE TYPE "trivia_question_status" AS ENUM ('draft', 'reviewing', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "trivia_game_status" AS ENUM ('pending', 'active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ActivityLogType" AS ENUM ('ANSWER', 'SESSION', 'ACHIEVEMENT', 'VIOLATION', 'SCORE_PERSISTENCE');

-- CreateTable
CREATE TABLE "trivia_questions" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "difficulty" "trivia_difficulty" NOT NULL,
    "category" "trivia_category" NOT NULL,
    "correct_answer" TEXT NOT NULL,
    "incorrect_answers" TEXT[],
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "validation_status" "trivia_question_status" NOT NULL DEFAULT 'draft',
    "validation_feedback" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used" TIMESTAMP(3),
    "usage_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "trivia_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trivia_game_sessions" (
    "id" SERIAL NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "question_sequence" TEXT NOT NULL DEFAULT '[]',
    "player_count" INTEGER NOT NULL DEFAULT 0,
    "status" "trivia_game_status" NOT NULL DEFAULT 'pending',
    "current_index" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "trivia_game_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trivia_player_responses" (
    "id" SERIAL NOT NULL,
    "game_session_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "question_id" INTEGER NOT NULL,
    "response_time_ms" INTEGER NOT NULL,
    "answer" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "points_earned" INTEGER NOT NULL,
    "potential_points" INTEGER NOT NULL DEFAULT 15,
    "streak_count" INTEGER NOT NULL DEFAULT 0,
    "time_remaining" DOUBLE PRECISION,
    "answered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trivia_player_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trivia_users" (
    "id" SERIAL NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "total_points" BIGINT NOT NULL DEFAULT 0,
    "games_played" INTEGER NOT NULL DEFAULT 0,
    "best_streak" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_played_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trivia_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trivia_achievements" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_id" INTEGER,
    "achievement_type" TEXT NOT NULL,
    "week_number" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "streak_milestone" INTEGER,
    "fastest_response" INTEGER,
    "minted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trivia_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_logs" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "activity_type" "ActivityLogType" NOT NULL,
    "details" JSONB NOT NULL,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trivia_streak_history" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "game_session_id" INTEGER NOT NULL,
    "streak_count" INTEGER NOT NULL,
    "points_earned" INTEGER NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trivia_streak_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trivia_weekly_scores" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "trivia_weekly_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trivia_questions_category_difficulty_idx" ON "trivia_questions"("category", "difficulty");

-- CreateIndex
CREATE INDEX "trivia_questions_validation_status_idx" ON "trivia_questions"("validation_status");

-- CreateIndex
CREATE INDEX "trivia_game_sessions_status_idx" ON "trivia_game_sessions"("status");

-- CreateIndex
CREATE INDEX "trivia_player_responses_game_session_id_idx" ON "trivia_player_responses"("game_session_id");

-- CreateIndex
CREATE INDEX "trivia_player_responses_user_id_idx" ON "trivia_player_responses"("user_id");

-- CreateIndex
CREATE INDEX "trivia_player_responses_question_id_idx" ON "trivia_player_responses"("question_id");

-- CreateIndex
CREATE INDEX "trivia_player_responses_streak_count_idx" ON "trivia_player_responses"("streak_count");

-- CreateIndex
CREATE INDEX "trivia_player_responses_response_time_ms_idx" ON "trivia_player_responses"("response_time_ms");

-- CreateIndex
CREATE UNIQUE INDEX "trivia_users_wallet_address_key" ON "trivia_users"("wallet_address");

-- CreateIndex
CREATE INDEX "trivia_users_wallet_address_idx" ON "trivia_users"("wallet_address");

-- CreateIndex
CREATE INDEX "trivia_achievements_user_id_idx" ON "trivia_achievements"("user_id");

-- CreateIndex
CREATE INDEX "trivia_achievements_week_number_year_idx" ON "trivia_achievements"("week_number", "year");

-- CreateIndex
CREATE INDEX "security_logs_session_id_idx" ON "security_logs"("session_id");

-- CreateIndex
CREATE INDEX "security_logs_activity_type_idx" ON "security_logs"("activity_type");

-- CreateIndex
CREATE INDEX "security_logs_logged_at_idx" ON "security_logs"("logged_at");

-- CreateIndex
CREATE INDEX "trivia_streak_history_user_id_idx" ON "trivia_streak_history"("user_id");

-- CreateIndex
CREATE INDEX "trivia_streak_history_game_session_id_idx" ON "trivia_streak_history"("game_session_id");

-- CreateIndex
CREATE INDEX "trivia_weekly_scores_user_id_idx" ON "trivia_weekly_scores"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "trivia_weekly_scores_user_id_week_year_key" ON "trivia_weekly_scores"("user_id", "week", "year");

-- AddForeignKey
ALTER TABLE "trivia_player_responses" ADD CONSTRAINT "trivia_player_responses_game_session_id_fkey" FOREIGN KEY ("game_session_id") REFERENCES "trivia_game_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trivia_player_responses" ADD CONSTRAINT "trivia_player_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "trivia_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trivia_player_responses" ADD CONSTRAINT "trivia_player_responses_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "trivia_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trivia_achievements" ADD CONSTRAINT "trivia_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "trivia_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_logs" ADD CONSTRAINT "security_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "trivia_game_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trivia_streak_history" ADD CONSTRAINT "trivia_streak_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "trivia_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trivia_streak_history" ADD CONSTRAINT "trivia_streak_history_game_session_id_fkey" FOREIGN KEY ("game_session_id") REFERENCES "trivia_game_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trivia_weekly_scores" ADD CONSTRAINT "trivia_weekly_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "trivia_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
