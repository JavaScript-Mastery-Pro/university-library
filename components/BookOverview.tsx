import Image from "next/image";
import { eq } from "drizzle-orm";

import BookCover from "./BookCover";
import BorrowBook from "./BorrowBook";
import ReserveBook from "./ReserveBook";

import { db } from "@/database/drizzle";
import { users } from "@/database/schema";
import { getReservationForBook } from "@/lib/actions/reservation";
import { isActiveReservation } from "@/lib/reservations";

interface Props extends Book {
  userId: string;
}

const BookOverview = async ({
  id,
  title,
  author,
  genre,
  rating,
  totalCopies,
  availableCopies,
  description,
  coverColor,
  coverUrl,
  userId,
}: Props) => {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;

  const isAvailable = availableCopies > 0;

  const borrowingEligibility = {
    isEligible: isAvailable && user.status === "APPROVED",
    message:
      availableCopies <= 0
        ? "Book is not available"
        : "You are not allowed to borrow this book until your account is approved",
  };

  // When all copies are out, the book can be reserved instead of borrowed
  // (ADR 0002). The account-level gate mirrors borrowing; the available-copies
  // check is implicit since ReserveBook only renders in this branch.
  const reservationEligibility = {
    isEligible: user.status === "APPROVED",
    message:
      "You are not allowed to reserve this book until your account is approved",
  };

  // The user's active reservation for this book, if any. A READY hold past its
  // window is treated as no longer active (ADR 0002 invariant #3) — the enum can
  // lie if the hold-expiry workflow run was lost — so we drop it here and let the
  // Reserve button show instead of an unactionable "Hold expired" state.
  const reservationResult = await getReservationForBook(id);
  const existing =
    reservationResult.success &&
    reservationResult.data &&
    isActiveReservation(reservationResult.data.reservation)
      ? reservationResult.data
      : null;

  return (
    <section className="book-overview">
      <div className="flex flex-1 flex-col gap-5">
        <h1>{title}</h1>

        <div className="book-info">
          <p>
            By <span className="font-semibold text-light-200">{author}</span>
          </p>

          <p>
            Category: <span className="ml-2 text-primary">{genre}</span>
          </p>

          <div className="flex flex-row gap-1">
            <Image src="/icons/star.svg" alt="star" width={22} height={22} />
            <p>{rating}</p>
          </div>
        </div>

        <div className="book-copies">
          <p>
            Total Books: <span>{totalCopies}</span>
          </p>

          <p>
            Available Books: <span>{availableCopies}</span>
          </p>
        </div>

        <p className="book-description">{description}</p>

        {isAvailable ? (
          <BorrowBook
            bookId={id}
            userId={userId}
            borrowingEligibility={borrowingEligibility}
          />
        ) : (
          <ReserveBook
            bookId={id}
            userId={userId}
            reservationEligibility={reservationEligibility}
            existingReservation={existing?.reservation ?? null}
            queuePosition={existing?.queuePosition ?? null}
          />
        )}
      </div>

      <div className="relative flex flex-1 justify-center">
        <div className="relative">
          <BookCover
            variant="wide"
            className="z-10"
            coverColor={coverColor}
            coverUrl={coverUrl}
          />

          <div className="absolute left-16 top-10 rotate-12 opacity-40 max-sm:hidden">
            <BookCover
              variant="wide"
              coverColor={coverColor}
              coverUrl={coverUrl}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default BookOverview;
