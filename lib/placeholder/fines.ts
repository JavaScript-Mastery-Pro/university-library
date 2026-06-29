import dayjs from "dayjs";

/**
 * PLACEHOLDER late-fine derivation for the UI build (ADR 0001, sub-task #2).
 *
 * This intentionally does NOT read real fine columns or `config.fines` — those
 * arrive in the data-model and API sub-tasks. It derives believable amounts and
 * statuses from the borrow record's existing `dueDate` / `returnDate` / `status`
 * so the fine UI is browsable against current mock/seed data.
 *
 * The data-integration sub-task replaces calls to `getPlaceholderFine` with the
 * stored `record.borrow.fineAmount` / `fineStatus` values.
 */

// Mirrors the constants the ADR will move into `config.fines`.
const RATE_PER_DAY = 1.0; // USD per chargeable overdue day
const GRACE_DAYS = 1; // first overdue day is free
const MAX_FINE = 20.0; // USD cap

const overdueDays = (dueDate: string, asOf: string): number => {
  const raw = dayjs(asOf)
    .startOf("day")
    .diff(dayjs(dueDate).startOf("day"), "day");
  return Math.max(0, raw - GRACE_DAYS);
};

const fineFor = (dueDate: string, asOf: string): number =>
  Math.min(MAX_FINE, overdueDays(dueDate, asOf) * RATE_PER_DAY);

export interface PlaceholderFine {
  status: FineStatus;
  amount: number;
}

export const getPlaceholderFine = (
  borrow: Pick<BorrowRecord, "dueDate" | "returnDate" | "status">
): PlaceholderFine => {
  const { dueDate, returnDate, status } = borrow;

  // Returned book: fine (if any) was frozen at return; show it as settled (PAID)
  // so the "paid" badge is demonstrable in the placeholder UI.
  if (status === "RETURNED" && returnDate) {
    const amount = fineFor(dueDate, returnDate);
    return amount > 0
      ? { status: "PAID", amount }
      : { status: "NONE", amount: 0 };
  }

  // Still out and past the grace period: live, unpaid accrual.
  const amount = fineFor(dueDate, dayjs().format("YYYY-MM-DD"));
  return amount > 0 ? { status: "UNPAID", amount } : { status: "NONE", amount: 0 };
};

export const formatFine = (amount: number): string =>
  amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
