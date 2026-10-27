ALTER TABLE "recordings" ADD COLUMN "marks" jsonb;--> statement-breakpoint
ALTER TABLE "recordings" ADD COLUMN "marks_synced_at" timestamp;