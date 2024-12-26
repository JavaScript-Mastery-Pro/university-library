CREATE TYPE "public"."borrow_status" AS ENUM('BORROWED', 'RETURNED');--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"author" varchar(255) NOT NULL,
	"category" text NOT NULL,
	"cover_image" text,
	"cover_color" varchar(7),
	"summary" varchar(1024) NOT NULL,
	"total_quantity" integer DEFAULT 0 NOT NULL,
	"available_quantity" integer DEFAULT 0 NOT NULL,
	"video_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "books_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "borrow_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"borrow_date" timestamp with time zone DEFAULT now(),
	"due_date" date NOT NULL,
	"return_date" date,
	"status" "borrow_status" DEFAULT 'BORROWED',
	CONSTRAINT "borrow_records_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "borrow_records" ADD CONSTRAINT "borrow_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "borrow_records" ADD CONSTRAINT "borrow_records_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE no action ON UPDATE no action;