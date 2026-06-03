ALTER TABLE "screening" DROP CONSTRAINT "appearance_range";--> statement-breakpoint
ALTER TABLE "screening" ADD CONSTRAINT "appearance_range" CHECK ("screening"."appearance" between 1 and 5);