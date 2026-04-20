-- 0006: de-duplicate any pre-existing rows then enforce one answer per
-- (player, session_question) at the database level so concurrent submits
-- can never double-score a player.

DELETE FROM answers a
USING answers b
WHERE a.ctid < b.ctid
  AND a.player_id = b.player_id
  AND a.session_question_id = b.session_question_id;

CREATE UNIQUE INDEX IF NOT EXISTS answers_player_session_question_uidx
  ON answers (player_id, session_question_id);
