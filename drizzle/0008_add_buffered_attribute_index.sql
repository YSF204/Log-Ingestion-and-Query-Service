CREATE INDEX IF NOT EXISTS "logs_attributes_gin_idx"
ON "logs" USING gin ("attributes" jsonb_path_ops)
WITH (fastupdate = on, gin_pending_list_limit = 65536);--> statement-breakpoint
ALTER INDEX "logs_attributes_gin_idx"
SET (fastupdate = on, gin_pending_list_limit = 65536);
