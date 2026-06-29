import dayjs from "dayjs";
import Link from "next/link";
import Image from "next/image";

import BookCover from "./BookCover";
import BookReceipt from "./BookReceipt";
import ReturnBook from "./ReturnBook";
import FineStatus from "./FineStatus";

import { getPlaceholderFine } from "@/lib/placeholder/fines";

export const NormalBook = ({
  id,
  title,
  genre,
  coverColor,
  coverUrl,
}: Book) => {
  return (
    <li className="xs:w-52 w-full">
      <Link href={`/books/${id}`} className="w-full flex flex-col items-center">
        <BookCover coverColor={coverColor} coverUrl={coverUrl} />

        <div className="mt-4 w-full xs:w-44">
          <p className="book-title">{title}</p>
          <p className="book-genre">{genre}</p>
        </div>
      </Link>
    </li>
  );
};

export const BorrowedBook = (props: BorrowedBook) => {
  const { id, title, genre, coverColor, coverUrl, borrow } = props;
  const { id: recordId, borrowDate, dueDate, returnDate, status } = borrow;

  const daysLeft = dayjs(dueDate).diff(dayjs(), "day");

  const isReturned = status === "RETURNED";
  const isOverDue = daysLeft < 0 && status === "BORROWED";

  // Placeholder fine (ADR 0001, sub-task #2) — swapped for stored values at wire-up.
  const fine = getPlaceholderFine(borrow);

  return (
    <li className="borrowed-book">
      {isOverDue && (
        <Image
          src="/icons/warning.svg"
          alt="warning"
          width={30}
          height={30}
          className="absolute -top-3 left-0 object-contain"
        />
      )}

      <Link href={`/books/${id}`} className="w-full flex flex-col items-center">
        <div
          className="borrowed-book_cover"
          style={{
            background: `${coverColor}4d`,
          }}
        >
          <BookCover
            coverColor={coverColor}
            coverUrl={coverUrl}
            variant="medium"
          />
        </div>

        <div className="mt-2 w-full">
          <p className="book-title">{title}</p>
          <p className="book-genre">{genre}</p>

          <div className="mt-5 space-y-1.5">
            <div className="flex flex-row gap-1 items-center">
              <Image
                src="/icons/book-2.svg"
                alt="calendar"
                width={18}
                height={18}
              />
              <p className="text-light-100">
                Borrowed on {dayjs(borrowDate).format("MMM DD")}
              </p>
            </div>

            <div className="flex justify-between items-center gap-2">
              <div className="flex-1 flex flex-row gap-1 items-center">
                <Image
                  src={
                    isReturned
                      ? "/icons/tick.svg"
                      : isOverDue
                        ? "/icons/warning.svg"
                        : "/icons/calendar.svg"
                  }
                  alt="calendar"
                  width={18}
                  height={18}
                />
                <p className="text-light-100">
                  {isReturned
                    ? "Returned on " + dayjs(returnDate).format("MMM DD")
                    : isOverDue
                      ? "Overdue by " + Math.abs(daysLeft) + " days"
                      : `${daysLeft} days left to due`}
                </p>
              </div>

              <BookReceipt {...props} />
            </div>

            {fine.status !== "NONE" && (
              <div className="flex flex-row items-center gap-1">
                <Image
                  src={
                    fine.status === "UNPAID"
                      ? "/icons/warning.svg"
                      : "/icons/tick.svg"
                  }
                  alt=""
                  aria-hidden="true"
                  width={18}
                  height={18}
                />
                <FineStatus status={fine.status} amount={fine.amount} />
              </div>
            )}
          </div>
        </div>
      </Link>

      <ReturnBook
        recordId={recordId}
        bookId={id}
        title={title}
        initialReturned={isReturned}
      />
    </li>
  );
};
