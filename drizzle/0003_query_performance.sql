CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
ALTER TABLE "log_rollups" ADD COLUMN "shard" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TEMPORARY TABLE "compacted_log_rollups" ON COMMIT DROP AS
SELECT
	"bucket_start",
	"service",
	"level",
	0::integer AS "shard",
	sum("count")::bigint AS "count"
FROM "log_rollups"
GROUP BY "bucket_start", "service", "level";--> statement-breakpoint
TRUNCATE TABLE "log_rollups";--> statement-breakpoint
INSERT INTO "log_rollups" ("bucket_start", "service", "level", "shard", "count")
SELECT "bucket_start", "service", "level", "shard", "count"
FROM "compacted_log_rollups"
WHERE "count" <> 0;--> statement-breakpoint
ALTER TABLE "log_rollups" ADD CONSTRAINT "log_rollups_pkey" PRIMARY KEY("bucket_start","service","level","shard");--> statement-breakpoint
DROP INDEX "logs_timestamp_idx";--> statement-breakpoint
DROP INDEX "logs_service_timestamp_idx";--> statement-breakpoint
DROP INDEX "logs_level_timestamp_idx";--> statement-breakpoint
CREATE INDEX "logs_timestamp_id_idx" ON "logs" USING btree ("timestamp","id");--> statement-breakpoint
CREATE INDEX "logs_service_timestamp_id_idx" ON "logs" USING btree ("service","timestamp","id");--> statement-breakpoint
CREATE INDEX "logs_level_timestamp_id_idx" ON "logs" USING btree ("level","timestamp","id");--> statement-breakpoint
CREATE INDEX "logs_message_trgm_idx" ON "logs" USING gin ("message" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "logs_attributes_gin_idx" ON "logs" USING gin ("attributes" jsonb_ops);
