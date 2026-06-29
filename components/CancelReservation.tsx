"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "./ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cancelReservation } from "@/lib/actions/reservation";

interface Props {
  reservationId: string;
  title: string;
  // True when the reservation is already in a terminal state (cancelled,
  // expired, fulfilled) — cancelling is not offered.
  initialCancelled?: boolean;
}

type Status = "idle" | "cancelling" | "error";

const CancelReservation = ({
  reservationId,
  title,
  initialCancelled,
}: Props) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [cancelled, setCancelled] = useState(Boolean(initialCancelled));

  // On success the trigger unmounts (replaced by the "Cancelled" badge), so move
  // focus to the badge rather than letting Radix drop it to <body>. Only when
  // cancelled in this session, not when it mounted already-cancelled.
  const doneRef = useRef<HTMLDivElement>(null);
  const justCancelled = useRef(false);

  const isCancelling = status === "cancelling";
  const isError = status === "error";

  useEffect(() => {
    if (cancelled && justCancelled.current) {
      doneRef.current?.focus();
      justCancelled.current = false;
    }
  }, [cancelled]);

  const handleCancel = async () => {
    setStatus("cancelling");

    try {
      const result = await cancelReservation({ reservationId });

      if (result.success) {
        justCancelled.current = true;
        setCancelled(true);
        setStatus("idle");
        setOpen(false);
        // Cancelling a READY hold promotes the next person / releases a copy;
        // refresh so the list and any queue positions reflect that.
        router.refresh();
        toast({
          title: "Reservation cancelled",
          description: `Your reservation for “${title}” has been cancelled.`,
        });
      } else {
        setStatus("error");
        toast({
          title: "Couldn't cancel",
          description: result.error ?? "Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.log(error);
      setStatus("error");
      toast({
        title: "Couldn't cancel",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (cancelled) {
    return (
      <div
        ref={doneRef}
        tabIndex={-1}
        className="reservation-card_done"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span>Cancelled</span>
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isCancelling) return; // don't close mid-request
        setOpen(next);
        if (!next) setStatus("idle");
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="reservation-card_cancel"
          aria-label={`Cancel reservation for ${title}`}
        >
          Cancel reservation
        </Button>
      </DialogTrigger>

      <DialogContent
        className="return-book_dialog"
        onInteractOutside={(event) => {
          if (isCancelling) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Cancel this reservation?</DialogTitle>
          <DialogDescription>
            You're about to leave the queue for <strong>“{title}”</strong>. If a
            copy is being held for you it will be released to the next student.
          </DialogDescription>
        </DialogHeader>

        {/* Live region so the request outcome is announced to screen readers. */}
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={isError ? "return-book_error" : "sr-only"}
        >
          {isCancelling
            ? "Cancelling reservation…"
            : isError
              ? "We couldn't cancel this reservation. Please try again."
              : ""}
        </p>

        <DialogFooter className="gap-2 sm:gap-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={isCancelling}>
              Keep reservation
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={isCancelling}
            aria-busy={isCancelling}
          >
            {isCancelling
              ? "Cancelling…"
              : isError
                ? "Try again"
                : "Cancel reservation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CancelReservation;
