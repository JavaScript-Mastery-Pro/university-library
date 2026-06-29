"use server";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { revalidatePath } from "next/cache";
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  lt,
  ne,
  or,
} from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/database/drizzle";
import { books, borrowRecords, reservations, users } from "@/database/schema";
import { workflowClient } from "../workflow";
import config from "../config";
import { computeFine } from "../fines";
import { promoteNextOrReleaseCopy } from "../reservations.server";

// Anchor every "today"/due-date computation to UTC so they line up with the
// UTC-midnight day arithmetic in `computeFine` (ADR 0001, RECOMMEND D). Without
// this, a server in a timezone behind UTC could read a different calendar day
// near midnight than the fine helper, producing an off-by-one in the overdue
// diff and the borrow gate. `dayjs.extend` is idempotent.
dayjs.extend(utc);

const ITEMS_PER_PAGE = 20;

export async function borrowBook(params: BorrowBookParams) {
  const { userId, bookId } = params;

  try {
    const book = await db
      .select({
        availableCopies: books.availableCopies,
      })
      .from(books)
      .where(eq(books.id, bookId))
      .limit(1);

    if (!book.length) {
      return {
        success: false,
        error: "Book is not available",
      };
    }

    // When there are no free copies, the only way to borrow is a copy held for
    // THIS user by a live READY reservation (ADR 0002 RECOMMEND D). A READY hold
    // past `expiresAt` is treated as not actionable — the enum can lie if the
    // hold-expiry workflow run was lost (invariant #3). When fulfilled, the held
    // copy becomes the borrowed copy: `availableCopies` is NOT decremented.
    let heldReservationId: string | null = null;
    if (book[0].availableCopies <= 0) {
      const [ready] = await db
        .select({ id: reservations.id, expiresAt: reservations.expiresAt })
        .from(reservations)
        .where(
          and(
            eq(reservations.userId, userId),
            eq(reservations.bookId, bookId),
            eq(reservations.status, "READY")
          )
        )
        .limit(1);

      const holdLive =
        ready &&
        (!ready.expiresAt || dayjs(ready.expiresAt).isAfter(dayjs()));

      if (!holdLive) {
        return {
          success: false,
          error: "Book is not available",
        };
      }

      heldReservationId = ready.id;
    }

    // Borrow gate (ADR 0001, RECOMMEND E): block users with an unsettled
    // obligation. First clause catches finalized unpaid fines; the second
    // catches live-overdue unreturned books (whose fine isn't frozen yet),
    // closing the loophole. Single-table scan on `userId`.
    const today = dayjs.utc().format("YYYY-MM-DD");
    const [obligation] = await db
      .select({ id: borrowRecords.id })
      .from(borrowRecords)
      .where(
        and(
          eq(borrowRecords.userId, userId),
          or(
            eq(borrowRecords.fineStatus, "UNPAID"),
            and(
              ne(borrowRecords.status, "RETURNED"),
              lt(borrowRecords.dueDate, today)
            )
          )
        )
      )
      .limit(1);

    if (obligation) {
      return {
        success: false,
        error:
          "You have an outstanding late fine or an overdue book. Resolve it before borrowing.",
      };
    }

    // Store the `date` column as a bare ISO `YYYY-MM-DD` (UTC), the exact shape
    // `computeFine` parses back with `dayjs.utc`. `.toDateString()` produced a
    // locale string like "Mon Jul 06 2026" and used the server's local day —
    // both fragile inputs to the date column and the fine diff.
    const dueDate = dayjs.utc().add(7, "day").format("YYYY-MM-DD");

    // Fulfilling a held copy: claim the reservation BEFORE creating the borrow
    // record, with a guarded UPDATE (ADR 0002 RECOMMEND G). If a concurrent
    // hold-expiry run already flipped it to EXPIRED, zero rows match and we
    // abort rather than borrow a copy that's no longer held for this user.
    if (heldReservationId) {
      const [fulfilled] = await db
        .update(reservations)
        .set({ status: "FULFILLED" })
        .where(
          and(
            eq(reservations.id, heldReservationId),
            eq(reservations.userId, userId),
            eq(reservations.status, "READY")
          )
        )
        .returning();

      if (!fulfilled) {
        return {
          success: false,
          error: "Your hold is no longer available.",
        };
      }
    }

    const record = await db.insert(borrowRecords).values({
      userId,
      bookId,
      dueDate,
      status: "BORROWED",
    });

    // Held copy becomes the borrowed copy — `availableCopies` stays at 0 and is
    // only decremented on a normal borrow from the free pool (ADR 0002).
    if (!heldReservationId) {
      await db
        .update(books)
        .set({
          availableCopies: book[0].availableCopies - 1,
        })
        .where(eq(books.id, bookId));
    }

    await workflowClient.trigger({
      url: `${config.env.prodApiEndpoint}/api/workflow/borrow-book`,
      body: {
        userId,
        bookId,
        borrowDate: dayjs().toDate().toDateString(),
        dueDate,
      },
    });

    return {
      success: true,
      data: JSON.parse(JSON.stringify(record)),
    };
  } catch (error) {
    console.log(error);
    return {
      success: false,
      error: "Error borrowing book",
    };
  }
}

export async function returnBook(params: ReturnBookParams) {
  const { recordId } = params;

  try {
    // Ownership is checked against the authenticated session, never a
    // caller-supplied id — a passed-in userId would make the guard meaningless.
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: "You must be signed in to return a book",
      };
    }

    const [record] = await db
      .select({
        userId: borrowRecords.userId,
        bookId: borrowRecords.bookId,
        status: borrowRecords.status,
        dueDate: borrowRecords.dueDate,
      })
      .from(borrowRecords)
      .where(eq(borrowRecords.id, recordId))
      .limit(1);

    if (!record) {
      return {
        success: false,
        error: "Borrow record not found",
      };
    }

    if (record.userId !== session.user.id) {
      return {
        success: false,
        error: "You can only return books you borrowed",
      };
    }

    if (record.status === "RETURNED") {
      return {
        success: false,
        error: "This book has already been returned",
      };
    }

    // Normalized to ISO `YYYY-MM-DD` in UTC so it stores cleanly in the `date`
    // column and feeds the UTC-anchored fine helper without timezone drift —
    // the same anchor `computeFine` uses for the day diff.
    const returnDate = dayjs.utc().format("YYYY-MM-DD");

    // Freeze the fine at return time (ADR 0001, RECOMMEND C): a future rate
    // change must never alter a settled debt. Within grace → no fine (stays
    // NONE/null); overdue → UNPAID with the frozen amount. Written in the same
    // guarded UPDATE so it commits atomically with the status flip.
    const fine = computeFine(record.dueDate, returnDate);
    const fineFields =
      fine > 0
        ? { fineAmount: fine.toFixed(2), fineStatus: "UNPAID" as const }
        : {};

    const [updated] = await db
      .update(borrowRecords)
      .set({
        status: "RETURNED",
        returnDate,
        ...fineFields,
      })
      .where(
        and(
          eq(borrowRecords.id, recordId),
          eq(borrowRecords.userId, session.user.id),
          // "not already returned" — an OVERDUE record is still returnable.
          ne(borrowRecords.status, "RETURNED")
        )
      )
      .returning();

    // No row matched the guarded WHERE — a concurrent return won the race.
    if (!updated) {
      return {
        success: false,
        error: "This book has already been returned",
      };
    }

    // On-return hook (ADR 0002 RECOMMEND C + D): hand the freed copy to the
    // front of the reservation queue (promote QUEUED → READY, hold the copy,
    // trigger the hold-expiry workflow) instead of returning it to the pool.
    // Only when the queue is empty is `availableCopies` incremented. This keeps
    // the held-copy invariant intact — the freed copy is never simultaneously
    // available AND held.
    await promoteNextOrReleaseCopy(record.bookId);

    // Refresh the borrowed-books list so the row flips to "Returned", and the
    // book page so its Reserve button / availability reflects the promotion.
    revalidatePath("/my-profile");
    revalidatePath(`/books/${record.bookId}`);

    return {
      success: true,
      data: JSON.parse(JSON.stringify(updated)),
    };
  } catch (error) {
    console.log(error);
    return {
      success: false,
      error: "Error returning book",
    };
  }
}

export async function getBorrowedBooks(userId: string) {
  try {
    const borrowedBooks = await db
      .select({
        ...getTableColumns(books),
        borrow: {
          ...getTableColumns(borrowRecords),
        },
      })
      .from(borrowRecords)
      .innerJoin(books, eq(borrowRecords.bookId, books.id))
      .innerJoin(users, eq(borrowRecords.userId, users.id))
      .where(eq(borrowRecords.userId, userId))
      .orderBy(desc(borrowRecords.borrowDate));

    return {
      success: true,
      data: JSON.parse(JSON.stringify(borrowedBooks)),
    };
  } catch (error) {
    console.log(error);
    return {
      success: false,
      error: "Error getting borrowed books",
    };
  }
}

export async function searchBooks({
  query,
  sort = "available",
  page = 1,
}: {
  query?: string;
  sort?: string;
  page?: number;
}) {
  try {
    const searchConditions = query
      ? or(
          ilike(books.title, `%${query}%`),
          ilike(books.genre, `%${query}%`),
          ilike(books.author, `%${query}%`)
        )
      : undefined;

    const sortOptions: { [key: string]: any } = {
      newest: desc(books.createdAt),
      oldest: asc(books.createdAt),
      highestRated: desc(books.rating),
      available: desc(books.totalCopies),
    };

    const sortingCondition = sortOptions[sort] || desc(books.totalCopies);

    const allBooks = await db
      .select()
      .from(books)
      .where(searchConditions)
      .orderBy(sortingCondition)
      .limit(ITEMS_PER_PAGE)
      .offset((page - 1) * ITEMS_PER_PAGE);

    const totalBooks = await db
      .select({
        count: count(),
      })
      .from(books)
      .where(searchConditions);

    const totalPage = Math.ceil(totalBooks[0].count / ITEMS_PER_PAGE);
    const hasNextPage = page < totalPage;

    return {
      success: true,
      data: JSON.parse(JSON.stringify(allBooks)),
      metadata: {
        totalPage,
        hasNextPage,
      },
    };
  } catch (error) {
    console.log(error);
    return {
      success: false,
      error: "Error searching books",
    };
  }
}
