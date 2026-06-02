CREATE TABLE "screening" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"appearance" integer,
	"race" text,
	"notes" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "screening_candidate_id_unique" UNIQUE("candidate_id"),
	CONSTRAINT "appearance_range" CHECK ("screening"."appearance" between 1 and 10)
);
--> statement-breakpoint
ALTER TABLE "screening" ADD CONSTRAINT "screening_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening" ADD CONSTRAINT "screening_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;