"use server";

import dayjs from "dayjs";
import { revalidatePath } from "next/cache";
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  ne,
  or,
  sql,
} from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/database/drizzle";
import { books, borrowRecords, users } from "@/database/schema";
import { workflowClient } from "../workflow";
import config from "../config";

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

    if (!book.length || book[0].availableCopies <= 0) {
      return {
        success: false,
        error: "Book is not available",
      };
    }

    const dueDate = dayjs().add(7, "day").toDate().toDateString();

    const record = await db.insert(borrowRecords).values({
      userId,
      bookId,
      dueDate,
      status: "BORROWED",
    });

    await db
      .update(books)
      .set({
        availableCopies: book[0].availableCopies - 1,
      })
      .where(eq(books.id, bookId));

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

    const returnDate = dayjs().toDate().toDateString();

    const [updated] = await db
      .update(borrowRecords)
      .set({
        status: "RETURNED",
        returnDate,
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

    await db
      .update(books)
      .set({
        availableCopies: sql`${books.availableCopies} + 1`,
      })
      .where(eq(books.id, record.bookId));

    // Refresh the borrowed-books list so the row flips to "Returned" and the
    // freed copy is reflected without a manual reload.
    revalidatePath("/my-profile");

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
