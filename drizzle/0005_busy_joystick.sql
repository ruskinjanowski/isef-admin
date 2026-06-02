ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'reviewer' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "user_role" CHECK ("users"."role" in ('admin', 'reviewer'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "user_status" CHECK ("users"."status" in ('pending', 'approved', 'disabled'));--> statement-breakpoint
-- Bootstrap: the new columns default every existing account to pending/reviewer,
-- which would lock everyone out with no admin to approve them. Promote the
-- earliest-created account to approved admin (mirrors the first-user hook in
-- src/lib/auth.ts). No-op on an empty table — the first sign-up is bootstrapped
-- by that hook instead.
UPDATE "users" SET "role" = 'admin', "status" = 'approved'
WHERE "id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1);