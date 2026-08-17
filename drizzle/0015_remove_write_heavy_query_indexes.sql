-- These indexes were experimentally restored but add too much write
-- amplification for the one-CPU PostgreSQL benchmark container.
DROP INDEX IF EXISTS logs_message_trgm_idx;
DROP INDEX IF EXISTS logs_level_timestamp_id_idx;
