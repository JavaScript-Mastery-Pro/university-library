"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "./ui/button";
import ReservationStatus from "./ReservationStatus";

import { toast } from "@/hooks/use-toast";
import {
  getReservationDisplay,
  getQueuePositionLabel,
  formatHoldTimeLeft,
} from "@/lib/reservations";
import { reserveBook } from "@/lib/actions/reservation";
import { borrowBook } from "@/lib/actions/book";

interface Props {
  userId: string;
  bookId: string;
  // Account-level gate (approved + no outstanding obligations). The available-
  // copies check is implicit: this component only renders when availableCopies = 0.
  reservationEligibility: {
    isEligible: boolean;
    message: string;
  };
  // The user's current active reservation for this book, if any. When present
  // the Reserve button is replaced by the live status (ADR 0002 acceptance
  // criteria). Queue position is the 1-based rank among QUEUED entries.
  existingReservation?: Reservation | null;
  queuePosition?: number | null;
}

const ReserveBook = ({
  userId,
  bookId,
  reservationEligibility,
  existingReservation = null,
  queuePosition = null,
}: Props) => {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  // After a successful placeholder reservation we show the queued state inline
  // without a round-trip. Real data arrives via revalidation once wired up.
  const [localReservation, setLocalReservation] = useState<Reservation | null>(
    existingReservation
  );

  // Single persistent polite live region. We drive its text via state and only
  // change it on a real transition (reservation placed, queue position moves,
  // hold becomes ready) so screen readers announce those without re-reading
  // static content. A live region injected together with its text is missed by
  // some readers — keeping one region always mounted avoids that.
  const [announcement, setAnnouncement] = useState("");
  const didMount = useRef(false);

  const ineligible = !reservationEligibility.isEligible;
  const noteId = `reserve-note-${bookId}`;

  const display = localReservation
    ? getReservationDisplay(localReservation)
    : null;
  const isActionable = display?.isActionable ?? false;
  const timeLeft = localReservation ? formatHoldTimeLeft(localReservation) : null;
  const queueLabel = getQueuePositionLabel(queuePosition);

  // Announce reservation state changes politely. Skip the first render so a user
  // who lands on a page where they already hold a reservation isn't interrupted —
  // the visible badge and note already carry the state for them to navigate to.
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }

    if (!localReservation) {
      setAnnouncement("");
    } else if (isActionable) {
      setAnnouncement(
        timeLeft
          ? `A copy is held for you. You have ${timeLeft} to borrow it.`
          : "A copy is held for you — ready to borrow."
      );
    } else if (queueLabel) {
      setAnnouncement(`${queueLabel}. We'll email you when a copy is ready.`);
    } else {
      setAnnouncement("");
    }
  }, [localReservation, isActionable, timeLeft, queueLabel]);

  const handleReserve = async () => {
    if (ineligible) {
      toast({
        title: "Can't reserve",
        description: reservationEligibility.message,
        variant: "destructive",
      });
      return;
    }

    setPending(true);
    try {
      const result = await reserveBook({ bookId });
      if (result.success) {
        setLocalReservation({
          id: `pending-${bookId}`,
          userId,
          bookId,
          status: "QUEUED",
          createdAt: new Date(),
          expiresAt: null,
        });
        // Pull the server-rendered queue position (and any concurrent state)
        // now that the reservation row exists. The position is announced by the
        // live-region effect once the refreshed props arrive.
        router.refresh();
        toast({
          title: "Reservation placed",
          description: "You're in the queue. We'll email you when a copy is ready.",
        });
      } else {
        toast({
          title: "Couldn't reserve",
          description: result.error ?? "Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.log(error);
      toast({
        title: "Couldn't reserve",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  };

  const handleBorrowHeld = async () => {
    setPending(true);
    try {
      const result = await borrowBook({ bookId, userId });
      if (result.success) {
        toast({
          title: "Success",
          description: "Your held copy has been borrowed.",
        });
        router.push("/my-profile");
      } else {
        toast({
          title: "Error",
          description: result.error ?? "Couldn't borrow your held copy.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.log(error);
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="reserve-book">
      {/* Persistent polite live region (visually hidden) — announces queue
          position and hold-readiness changes. The visible badge/note below
          carry the same information for sighted users. */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      {localReservation ? (
        // ── Active reservation: show live status instead of the Reserve button ──
        <>
          <div className="reserve-book_status">
            <ReservationStatus reservation={localReservation} />
            {isActionable && timeLeft ? (
              <p className="reserve-book_note">
                A copy is held for you — <strong>{timeLeft}</strong> to borrow it.
              </p>
            ) : queueLabel ? (
              <p className="reserve-book_note">
                {queueLabel}. We'll email you when a copy is ready.
              </p>
            ) : null}
          </div>

          {isActionable && (
            <Button
              className="reserve-book_btn"
              onClick={handleBorrowHeld}
              disabled={pending}
              aria-busy={pending}
            >
              <Image
                src="/icons/book.svg"
                alt=""
                aria-hidden="true"
                width={20}
                height={20}
              />
              <span className="font-bebas-neue text-xl text-dark-100">
                {pending ? "Borrowing..." : "Borrow held copy"}
              </span>
            </Button>
          )}
        </>
      ) : (
        // ── No active reservation: offer to join the queue ──
        <>
          <Button
            className="reserve-book_btn"
            onClick={handleReserve}
            disabled={pending}
            aria-busy={pending}
            // Kept focusable (aria-disabled, not native disabled) when the user
            // is ineligible so a keyboard/screen-reader user can land on it and
            // hear *why* via the linked note, rather than meeting a silently
            // dead control. The click handler guards the action.
            aria-disabled={ineligible || undefined}
            aria-describedby={noteId}
          >
            <Image
              src="/icons/clock.svg"
              alt=""
              aria-hidden="true"
              width={20}
              height={20}
            />
            <span className="font-bebas-neue text-xl text-dark-100">
              {pending ? "Reserving..." : "Reserve Book"}
            </span>
          </Button>

          <p id={noteId} className="reserve-book_note">
            {ineligible
              ? reservationEligibility.message
              : "All copies are out. Reserve to join the waitlist — a copy will be held for you when one is returned."}
          </p>
        </>
      )}
    </div>
  );
};

export default ReserveBook;
