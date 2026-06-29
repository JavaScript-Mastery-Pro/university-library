import dayjs from "dayjs";

import config from "@/lib/config";

// Pure reservation display helpers (ADR 0002). These are real, reusable logic —
// the reservations data-integration sub-task swaps the *data* source, not these.
//
// ADR 0002 invariant #3: a READY reservation past `expiresAt` is treated as
// EXPIRED everywhere (the enum can lie if a hold-expiry workflow run is lost).
// `getEffectiveStatus` is the single place that applies that read-time check, so
// every consumer (badge, button visibility, queue position) stays consistent.

type Tone = "queued" | "ready" | "expired" | "cancelled" | "fulfilled";

interface ReservationDisplay {
  /** Effective status after the read-time expiry check. */
  status: ReservationStatus;
  /** Concise visible label for the badge. */
  label: string;
  /** Spelled-out label for screen readers. */
  srLabel: string;
  /** Maps to a colour pairing in the badge component. */
  tone: Tone;
  /** True only for a live READY hold the user can act on. */
  isActionable: boolean;
}

/** A READY hold whose window has already elapsed (but not yet flipped by the workflow). */
export const isHoldExpired = (reservation: Reservation): boolean =>
  reservation.status === "READY" &&
  reservation.expiresAt != null &&
  dayjs(reservation.expiresAt).isBefore(dayjs());

/**
 * The status to trust at read time. A READY hold past its window is EXPIRED
 * regardless of the stored enum (ADR 0002 invariant #3).
 */
export const getEffectiveStatus = (
  reservation: Reservation
): ReservationStatus =>
  isHoldExpired(reservation) ? "EXPIRED" : reservation.status;

/** A reservation still occupying a place in the queue (waiting or holding a copy). */
export const isActiveReservation = (reservation: Reservation): boolean => {
  const status = getEffectiveStatus(reservation);
  return status === "QUEUED" || status === "READY";
};

/**
 * Human-readable time remaining on a READY hold, e.g. "2 days left" or
 * "5 hours left". Returns null when there is no live hold window.
 */
export const formatHoldTimeLeft = (
  reservation: Reservation
): string | null => {
  if (getEffectiveStatus(reservation) !== "READY" || !reservation.expiresAt) {
    return null;
  }

  const now = dayjs();
  const expiry = dayjs(reservation.expiresAt);
  const hours = expiry.diff(now, "hour");

  if (hours <= 0) return "less than an hour left";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} left`;

  const days = expiry.diff(now, "day");
  return `${days} day${days === 1 ? "" : "s"} left`;
};

/** "You're 3rd in line", "You're next in line" — null when not waiting in queue. */
export const getQueuePositionLabel = (
  queuePosition: number | null
): string | null => {
  if (queuePosition == null || queuePosition < 1) return null;
  if (queuePosition === 1) return "You're next in line";

  const ordinals = ["th", "st", "nd", "rd"];
  const v = queuePosition % 100;
  const suffix = ordinals[(v - 20) % 10] || ordinals[v] || ordinals[0];
  return `You're ${queuePosition}${suffix} in line`;
};

/** Badge label, tone and screen-reader text for a reservation. */
export const getReservationDisplay = (
  reservation: Reservation
): ReservationDisplay => {
  const status = getEffectiveStatus(reservation);

  switch (status) {
    case "READY":
      return {
        status,
        label: "Ready to borrow",
        srLabel:
          "A copy is held for you — ready to borrow within the next " +
          `${config.reservations.holdWindowHours} hours`,
        tone: "ready",
        isActionable: true,
      };
    case "QUEUED":
      return {
        status,
        label: "In queue",
        srLabel: "Reservation queued — waiting for a copy to be returned",
        tone: "queued",
        isActionable: false,
      };
    case "EXPIRED":
      return {
        status,
        label: "Hold expired",
        srLabel: "Reservation hold expired before the book was borrowed",
        tone: "expired",
        isActionable: false,
      };
    case "FULFILLED":
      return {
        status,
        label: "Borrowed",
        srLabel: "Reservation fulfilled — book borrowed",
        tone: "fulfilled",
        isActionable: false,
      };
    case "CANCELLED":
    default:
      return {
        status: "CANCELLED",
        label: "Cancelled",
        srLabel: "Reservation cancelled",
        tone: "cancelled",
        isActionable: false,
      };
  }
};
