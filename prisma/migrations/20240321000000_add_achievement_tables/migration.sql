-- CreateEnum
CREATE TYPE "achievement_category" AS ENUM ('MASTERY', 'STREAK', 'SPEED', 'COLLECTION', 'SPECIAL');
CREATE TYPE "achievement_tier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');

-- CreateTable - Achievement Definitions
CREATE TABLE IF NOT EXISTS "achievement_definitions" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "achievement_category" NOT NULL,
    "icon" TEXT NOT NULL,
    "tier" "achievement_tier",
    "requirements" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievement_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable - User Achievements
CREATE TABLE IF NOT EXISTS "user_achievements" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "achievement_id" INTEGER NOT NULL,
    "progress" JSONB NOT NULL,
    "achieved" BOOLEAN NOT NULL DEFAULT false,
    "unlocked_at" TIMESTAMP(3),
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable - Category Progress
CREATE TABLE IF NOT EXISTS "category_progress" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "questions_correct" INTEGER NOT NULL DEFAULT 0,
    "questions_attempted" INTEGER NOT NULL DEFAULT 0,
    "last_played" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable - Daily Activity
CREATE TABLE IF NOT EXISTS "daily_activity" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "questions_answered" INTEGER NOT NULL DEFAULT 0,
    "questions_correct" INTEGER NOT NULL DEFAULT 0,
    "points_earned" INTEGER NOT NULL DEFAULT 0,
    "login_streak" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX IF NOT EXISTS "achievement_definitions_code_key" ON "achievement_definitions"("code");
CREATE INDEX IF NOT EXISTS "achievement_definitions_code_idx" ON "achievement_definitions"("code");
CREATE INDEX IF NOT EXISTS "achievement_definitions_category_idx" ON "achievement_definitions"("category");

CREATE UNIQUE INDEX IF NOT EXISTS "user_achievements_user_id_achievement_id_key" ON "user_achievements"("user_id", "achievement_id");
CREATE INDEX IF NOT EXISTS "user_achievements_user_id_idx" ON "user_achievements"("user_id");
CREATE INDEX IF NOT EXISTS "user_achievements_achievement_id_idx" ON "user_achievements"("achievement_id");
CREATE INDEX IF NOT EXISTS "user_achievements_achieved_idx" ON "user_achievements"("achieved");

CREATE UNIQUE INDEX IF NOT EXISTS "category_progress_user_id_key" ON "category_progress"("user_id");
CREATE INDEX IF NOT EXISTS "category_progress_user_id_idx" ON "category_progress"("user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "daily_activity_user_id_date_key" ON "daily_activity"("user_id", "date");
CREATE INDEX IF NOT EXISTS "daily_activity_user_id_idx" ON "daily_activity"("user_id");
CREATE INDEX IF NOT EXISTS "daily_activity_date_idx" ON "daily_activity"("date");

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "achievement_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "trivia_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "category_progress" ADD CONSTRAINT "category_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "trivia_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "daily_activity" ADD CONSTRAINT "daily_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "trivia_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;