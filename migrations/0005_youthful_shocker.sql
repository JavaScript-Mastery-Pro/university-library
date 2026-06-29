CREATE TYPE "public"."reservation_status" AS ENUM('QUEUED', 'READY', 'FULFILLED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"status" "reservation_status" DEFAULT 'QUEUED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "reservations_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_active_unique" ON "reservations" USING btree ("user_id","book_id") WHERE status IN ('QUEUED', 'READY');--> statement-breakpoint
CREATE INDEX "reservations_queue_idx" ON "reservations" USING btree ("book_id","status","created_at");