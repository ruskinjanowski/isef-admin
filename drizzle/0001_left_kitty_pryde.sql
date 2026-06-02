DROP INDEX "candidates_status_idx";--> statement-breakpoint
ALTER TABLE "candidates" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "candidates" DROP COLUMN "notes";