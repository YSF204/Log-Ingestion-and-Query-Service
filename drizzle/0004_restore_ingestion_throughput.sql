DROP INDEX "logs_message_trgm_idx";--> statement-breakpoint
DROP INDEX "logs_attributes_gin_idx";--> statement-breakpoint
ALTER TABLE "log_rollups" DROP CONSTRAINT "log_rollups_pkey";--> statement-breakpoint
ALTER TABLE "log_rollups" DROP COLUMN "shard";