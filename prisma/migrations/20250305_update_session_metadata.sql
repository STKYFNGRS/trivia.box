-- This migration updates existing question_sequence fields to use the new structure
-- where metadata is included within the question_sequence JSON

-- Create a function to transform the question_sequence
CREATE OR REPLACE FUNCTION transform_question_sequence()
RETURNS VOID AS $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN SELECT id, question_sequence FROM trivia_game_sessions
    LOOP
        -- Check if the question_sequence is already in the new format
        -- (containing 'questions' field)
        IF rec.question_sequence::jsonb ? 'questions' THEN
            -- Already in the new format, skip
            CONTINUE;
        END IF;
        
        -- Update to new format
        UPDATE trivia_game_sessions
        SET question_sequence = jsonb_build_object(
            'questions', rec.question_sequence::jsonb,
            'metadata', jsonb_build_object(
                'migratedAt', NOW(),
                'migrationNote', 'Migrated to new format with metadata'
            )
        )::text
        WHERE id = rec.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute the function
SELECT transform_question_sequence();

-- Clean up the function when done
DROP FUNCTION transform_question_sequence();
