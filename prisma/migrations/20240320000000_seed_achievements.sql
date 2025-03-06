-- AddAchievementSeeds
-- This migration only adds achievement definitions and won't affect existing data
INSERT INTO achievement_definitions (code, name, description, category, icon, tier, requirements)
VALUES
  ('SCIENCE_MASTER', 'Science Master', 'Answer 50 science questions correctly', 'MASTERY', '🧪', 'GOLD', '{"total": 50, "category": "SCIENCE"}'),
  ('TECH_MASTER', 'Tech Guru', 'Answer 50 technology questions correctly', 'MASTERY', '💻', 'GOLD', '{"total": 50, "category": "TECHNOLOGY"}'),
  ('DAILY_STREAK_7', 'Week Warrior', 'Complete games 7 days in a row', 'STREAK', '📅', 'SILVER', '{"total": 7}'),
  ('SPEED_DEMON', 'Speed Demon', 'Answer 10 questions correctly under 3 seconds each', 'SPEED', '⚡', 'GOLD', '{"total": 10, "timeLimit": 3000}'),
  ('PERFECT_10', 'Perfect 10', 'Get all questions correct in a 10-question game', 'SPECIAL', '🏆', 'GOLD', '{"total": 10}')
ON CONFLICT (code) DO NOTHING;