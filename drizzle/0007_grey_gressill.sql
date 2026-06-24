CREATE TABLE "wa_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"type" text NOT NULL,
	"template_name" text,
	"body" text,
	"wa_message_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"sent_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wa_messages_wa_message_id_unique" UNIQUE("wa_message_id"),
	CONSTRAINT "wa_direction" CHECK ("wa_messages"."direction" in ('in', 'out')),
	CONSTRAINT "wa_type" CHECK ("wa_messages"."type" in ('template', 'text')),
	CONSTRAINT "wa_status" CHECK ("wa_messages"."status" in ('queued', 'sent', 'delivered', 'read', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;