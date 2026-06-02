ALTER TABLE "screening" ADD COLUMN "tier" smallint;--> statement-breakpoint
ALTER TABLE "screening" ADD COLUMN "tier_score" integer;--> statement-breakpoint
ALTER TABLE "screening" ADD COLUMN "tier_computed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "screening" ADD CONSTRAINT "tier_range" CHECK ("screening"."tier" between 1 and 3);