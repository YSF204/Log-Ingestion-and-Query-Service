-- Query-focused indexes. These are intentionally isolated so their impact on
-- the high-throughput ingestion workload can be measured independently.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS logs_message_trgm_idx
ON logs USING gin (message gin_trgm_ops);

CREATE INDEX IF NOT EXISTS logs_level_timestamp_id_idx
ON logs (level, timestamp, id);
