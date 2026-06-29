CREATE TYPE "public"."fine_status" AS ENUM('NONE', 'UNPAID', 'PAID', 'WAIVED');--> statement-breakpoint
ALTER TABLE "borrow_records" ADD COLUMN "fine_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "borrow_records" ADD COLUMN "fine_status" "fine_status" DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE "borrow_records" ADD COLUMN "fine_settled_at" timestamp with time zone;