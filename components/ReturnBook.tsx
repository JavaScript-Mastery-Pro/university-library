"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

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
import { returnBook } from "@/lib/actions/book";

interface Props {
  recordId: string;
  // Kept for the borrowed-book card; the action derives the book from the
  // record itself, so bookId isn't sent to returnBook.
  bookId: string;
  title: string;
  // True when the borrow record already has status === "RETURNED".
  initialReturned?: boolean;
}

type Status = "idle" | "returning" | "error";

const ReturnBook = ({ recordId, title, initialReturned }: Props) => {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [returned, setReturned] = useState(Boolean(initialReturned));

  // On success the dialog closes and its trigger unmounts (replaced by the
  // "Returned" badge), so Radix's focus-return would drop focus to <body>.
  // Move focus to the badge instead — but only when the user returns it in this
  // session, not when the row mounted already-returned.
  const doneRef = useRef<HTMLDivElement>(null);
  const justReturned = useRef(false);

  const isReturning = status === "returning";
  const isError = status === "error";

  useEffect(() => {
    if (returned && justReturned.current) {
      doneRef.current?.focus();
      justReturned.current = false;
    }
  }, [returned]);

  const handleReturn = async () => {
    setStatus("returning");

    try {
      const result = await returnBook({ recordId });

      if (result.success) {
        justReturned.current = true;
        setReturned(true);
        setStatus("idle");
        setOpen(false);
        toast({
          title: "Book returned",
          description: `“${title}” has been returned.`,
        });
      } else {
        setStatus("error");
        toast({
          title: "Return failed",
          description: result.error ?? "Couldn't return this book.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.log(error);
      setStatus("error");
      toast({
        title: "Return failed",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (returned) {
    return (
      <div
        ref={doneRef}
        tabIndex={-1}
        className="return-book_done"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <Image
          src="/icons/tick.svg"
          alt=""
          aria-hidden="true"
          width={18}
          height={18}
        />
        <span>Returned</span>
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Don't let the dialog close mid-request.
        if (isReturning) return;
        setOpen(next);
        if (!next) setStatus("idle");
      }}
    >
      <DialogTrigger asChild>
        <Button
          className="return-book_btn"
          aria-label={`Return book: ${title}`}
        >
          <Image
            src="/icons/book.svg"
            alt=""
            aria-hidden="true"
            width={18}
            height={18}
          />
          Return book
        </Button>
      </DialogTrigger>

      <DialogContent
        className="return-book_dialog"
        onInteractOutside={(event) => {
          if (isReturning) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Return this book?</DialogTitle>
          <DialogDescription>
            You're about to return <strong>“{title}”</strong>. This frees up a
            copy for other students and can't be undone here.
          </DialogDescription>
        </DialogHeader>

        {/* Live region so the request outcome is announced to screen readers. */}
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={isError ? "return-book_error" : "sr-only"}
        >
          {isReturning
            ? "Returning book…"
            : isError
              ? "We couldn't return this book. Please try again."
              : ""}
        </p>

        <DialogFooter className="gap-2 sm:gap-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={isReturning}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={handleReturn}
            disabled={isReturning}
            aria-busy={isReturning}
          >
            {isReturning
              ? "Returning…"
              : isError
                ? "Try again"
                : "Confirm return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReturnBook;
