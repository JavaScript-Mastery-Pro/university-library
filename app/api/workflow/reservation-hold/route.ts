import dayjs from "dayjs";
import { and, eq } from "drizzle-orm";
import { serve } from "@upstash/workflow/nextjs";

import { db } from "@/database/drizzle";
import { sendEmail } from "@/lib/workflow";
import config from "@/lib/config";
import { promoteNextOrReleaseCopy } from "@/lib/reservations.server";
import { books, reservations, users } from "@/database/schema";

// Hold-expiry workflow for a READY reservation (ADR 0002 RECOMMEND B). Triggered
// by `promoteNextOrReleaseCopy` the moment a QUEUED reservation is promoted to
// READY. Mirrors `/api/workflow/borrow-book`: staged `context.run` emails with
// `context.sleep` between them, ending in an atomic expire + promote.
//
// Flow: READY email → sleep to the reminder mark → expiry-soon email → sleep to
// window end → guarded READY→EXPIRED UPDATE + promote next (or release the copy).
//
// The enum can lie (invariant #3): by the time each step runs the user may have
// already borrowed (FULFILLED) or cancelled (CANCELLED) the hold. Every step
// re-reads the live status and bails out early, and the final expiry is a
// guarded UPDATE (RECOMMEND G) so it only fires — and only frees the copy —
// when the row is still genuinely READY.

type ReservationHoldData = {
  reservationId: string;
  userId: string;
  bookId: string;
  // ISO string; the moment the hold lapses (now + holdWindowHours at promotion).
  expiresAt: string;
};

async function getReservationStatus(reservationId: string) {
  const [reservation] = await db
    .select({ status: reservations.status })
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1);

  return reservation?.status ?? null;
}

async function getBookTitle(bookId: string) {
  const [book] = await db
    .select({ title: books.title })
    .from(books)
    .where(eq(books.id, bookId))
    .limit(1);

  return book?.title ?? "your reserved book";
}

async function getUserDetails(userId: string) {
  const [user] = await db
    .select({ fullname: users.fullname, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user;
}

export const { POST } = serve<ReservationHoldData>(async (context) => {
  const { reservationId, userId, bookId, expiresAt } =
    context.requestPayload;

  console.log("RESERVATION HOLD:", reservationId, userId, bookId, expiresAt);

  const user = await getUserDetails(userId);
  if (!user) return;

  const { fullname, email } = user;
  const title = await getBookTitle(bookId);

  const { holdWindowHours, reminderBeforeHours } = config.reservations;

  // Sleep durations anchored to the passed `expiresAt` so the reminder lands at
  // exactly `reminderBeforeHours` remaining and the expiry at the window end,
  // regardless of trigger latency. Clamped to 0 so a late trigger never sleeps
  // negative.
  const expiry = dayjs(expiresAt);
  const reminderAt = expiry.subtract(reminderBeforeHours, "hour");
  const secsToReminder = Math.max(0, reminderAt.diff(dayjs(), "second"));
  const secsToExpiry = Math.max(0, expiry.diff(reminderAt, "second"));

  // 1. A copy is held — tell the user it's ready and how long they have.
  await context.run("send-ready-email", async () => {
    await sendEmail({
      email,
      subject: `📚 "${title}" is ready for you to borrow`,
      message: `Hi ${fullname},\n\nGood news — a copy of "${title}" is now held for you. You have ${holdWindowHours} hours to borrow it before the hold is released to the next person in line. Head to the library app to borrow it now.`,
    });
  });

  // 2. Wait until the reminder mark (window end − reminderBeforeHours).
  await context.sleep("wait-for-reminder", secsToReminder);

  // The user may have already borrowed or cancelled — only nudge a live hold.
  const statusAtReminder = await context.run("check-status-at-reminder", () =>
    getReservationStatus(reservationId)
  );
  if (statusAtReminder !== "READY") return;

  // 3. Expiry-soon reminder.
  await context.run("send-expiry-soon-email", async () => {
    await sendEmail({
      email,
      subject: `⏳ Your hold on "${title}" expires soon`,
      message: `Hi ${fullname},\n\nThis is a reminder that your hold on "${title}" expires in ${reminderBeforeHours} hours. Borrow it before then or it will be released to the next person waiting.`,
    });
  });

  // 4. Wait out the rest of the window.
  await context.sleep("wait-for-window-end", secsToExpiry);

  // 5. Atomically expire the hold and free the copy. The guarded UPDATE only
  // matches a row still READY — if the user borrowed (FULFILLED) or cancelled
  // (CANCELLED) in the meantime it affects zero rows and we leave inventory
  // alone. Promotion happens only when WE were the one to expire it, so the
  // held copy is handed on exactly once (invariant #10).
  await context.run("expire-and-promote", async () => {
    const [expired] = await db
      .update(reservations)
      .set({ status: "EXPIRED" })
      .where(
        and(
          eq(reservations.id, reservationId),
          eq(reservations.status, "READY")
        )
      )
      .returning();

    if (!expired) return;

    await promoteNextOrReleaseCopy(bookId);
  });
});
