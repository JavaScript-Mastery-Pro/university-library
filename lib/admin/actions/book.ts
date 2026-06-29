"use server";

import {
  or,
  desc,
  asc,
  eq,
  count,
  ilike,
  and,
  getTableColumns,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/database/drizzle";
import { books, borrowRecords, users } from "@/database/schema";

const ITEMS_PER_PAGE = 20;

export async function createBook(params: BookParams) {
  try {
    const newBook = await db
      .insert(books)
      .values({
        ...params,
        availableCopies: params.totalCopies,
      })
      .returning();

    return {
      success: true,
      data: JSON.parse(JSON.stringify(newBook[0])),
    };
  } catch (error) {
    console.log(error);
    return {
      success: false,
      error: "Error creating book",
    };
  }
}

export async function getBooks({
  query,
  sort = "available",
  page = 1,
  limit = ITEMS_PER_PAGE,
}: QueryParams) {
  try {
    const searchConditions = query
      ? or(
          ilike(books.title, `%${query}%`),
          ilike(books.genre, `%${query}%`),
          ilike(books.author, `%${query}%`)
        )
      : undefined;

    const sortOptions: Record<string, any> = {
      newest: desc(books.createdAt),
      oldest: asc(books.createdAt),
      highestRated: desc(books.rating),
      available: desc(books.totalCopies),
    };

    const sortingCondition = sortOptions[sort] || desc(books.createdAt);

    const booksData = await db
      .select()
      .from(books)
      .where(searchConditions)
      .orderBy(sortingCondition)
      .limit(limit)
      .offset((page - 1) * limit);

    const totalItems = await db
      .select({
        count: count(books.id),
      })
      .from(books)
      .where(searchConditions);

    const totalPages = Math.ceil(totalItems[0].count / ITEMS_PER_PAGE);
    const hasNextPage = page < totalPages;

    return {
      success: true,
      data: booksData,
      metadata: {
        totalPages,
        hasNextPage,
      },
    };
  } catch (error) {
    console.error("Error fetching books:", error);
    return {
      success: false,
      error: "An error occurred while fetching books",
    };
  }
}

export async function getBorrowRecords({
  query,
  sort = "available",
  page = 1,
  limit = ITEMS_PER_PAGE,
}: QueryParams) {
  try {
    const offset = (page - 1) * limit;

    const searchConditions = query
      ? or(
          ilike(books.title, `%${query}%`),
          ilike(books.genre, `%${query}%`),
          ilike(users.fullname, `%${query}%`)
        )
      : undefined;

    const sortOptions = {
      newest: desc(books.createdAt),
      oldest: asc(books.createdAt),
      highestRated: desc(books.rating),
      available: desc(books.availableCopies),
    };

    const sortingCondition =
      sortOptions[sort as keyof typeof sortOptions] || sortOptions.available;

    const [borrowRecordsData, totalItems] = await Promise.all([
      db
        .select({
          ...getTableColumns(books),
          borrow: {
            ...getTableColumns(borrowRecords),
          },
          user: {
            ...getTableColumns(users),
          },
        })
        .from(borrowRecords)
        .innerJoin(books, eq(borrowRecords.bookId, books.id))
        .innerJoin(users, eq(borrowRecords.userId, users.id))
        .where(searchConditions ? and(searchConditions) : undefined)
        .orderBy(sortingCondition)
        .limit(limit)
        .offset(offset),

      db
        .select({ count: count() })
        .from(borrowRecords)
        .innerJoin(books, eq(borrowRecords.bookId, books.id))
        .innerJoin(users, eq(borrowRecords.userId, users.id))
        .where(searchConditions ? and(searchConditions) : undefined),
    ]);

    const totalCount = Number(totalItems[0]?.count) || 0;
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;

    return {
      success: true,
      data: borrowRecordsData,
      metadata: {
        totalPages,
        hasNextPage,
        totalCount,
        currentPage: page,
      },
    };
  } catch (error) {
    console.error("Error fetching borrow records:", error);
    return {
      success: false,
      error: "Something went wrong while fetching borrow records.",
    };
  }
}

export async function editBook(params: UpdateBookParams) {
  try {
    const existingBook = await db
      .select()
      .from(books)
      .where(eq(books.id, params.bookId))
      .limit(1);

    if (existingBook.length === 0) {
      return {
        success: false,
        error: "Book not found",
      };
    }

    // calculate availableCopies
    const availableCopies =
      params.totalCopies -
      (params.totalCopies - existingBook[0].availableCopies);

    const updatedBook = await db
      .update(books)
      .set({
        ...params,
        availableCopies,
      })
      .where(eq(books.id, params.bookId))
      .returning();

    return {
      success: true,
      data: JSON.parse(JSON.stringify(updatedBook[0])),
    };
  } catch (error) {
    console.error("Error editing book:", error);
    return {
      success: false,
      error: "Error editing book",
    };
  }
}

export async function getBook({ id }: { id: string }) {
  try {
    const book = await db.select().from(books).where(eq(books.id, id)).limit(1);

    return {
      success: true,
      data: JSON.parse(JSON.stringify(book[0])),
    };
  } catch (error) {
    console.log(error);
    return {
      success: false,
      error: "Error getting book",
    };
  }
}

/**
 * Settle an outstanding fine (ADR 0001). Admin-only — gated by the live DB role
 * check in `app/admin/layout.tsx`; the session token alone is never trusted, so
 * these actions carry no extra role check (consistent with the other admin
 * actions in this file).
 *
 * `markFinePaid` → PAID (collected), `waiveFine` → WAIVED (forgiven). Both are
 * terminal: the guarded `WHERE fine_status = 'UNPAID'` makes them idempotent and
 * rejects a record that isn't currently UNPAID (already settled, or never fined).
 */
async function settleFine(
  recordId: string,
  to: "PAID" | "WAIVED"
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const [updated] = await db
    .update(borrowRecords)
    .set({
      fineStatus: to,
      fineSettledAt: new Date(),
    })
    .where(
      and(
        eq(borrowRecords.id, recordId),
        eq(borrowRecords.fineStatus, "UNPAID")
      )
    )
    .returning();

  if (!updated) {
    return {
      success: false,
      error: "No unpaid fine found for this record",
    };
  }

  // Reflect the new fine state on the admin borrow-records list immediately.
  revalidatePath("/admin/borrow-records");

  return {
    success: true,
    data: JSON.parse(JSON.stringify(updated)),
  };
}

export async function markFinePaid({ recordId }: FineActionParams) {
  try {
    return await settleFine(recordId, "PAID");
  } catch (error) {
    console.error("Error marking fine paid:", error);
    return {
      success: false,
      error: "Error marking fine paid",
    };
  }
}

export async function waiveFine({ recordId }: FineActionParams) {
  try {
    return await settleFine(recordId, "WAIVED");
  } catch (error) {
    console.error("Error waiving fine:", error);
    return {
      success: false,
      error: "Error waiving fine",
    };
  }
}
