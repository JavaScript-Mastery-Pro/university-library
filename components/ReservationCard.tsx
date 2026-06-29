import dayjs from "dayjs";
import Link from "next/link";

import BookCover from "./BookCover";
import ReservationStatus from "./ReservationStatus";
import CancelReservation from "./CancelReservation";

import {
  getEffectiveStatus,
  getQueuePositionLabel,
  formatHoldTimeLeft,
  isActiveReservation,
} from "@/lib/reservations";

const ReservationCard = ({
  id,
  title,
  genre,
  coverColor,
  coverUrl,
  reservation,
  queuePosition,
}: ReservedBook) => {
  const status = getEffectiveStatus(reservation);
  const isReady = status === "READY";
  const queueLabel = isReady ? null : getQueuePositionLabel(queuePosition);
  const timeLeft = formatHoldTimeLeft(reservation);
  const canCancel = isActiveReservation(reservation);

  return (
    <li className="reservation-card">
      <Link href={`/books/${id}`} className="w-full flex flex-col items-center">
        <div
          className="reservation-card_cover"
          style={{ background: `${coverColor}4d` }}
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
        </div>
      </Link>

      <div className="mt-5 w-full space-y-2">
        <ReservationStatus reservation={reservation} />

        {isReady && timeLeft ? (
          <p className="reservation-card_meta">
            A copy is held for you — <strong>{timeLeft}</strong> to borrow it.
          </p>
        ) : queueLabel ? (
          <p className="reservation-card_meta">{queueLabel}</p>
        ) : null}

        <p className="reservation-card_meta">
          Reserved on{" "}
          <time dateTime={dayjs(reservation.createdAt).toISOString()}>
            {dayjs(reservation.createdAt).format("MMM DD")}
          </time>
        </p>
      </div>

      {canCancel && (
        <CancelReservation reservationId={reservation.id} title={title} />
      )}
    </li>
  );
};

export default ReservationCard;
