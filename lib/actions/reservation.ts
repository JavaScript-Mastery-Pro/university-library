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
  inArray,
  lt,
  ne,
  or,
} from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/database/drizzle";
import { books, borrowRecords, reservations, users } from "@/database/schema";
import { promoteNextOrReleaseCopy } from "../reservations.server";
import config from "../config";

// Reservation / hold-queue server actions (ADR 0002). Every mutation derives the
// acting user from the session (never a client-supplied id) and returns the
// `{ success, data | error }` shape (lib AGENTS.md convention) rather than throwing.

// Anchor "today" to UTC so the obligation gate's overdue diff lines up with the
// UTC-midnight day arithmetic used by the borrow gate and `computeFine` (ADR 0001).
dayjs.extend(utc);

const ACTIVE_STATUSES = ["QUEUED", "READY"] as const;

// Obligation gate (ADR 0001 RECOMMEND E, reused verbatim by ADR 0002 invariant
// #9): block users with a finalized unpaid fine OR a live-overdue unreturned book.
async function hasOutstandingObligation(userId: string): Promise<boolean> {
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

  return Boolean(obligation);
}

export async function reserveBook(params: ReserveBookParams) {
  const { bookId } = params;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: "You must be signed in to reserve a book",
      };
    }
    const userId = session.user.id;

    // Account must be APPROVED before joining a queue (ADR 0002 security model).
    const [user] = await db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || user.status !== "APPROVED") {
      return {
        success: false,
        error: "Your account must be approved before you can reserve books.",
      };
    }

    const [book] = await db
      .select({ availableCopies: books.availableCopies })
      .from(books)
      .where(eq(books.id, bookId))
      .limit(1);

    if (!book) {
      return { success: false, error: "Book not found" };
    }

    // Invariant #6: a book with copies must be borrowed directly, not reserved.
    if (book.availableCopies > 0) {
      return {
        success: false,
        error: "This book is available — please borrow it directly.",
      };
    }

    // Invariant #5: can't reserve a book you currently hold.
    const [held] = await db
      .select({ id: borrowRecords.id })
      .from(borrowRecords)
      .where(
        and(
          eq(borrowRecords.userId, userId),
          eq(borrowRecords.bookId, bookId),
          ne(borrowRecords.status, "RETURNED")
        )
      )
      .limit(1);

    if (held) {
      return {
        success: false,
        error: "You already have this book — return it before reserving again.",
      };
    }

    // Invariant #9: obligation gate.
    if (await hasOutstandingObligation(userId)) {
      return {
        success: false,
        error:
          "You have an outstanding late fine or an overdue book. Resolve it before reserving.",
      };
    }

    // Invariant #8: cap on active (QUEUED + READY) reservations per user.
    const [{ active }] = await db
      .select({ active: count() })
      .from(reservations)
      .where(
        and(
          eq(reservations.userId, userId),
          inArray(reservations.status, [...ACTIVE_STATUSES])
        )
      );

    if (active >= config.reservations.maxActiveReservations) {
      return {
        success: false,
        error: `You can have at most ${config.reservations.maxActiveReservations} active reservations. Cancel one to reserve another.`,
      };
    }

    // Invariant #7: no duplicate active reservation. Friendly pre-check; the
    // partial unique index `reservations_active_unique` is the real guard
    // against the TOCTOU race below.
    const [existing] = await db
      .select({ id: reservations.id })
      .from(reservations)
      .where(
        and(
          eq(reservations.userId, userId),
          eq(reservations.bookId, bookId),
          inArray(reservations.status, [...ACTIVE_STATUSES])
        )
      )
      .limit(1);

    if (existing) {
      return {
        success: false,
        error: "You already have an active reservation for this book.",
      };
    }

    try {
      const [created] = await db
        .insert(reservations)
        .values({ userId, bookId, status: "QUEUED" })
        .returning();

      revalidatePath(`/books/${bookId}`);
      revalidatePath("/my-profile");

      return {
        success: true,
        data: JSON.parse(JSON.stringify(created)),
      };
    } catch {
      // Unique-index violation — another request reserved the same book first.
      return {
        success: false,
        error: "You already have an active reservation for this book.",
      };
    }
  } catch (error) {
    console.log(error);
    return { success: false, error: "Error reserving book" };
  }
}

export async function cancelReservation(params: CancelReservationParams) {
  const { reservationId } = params;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        error: "You must be signed in to cancel a reservation",
      };
    }

    const [reservation] = await db
      .select({
        userId: reservations.userId,
        bookId: reservations.bookId,
        status: reservations.status,
      })
      .from(reservations)
      .where(eq(reservations.id, reservationId))
      .limit(1);

    if (!reservation) {
      return { success: false, error: "Reservation not found" };
    }

    // Ownership is enforced server-side against the session (ADR 0002).
    if (reservation.userId !== session.user.id) {
      return {
        success: false,
        error: "You can only cancel your own reservations",
      };
    }

    // Only active reservations can be cancelled.
    if (!ACTIVE_STATUSES.includes(reservation.status as never)) {
      return {
        success: false,
        error: "This reservation can no longer be cancelled.",
      };
    }

    const wasReady = reservation.status === "READY";

    // Guarded transition: only one of {cancel, hold-expiry} can win an active
    // row. If a concurrent expiry already flipped it, zero rows match here.
    const [cancelled] = await db
      .update(reservations)
      .set({ status: "CANCELLED" })
      .where(
        and(
          eq(reservations.id, reservationId),
          eq(reservations.userId, session.user.id),
          inArray(reservations.status, [...ACTIVE_STATUSES])
        )
      )
      .returning();

    if (!cancelled) {
      return {
        success: false,
        error: "This reservation can no longer be cancelled.",
      };
    }

    // Cancelling a READY hold frees its held copy — promote the next in queue
    // or release the copy to the pool (invariant #10). A QUEUED cancel touches
    // no inventory.
    if (wasReady) {
      await promoteNextOrReleaseCopy(reservation.bookId);
    }

    revalidatePath("/my-profile");
    revalidatePath(`/books/${reservation.bookId}`);

    return {
      success: true,
      data: JSON.parse(JSON.stringify(cancelled)),
    };
  } catch (error) {
    console.log(error);
    return { success: false, error: "Error cancelling reservation" };
  }
}

// 1-based rank of a QUEUED reservation among the QUEUED entries for its book,
// ordered by `createdAt` (ADR 0002 RECOMMEND A — derived at read time, never
// stored). Null for any non-QUEUED status.
async function getQueuePosition(
  bookId: string,
  status: ReservationStatus,
  createdAt: Date
): Promise<number | null> {
  if (status !== "QUEUED") return null;

  const [{ ahead }] = await db
    .select({ ahead: count() })
    .from(reservations)
    .where(
      and(
        eq(reservations.bookId, bookId),
        eq(reservations.status, "QUEUED"),
        lt(reservations.createdAt, createdAt)
      )
    );

  return Number(ahead) + 1;
}

export async function getUserReservations(userId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Not authenticated" };
    }

    // Own reservations, or any user's for an ADMIN (live role check, not the
    // session token — matches the admin gate convention).
    if (session.user.id !== userId) {
      const [me] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1);

      if (me?.role !== "ADMIN") {
        return { success: false, error: "Not authorized" };
      }
    }

    const rows = await db
      .select({
        ...getTableColumns(books),
        reservation: { ...getTableColumns(reservations) },
      })
      .from(reservations)
      .innerJoin(books, eq(reservations.bookId, books.id))
      .where(eq(reservations.userId, userId))
      .orderBy(desc(reservations.createdAt));

    const data: ReservedBook[] = [];
    for (const row of rows) {
      const queuePosition = await getQueuePosition(
        row.reservation.bookId,
        row.reservation.status,
        row.reservation.createdAt
      );
      data.push({ ...row, queuePosition } as ReservedBook);
    }

    return {
      success: true,
      data: JSON.parse(JSON.stringify(data)) as ReservedBook[],
    };
  } catch (error) {
    console.log(error);
    return { success: false, error: "Error getting reservations" };
  }
}

// The signed-in user's active reservation for a single book (+ queue position),
// or null. Drives Reserve-button visibility on the book detail page.
export async function getReservationForBook(bookId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: true, data: null };
    }

    const [reservation] = await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.userId, session.user.id),
          eq(reservations.bookId, bookId),
          inArray(reservations.status, [...ACTIVE_STATUSES])
        )
      )
      .orderBy(asc(reservations.createdAt))
      .limit(1);

    if (!reservation) {
      return { success: true, data: null };
    }

    const queuePosition = await getQueuePosition(
      reservation.bookId,
      reservation.status,
      reservation.createdAt
    );

    return {
      success: true,
      data: JSON.parse(
        JSON.stringify({ reservation, queuePosition })
      ) as { reservation: Reservation; queuePosition: number | null },
    };
  } catch (error) {
    console.log(error);
    return { success: false, error: "Error getting reservation" };
  }
}
