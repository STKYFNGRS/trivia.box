CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS questions_body_trgm_idx ON questions USING gin (body gin_trgm_ops);
CREATE INDEX IF NOT EXISTS question_drafts_body_trgm_idx ON question_drafts USING gin (body gin_trgm_ops);
