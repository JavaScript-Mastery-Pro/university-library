# 0001. Late fines as columns on borrow_records

**Date**: 2026-06-29
**Status**: Proposed

## Context

> ⚠️ Premise note: Two subtle risks in this design deserve upfront acknowledgement.
> First, `BORROW_STATUS_ENUM` never auto-flips to `OVERDUE` without a scheduled job — the
> `status` column stays `BORROWED` until manual return, so "overdue" is a derived condition
> (`dueDate < today AND status != RETURNED`), not a stored state. The borrow-gate query and
> the live-accrual display must use that derived condition rather than trusting the enum.
> Second, storing a finalized `fineAmount` is a deliberate exception to the "compute-at-read"
> principle: the fine must be frozen at return time so that a future rate change cannot
> retroactively alter a settled debt — this is the correct behaviour for financial fairness.

Students regularly return library books late. Without a fine system the library has no
lightweight incentive mechanism, and there is no accurate record of money owed vs forgiven for
admin reporting. The goal of this slice is: compute an accruing fine for overdue books, freeze
it at return time, block students with unsettled obligations from new borrows, and give admins
distinct mark-paid and waive controls.

The existing `borrowRecords` table already holds `dueDate` (a `date` column — no time
component) and `returnDate` (nullable `date`), which are the only inputs needed to compute a
fine. No separate invoice entity is required for a one-fine-per-borrow model. Adding columns
to `borrowRecords` keeps the data co-located with the borrow lifecycle, avoids a join on every
borrow-gate check, and is consistent with the project's "boring tech" posture for a
learning-tier app.

No payment provider is in scope. The `OVERDUE` enum value exists in the schema but is never
written by a scheduled job — "overdue" is inferred at read time. Storing finalized amounts
requires one Drizzle migration; no new infrastructure is needed.

## Options considered

### Option 1: Fine columns on borrow_records (chosen)

Add `fineAmount numeric(10,2)`, `fineStatus fine_status_enum`, and `fineSettledAt timestamptz`
directly to `borrow_records`. Live accrual is a pure function over `dueDate` and today's date;
the result is never stored until the book is returned. At return, `returnBook` calls the shared
pure helper and writes the frozen amount.

**Pros**:
- Zero joins on the borrow-gate check — one WHERE clause over a single table
- One migration, no new tables, consistent with existing schema design
- Fine state and borrow state travel together (same row), simplifying admin queries

**Cons**:
- Cannot represent partial payments or multiple fines per borrow in a future slice (requires a schema migration to split out)

### Option 2: Separate fines table

A `fines` table with a FK to `borrow_records`. Supports multiple charges per borrow (damaged
book fee, lost-book fee) and partial payments.

**Pros**:
- Naturally extensible to payment line-items and partial payments
**Cons**:
- JOIN required on every borrow-gate check and every list view
- Overkill for a single-fine, no-payment-provider scope; adds a table and migration with no immediate payoff

## Decision

**Chosen option**: Option 1 — Fine columns on borrow_records

Store fine state as three columns on `borrow_records`, computed live on read and frozen on return, with a `fine_status` pgEnum for query-safe state representation.

## Rationale

A separate fines table buys extensibility the current scope cannot use (no partial payments, no
multi-charge borrows). The join cost on every borrow-gate check is real and immediate; the
extensibility benefit is deferred. Option 1 is the right answer for this slice.

**RECOMMEND A — `fine_status` pgEnum over scattered booleans.** A single `fine_status` column
with enum values `NONE | UNPAID | PAID | WAIVED` makes gate queries a one-column predicate
(`fineStatus = 'UNPAID'`) and prevents impossible states like `finePaid = true AND fineWaived = true`.
Runner-up: boolean pair (`finePaid`, `fineWaived`) — rejected because it allows invalid states
and produces awkward multi-column WHERE clauses.

**RECOMMEND B — `fines` block inside `lib/config.ts`.** Rate, grace, and cap are domain
constants, not secrets, so they must NOT go in `.env` or be read via `process.env`. A `fines`
block alongside the existing `env` block in `lib/config.ts` follows the project convention that
`config` is the single import for all cross-cutting values. A separate `lib/constants/fines.ts`
file is an equally valid alternative but adds a second import convention with no benefit for a
project this size.

**RECOMMEND C — Finalization in `returnBook` via a shared pure helper.** `returnBook` already
holds the race-safe UPDATE (`WHERE status != 'RETURNED'`). The fine is computed by a pure
exported helper `computeFine(dueDate: string, returnDate: string): number` and written in that
same UPDATE, so the fine is committed atomically with the status flip. The live-accrual display
imports the same helper with `returnDate = today`, guaranteeing the two paths can never
disagree.

**RECOMMEND D — `ceil` rounding, grace-day offset, UTC-midnight day arithmetic.** `dueDate` is
a date string with no time component. Using `dayjs.utc(returnDate).diff(dayjs.utc(dueDate), 'day')`
gives the integer day count. Grace is applied as an offset: `overdueDays = max(0, rawDays - graceDays)`.
`ceil` is correct for accrual (one second into a new day = full day charged, matching physical
library convention). The exact formula: `min(maxFine, overdueDays * ratePerDay)`. `dayjs` is
already imported in `lib/actions/book.ts`; add `import utc from 'dayjs/plugin/utc'` and
`dayjs.extend(utc)` to anchor arithmetic to UTC and avoid DST drift on the date boundary.

**RECOMMEND E — Borrow-gate query in `borrowBook`.** Before inserting a new borrow record,
query `borrowRecords` for `userId` with:
`(fineStatus = 'UNPAID') OR (status != 'RETURNED' AND dueDate < today)`.
The first clause catches finalized unpaid fines; the second catches live-overdue unreturned
books (closing the loophole). Both predicates hit the same table with a covering index on
`(userId, status, dueDate, fineStatus)`.

## Feature design

**Data model sketch**:

New columns on `borrow_records` (add to `database/schema.ts`):

```
fineAmount   numeric(10,2)           nullable  -- null until finalized at return; frozen thereafter
fineStatus   fine_status_enum        not null  default 'NONE'
fineSettledAt timestamp with timezone nullable  -- set when admin marks PAID or WAIVED
```

New pgEnum in `database/schema.ts`:
```
FINE_STATUS_ENUM = pgEnum("fine_status", ["NONE", "UNPAID", "PAID", "WAIVED"])
```

Builds on existing columns: `dueDate date`, `returnDate date nullable`, `status borrow_status_enum`.

**State transitions**:

```
fineStatus = NONE (default)
  → book returned on time (returnDate <= dueDate + graceDays): stays NONE
  → book returned overdue: fineStatus = UNPAID, fineAmount = computeFine(dueDate, returnDate) [frozen]
  → while unreturned and overdue: no DB write — live amount = computeFine(dueDate, today) displayed only
UNPAID
  → admin markFinePaid: fineStatus = PAID, fineSettledAt = now()
  → admin waiveFine:    fineStatus = WAIVED, fineSettledAt = now()
PAID / WAIVED: terminal — no further transitions
```

**API surface**:

| Endpoint/Action | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `returnBook` | action | `recordId` | updated record with frozen `fineAmount`/`fineStatus` | session (ownership check) | not found, not owner, already returned |
| `borrowBook` | action | `userId`, `bookId` | new borrow record | session | no copies, unpaid fine, overdue book |
| `computeFine` (pure helper) | helper | `dueDate: string`, `returnDate: string` | `number` (USD cents-free float) | none | — |
| `getLiveFine` (read path) | helper | `dueDate: string` | `number` (live accrual) | none — called client/server | — |
| `markFinePaid` | admin action | `recordId` | updated record | ADMIN role (admin gate) | record not found, fine not UNPAID |
| `waiveFine` | admin action | `recordId` | updated record | ADMIN role (admin gate) | record not found, fine not UNPAID |

**Key invariants**:

- `fineAmount` is immutable once written at return; a later rate change in config does not alter it
- `fineAmount` never exceeds `config.fines.maxFine` ($20)
- `fineAmount` is `null` (and `fineStatus = NONE`) if returned within grace period
- `computeFine` and the live-accrual display use the exact same formula and are the same function
- `fineStatus = PAID | WAIVED` requires a non-null `fineAmount` (enforced in action, not DB constraint)
- Borrow is blocked iff: any `fineStatus = UNPAID` record for the user OR any `status != RETURNED AND dueDate < today` record for the user

**Security model**:

Users see their own fine amounts via the existing `getBorrowedBooks` query (no new query needed;
columns travel with the record). `markFinePaid` and `waiveFine` live in `lib/admin/actions/book.ts`
and are gated by the admin layout's live DB role check (`role === 'ADMIN'`); no session token
alone suffices. Ownership on `returnBook` already revalidates against `session.user.id`. No
PII or payment data is stored.

**Configuration required**:

Domain constants (not secrets — do NOT put in `.env`). Add a `fines` block to `lib/config.ts`
alongside the existing `env` block:

```ts
fines: {
  ratePerDay: 1.00,   // USD per overdue day
  graceDays: 1,       // first overdue day is free
  maxFine: 20.00,     // USD cap
  currency: "USD",
}
```

**Acceptance criteria**:

- Book returned on or before `dueDate + 1 grace day`: `fineStatus = NONE`, `fineAmount = null`
- Book returned 3 days overdue: `fineAmount = 2.00` (3 days − 1 grace = 2 × $1.00)
- Book returned 25 days overdue: `fineAmount = 20.00` (cap applied)
- Live display for an unreturned book 5 days overdue shows $4.00 (4 chargeable days × $1)
- Admin `markFinePaid` flips status to `PAID`; `waiveFine` flips to `WAIVED`; both set `fineSettledAt`
- `PAID` and `WAIVED` records are distinguishable in admin reports (separate enum values)
- `borrowBook` returns an error when user has any `fineStatus = UNPAID` record
- `borrowBook` returns an error when user has any currently overdue unreturned book
- Rate change in `config.fines` does not alter a previously finalized `fineAmount`

**Critical test scenarios**:

- Happy path: return book 3 days late → `fineAmount = 2.00`, `fineStatus = UNPAID`; admin marks paid → `fineStatus = PAID`, `fineSettledAt` set
- Grace boundary: return exactly on `dueDate + 1` → `fineAmount = null`, `fineStatus = NONE`
- Cap boundary: 22-day overdue return → `fineAmount = 20.00`, not 21.00
- Concurrency: two concurrent `returnBook` calls for the same record → second call hits `WHERE status != 'RETURNED'` guard, returns "already returned" without double-finalizing the fine
- Rate change: finalize a fine at $1/day; change config to $2/day; stored `fineAmount` unchanged
- Overdue gate: user has unreturned book past `dueDate` with `fineStatus = NONE` → `borrowBook` blocked
- Auth: non-admin session calling `markFinePaid`/`waiveFine` → rejected by admin gate; user calling on another user's record → rejected by ownership check

## Consequences

**Positive**:
- Zero new tables; one migration; borrow-gate query is a single-table scan
- `PAID` vs `WAIVED` enum values give admin reports an accurate split of collected vs forgiven revenue
- Fine is frozen at return — rate changes are non-retroactive by construction

**Negative / tradeoffs**:
- `BORROW_STATUS_ENUM.OVERDUE` value is never written by the app without a scheduled job — admins browsing records will see `BORROWED` for overdue books; the enum value is misleading without a cron
- Storing a finalized derived value (`fineAmount`) is a deliberate redundancy; it must be kept consistent with `computeFine` by convention, not DB constraint
- One-fine-per-borrow model cannot represent future charges (damaged book fee) without a schema migration

**Neutral**:
- Requires `npm run db:generate` then `npm run db:migrate` after schema changes
- `types.d.ts` `BorrowRecord` interface must be extended with `fineAmount`, `fineStatus`, `fineSettledAt`
- New admin actions file additions to `lib/admin/actions/book.ts`
- `dayjs/plugin/utc` must be imported in the shared helper to guarantee timezone-safe day arithmetic

## Follow-up

- [ ] If partial payments or multi-charge fines (damaged book, lost book) are added, migrate to a separate `fines` table; the pgEnum and column design here translate directly to FK + status column on that table
- [ ] Add a scheduled Upstash Workflow cron to flip `status` to `OVERDUE` daily so admin dashboards reflect accurate borrow status without relying on derived queries
- [ ] Consider a DB index on `(user_id, fine_status, status, due_date)` in `borrow_records` once borrow volume grows, to keep the gate check sub-millisecond
- [ ] When a payment provider is integrated, extend `fineStatus` with `PROCESSING` and add `paymentReference text` column; no structural change to the existing enum values is needed
