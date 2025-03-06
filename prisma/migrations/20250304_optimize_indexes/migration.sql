-- Add compound indexes for faster query performance
CREATE INDEX IF NOT EXISTS "trivia_player_responses_user_game_correct_idx" ON "trivia_player_responses" ("user_id", "game_session_id", "is_correct");
CREATE INDEX IF NOT EXISTS "trivia_player_responses_game_answered_idx" ON "trivia_player_responses" ("game_session_id", "answered_at");