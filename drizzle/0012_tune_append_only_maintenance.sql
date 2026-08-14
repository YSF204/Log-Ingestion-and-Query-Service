ALTER TABLE "logs" SET (
    autovacuum_vacuum_insert_threshold = 10000000,
    autovacuum_vacuum_insert_scale_factor = 0,
    autovacuum_analyze_threshold = 100000,
    autovacuum_analyze_scale_factor = 0.5
);

DROP INDEX IF EXISTS "log_rollups_bucket_idx";
