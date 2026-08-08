CREATE TABLE "log_rollups" (
	"bucket_start" timestamp with time zone NOT NULL,
	"service" text NOT NULL,
	"level" text NOT NULL,
	"count" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "log_rollups_pkey" PRIMARY KEY("bucket_start","service","level")
);
--> statement-breakpoint
CREATE INDEX "log_rollups_bucket_idx" ON "log_rollups" USING btree ("bucket_start");