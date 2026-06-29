import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

import config from "./config";

// Anchor all day arithmetic to UTC so the date-boundary diff is immune to DST
// drift and the server's local timezone (ADR 0001, RECOMMEND D). `dueDate` and
// `returnDate` are `date` strings (no time component) read back from Postgres as
// ISO `YYYY-MM-DD`, which dayjs.utc parses as UTC midnight.
dayjs.extend(utc);

/**
 * Pure late-fine formula (ADR 0001). The single source of truth for both the
 * finalized amount frozen in `returnBook` and the live accrual shown in the UI,
 * so the two paths can never disagree.
 *
 *   overdueDays = max(0, daysLate - graceDays)
 *   fine        = min(maxFine, overdueDays * ratePerDay)
 *
 * `ceil` on the raw diff matches physical-library convention: any part of a new
 * day counts as a full chargeable day.
 */
export function computeFine(dueDate: string, returnDate: string): number {
  const { ratePerDay, graceDays, maxFine } = config.fines;

  const rawDays = Math.ceil(
    dayjs.utc(returnDate).diff(dayjs.utc(dueDate), "day", true)
  );

  // An unparseable date yields a NaN diff; never let that freeze a NaN debt
  // onto a record or render as the live amount — treat it as "no fine".
  if (!Number.isFinite(rawDays)) return 0;

  // Returned within grace (or early) → overdueDays clamps to 0 → no fine.
  const overdueDays = Math.max(0, rawDays - graceDays);

  // Clamp to the cap first, then round to whole cents. This makes computeFine
  // the single authoritative amount: the value frozen at return and the live
  // accrual are identical to the cent, and a fractional `ratePerDay` (e.g.
  // 0.25) can't leak binary-float drift (0.1 * 3 = 0.30000000000000004) into a
  // stored debt or a comparison.
  const capped = Math.min(maxFine, overdueDays * ratePerDay);
  return Math.round(capped * 100) / 100;
}

/**
 * Live accrual for an unreturned book: the same formula as `computeFine`, with
 * "today" standing in for the return date. Never written to the DB — display
 * only (ADR 0001 state transitions).
 */
export function getLiveFine(dueDate: string): number {
  return computeFine(dueDate, dayjs.utc().format("YYYY-MM-DD"));
}

export interface FineDisplay {
  status: FineStatus;
  amount: number;
}

/**
 * Resolve the fine to show for a borrow record (ADR 0001). The single read-side
 * derivation for both the profile list and the admin table, replacing the
 * build-time placeholder.
 *
 * Precedence:
 *  1. A non-NONE `fineStatus` is authoritative — the fine was frozen at return
 *     (UNPAID) or settled by an admin (PAID/WAIVED); show the stored amount.
 *  2. Otherwise, a book still out accrues live: compute today's amount and show
 *     it as UNPAID until return freezes it. Never written back here.
 *  3. Anything else (returned within grace, never overdue) → NONE.
 */
export function getFineDisplay(
  borrow: Pick<
    BorrowRecord,
    "dueDate" | "status" | "fineAmount" | "fineStatus"
  >
): FineDisplay {
  if (borrow.fineStatus !== "NONE") {
    return {
      status: borrow.fineStatus,
      amount: borrow.fineAmount ? Number(borrow.fineAmount) : 0,
    };
  }

  if (borrow.status !== "RETURNED") {
    const amount = getLiveFine(borrow.dueDate);
    return amount > 0
      ? { status: "UNPAID", amount }
      : { status: "NONE", amount: 0 };
  }

  return { status: "NONE", amount: 0 };
}

/** Render a fine amount as a localized currency string for the UI. */
export function formatFine(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: config.fines.currency,
  });
}

/**
 * Spoken form of a fine amount for screen-reader-only labels. Uses
 * `currencyDisplay: "name"` so the currency is spelled out as words (e.g.
 * "5.00 US dollars") instead of a "$" glyph, whose pronunciation depends on the
 * assistive tech's symbol dictionary and can be dropped or misread.
 */
export function formatFineSpoken(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: config.fines.currency,
    currencyDisplay: "name",
  });
}
