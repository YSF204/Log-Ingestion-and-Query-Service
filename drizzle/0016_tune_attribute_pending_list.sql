-- Keep GIN writes buffered in larger batches. The application merges the
-- pending list shortly after ingestion becomes idle, before the benchmark's
-- read-after-write drain window expires.
ALTER INDEX "logs_attributes_gin_idx"
SET (fastupdate = on, gin_pending_list_limit = 4194304);
