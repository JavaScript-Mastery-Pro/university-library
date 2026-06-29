import { sql } from "drizzle-orm";
import {
  integer,
  text,
  pgTable,
  varchar,
  pgEnum,
  date,
  numeric,
  timestamp,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ROLE_ENUM = pgEnum("role", ["USER", "ADMIN"]);
const STATUS_ENUM = pgEnum("status", ["PENDING", "APPROVED", "REJECTED"]);
const BORROW_STATUS_ENUM = pgEnum("borrow_status", [
  "OVERDUE",
  "BORROWED",
  "RETURNED",
]);
const FINE_STATUS_ENUM = pgEnum("fine_status", [
  "NONE",
  "UNPAID",
  "PAID",
  "WAIVED",
]);
const RESERVATION_STATUS_ENUM = pgEnum("reservation_status", [
  "QUEUED",
  "READY",
  "FULFILLED",
  "EXPIRED",
  "CANCELLED",
]);

export const users = pgTable("users", {
  id: uuid("id").notNull().primaryKey().defaultRandom().unique(),
  fullname: varchar("fullname", { length: 255 }).notNull(),
  email: text("email").notNull().unique(),
  universityId: integer("university_id").notNull().unique(),
  password: text("password").notNull(),
  universityCard: text("university_card").notNull(),
  status: STATUS_ENUM("status").default("PENDING"),
  role: ROLE_ENUM("role").default("USER"),
  lastActivityDate: date("last_activity_date").defaultNow(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
  }).defaultNow(),
});

export const books = pgTable("books", {
  id: uuid("id").notNull().primaryKey().defaultRandom().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  author: varchar("author", { length: 255 }).notNull(),
  genre: text("genre").notNull(),
  rating: integer("rating").notNull(),
  coverUrl: text("cover_url").notNull(),
  coverColor: varchar("cover_color", { length: 7 }).notNull(),
  description: text("description").notNull(),
  totalCopies: integer("total_copies").notNull().default(0),
  availableCopies: integer("available_copies").notNull().default(0),
  videoUrl: text("video_url").notNull(),
  summary: varchar("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const borrowRecords = pgTable("borrow_records", {
  id: uuid("id").notNull().primaryKey().defaultRandom().unique(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  bookId: uuid("book_id")
    .references(() => books.id)
    .notNull(),
  borrowDate: timestamp("borrow_date", { withTimezone: true })
    .defaultNow()
    .notNull(),
  dueDate: date("due_date").notNull(),
  returnDate: date("return_date"),
  status: BORROW_STATUS_ENUM("status").default("BORROWED").notNull(),
  // Late-fine fields (ADR 0001). `fineAmount` is null until frozen at return;
  // `fineStatus` defaults to NONE; `fineSettledAt` is set when an admin marks
  // the fine PAID or WAIVED.
  fineAmount: numeric("fine_amount", { precision: 10, scale: 2 }),
  fineStatus: FINE_STATUS_ENUM("fine_status").default("NONE").notNull(),
  fineSettledAt: timestamp("fine_settled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Book reservations / hold queue (ADR 0002). Queue position is derived at read
// time from `(bookId, status, createdAt)` — never stored. `expiresAt` is set
// only when a reservation transitions QUEUED → READY (now + holdWindowHours).
export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").notNull().primaryKey().defaultRandom().unique(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    bookId: uuid("book_id")
      .references(() => books.id)
      .notNull(),
    status: RESERVATION_STATUS_ENUM("status").default("QUEUED").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    // Dedup: at most one active reservation per (user, book). Partial unique
    // index over active statuses only — terminal rows don't block re-reserving.
    uniqueIndex("reservations_active_unique")
      .on(table.userId, table.bookId)
      .where(sql`status IN ('QUEUED', 'READY')`),
    // Queue ordering + position derivation per book.
    index("reservations_queue_idx").on(
      table.bookId,
      table.status,
      table.createdAt,
    ),
  ],
);
