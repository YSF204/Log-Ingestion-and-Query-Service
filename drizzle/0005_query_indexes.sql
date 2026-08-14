CREATE INDEX "log_rollups_bucket_service_level_idx" ON "log_rollups" USING btree ("bucket_start", "service", "level");
